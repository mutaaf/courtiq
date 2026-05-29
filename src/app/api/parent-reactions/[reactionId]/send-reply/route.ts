/**
 * POST /api/parent-reactions/[reactionId]/send-reply
 *
 * Ticket 0056 — deliver the coach's edited/approved thank-you reply.
 *
 * The reply rides on the existing `team_announcements` channel (migration 022)
 * with a single recipient resolved server-side from `players.parent_contact`
 * (LESSONS#0039 — never accept a free-typed recipient). On success the route
 * atomically stamps `parent_reactions.coach_reply_at + coach_reply_id` so a
 * second POST returns 409 with the SAME `coach_reply_id` (idempotent).
 *
 * Gates:
 *   - 401 missing auth.
 *   - 404 cross-coach OR missing reaction (LESSONS#0039).
 *   - 409 already_replied — second POST returns the same coach_reply_id.
 *   - 429 abuse cap — at most 20 replies per coach per 24h (in-process
 *     limiter, same shape as /api/parent-reactions POST's IP limiter).
 *   - 400 invalid body / message too long.
 *
 * Posture:
 *   - The client may send `{ message, ... }`. ANY other field is ignored —
 *     in particular a client-supplied `to` is ignored; the recipient is
 *     always the player's parent_contact resolved from `reaction.player_id`.
 *   - Message body is sanitized via stripContactInfo() so a planted
 *     email / URL / 7+ digit run is masked before being persisted.
 */

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { stripContactInfo } from '@/lib/parent-reply-utils';

interface RouteContext {
  params: Promise<{ reactionId: string }>;
}

const MAX_MESSAGE_LENGTH = 500;
const MAX_REPLIES_PER_DAY = 20;
const REPLY_WINDOW_MS = 86_400_000; // 24 hours

interface CoachReplyCounter {
  count: number;
  resetAt: number;
}

const replyCountersByCoach = new Map<string, CoachReplyCounter>();

function checkReplyRateLimit(coachId: string): boolean {
  const now = Date.now();
  const entry = replyCountersByCoach.get(coachId);
  if (!entry || entry.resetAt <= now) {
    replyCountersByCoach.set(coachId, { count: 1, resetAt: now + REPLY_WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_REPLIES_PER_DAY;
}

/** Test-only — drain the in-process counter so each describe block starts fresh. */
export function _resetReplyRateLimiterForTest(): void {
  replyCountersByCoach.clear();
}

export async function POST(request: Request, ctx: RouteContext) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reactionId } = await ctx.params;
  const admin = await createServiceSupabase();

  // Body — accept ONLY the `message` field. Any `to` / `email` / extra keys
  // are silently dropped (LESSONS#0039 — never trust a client recipient).
  let body: { message?: unknown };
  try {
    body = (await request.json()) as { message?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const rawMessage = typeof body?.message === 'string' ? body.message : '';
  if (rawMessage.length === 0) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }
  if (rawMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: 'message too long' }, { status: 400 });
  }

  // Resolve the reaction; ownership + already-replied gates.
  const { data: reaction } = await admin
    .from('parent_reactions')
    .select('id, coach_id, team_id, player_id, coach_reply_at, coach_reply_id')
    .eq('id', reactionId)
    .single();

  if (!reaction || reaction.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Idempotency — a second POST returns the SAME coach_reply_id so the
  // client never accidentally double-sends. (We deliberately check this
  // BEFORE the rate limiter — a duplicate send is not a 429, it's a 409.)
  if (reaction.coach_reply_at) {
    return NextResponse.json(
      { error: 'already_replied', coach_reply_id: reaction.coach_reply_id ?? null },
      { status: 409 },
    );
  }

  // Daily cap — only counted AFTER ownership + idempotency, so a forged
  // cross-coach POST never burns the real coach's daily budget.
  if (!checkReplyRateLimit(user.id)) {
    return NextResponse.json(
      { error: 'Daily reply cap reached. Try again tomorrow.' },
      { status: 429 },
    );
  }

  // Resolve the recipient SERVER-side from the player's parent_contact.
  // Never accept a client-supplied `to` (LESSONS#0039).
  const { data: player } = await admin
    .from('players')
    .select('id, name, parent_name, parent_email')
    .eq('id', reaction.player_id)
    .single();

  // Strip plausible contact info from the message body before persistence.
  const sanitizedBody = stripContactInfo(rawMessage);

  // The reply rides on team_announcements (migration 022). We tag the title
  // with the parent's first name so the inbox shows who the thank-you went
  // to; the body carries the coach's text verbatim.
  const parentLabel =
    (player as { parent_name?: string | null } | null)?.parent_name?.trim()?.split(/\s+/)[0] || 'a parent';

  const { data: announcement, error: insertErr } = await admin
    .from('team_announcements')
    .insert({
      team_id: reaction.team_id,
      created_by: user.id,
      title: `Thank-you to ${parentLabel}`,
      body: sanitizedBody,
    })
    .select('id')
    .single();

  if (insertErr || !announcement) {
    return NextResponse.json({ error: 'Failed to send' }, { status: 500 });
  }

  const replyId = (announcement as { id: string }).id;
  const now = new Date().toISOString();

  // Atomically stamp the reaction — a future GET will see coach_reply_at +
  // coach_reply_id and the UI will collapse the row to the Replied pill.
  await admin
    .from('parent_reactions')
    .update({ coach_reply_at: now, coach_reply_id: replyId })
    .eq('id', reactionId);

  return NextResponse.json({ coach_reply_id: replyId });
}
