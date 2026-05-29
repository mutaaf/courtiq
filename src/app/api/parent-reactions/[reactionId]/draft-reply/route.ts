/**
 * POST /api/parent-reactions/[reactionId]/draft-reply
 *
 * Ticket 0056 — generate a one-line AI draft thank-you the coach previews
 * before sending. The route's job is to PRODUCE a draft, never to send.
 *
 * Auth + ownership:
 *   - 401 when no authed user.
 *   - 404 when the reaction doesn't exist OR belongs to another coach (no
 *     cross-coach reply; LESSONS#0039 — never trust client-supplied scope).
 *   - 409 already_replied when reaction.coach_reply_at is set (the coach
 *     can only reply once per reaction).
 *
 * Tier gating:
 *   - Paid (`coach` / `pro_coach` / `organization`) coaches get the AI draft
 *     via callAI() with the parentReactionReply prompt. orgId is threaded
 *     so quota counting + multi-provider failover (ticket 0012) work.
 *   - Free coaches (or any coach who lacks the `feature_ai_reply_draft`
 *     tier feature) get the static template fallback — NOT a 402. The
 *     SEND path stays universal so a free coach can always reply.
 *
 * Response shape (deep-equality contract, LESSONS#0078):
 *   { draft: string }
 *
 * COPPA: only first names (player + parent + coach) + the parent's freely-
 * typed reaction note are passed to the model. Last names, email, phone, DOB,
 * and observations are never read or passed.
 */

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAI } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { canAccess, type Tier } from '@/lib/tier';
import { buildStaticReplyTemplate } from '@/lib/parent-reply-utils';

interface RouteContext {
  params: Promise<{ reactionId: string }>;
}

function firstNameOf(fullName: string | null | undefined): string {
  return (fullName ?? '').trim().split(/\s+/)[0] ?? '';
}

export async function POST(_request: Request, ctx: RouteContext) {
  // 1. Auth — fail fast before touching the DB.
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { reactionId } = await ctx.params;
  const admin = await createServiceSupabase();

  // 2. Resolve the reaction; ownership + already-replied gates.
  const { data: reaction } = await admin
    .from('parent_reactions')
    .select('id, coach_id, team_id, player_id, message, parent_name, coach_reply_at, coach_reply_id')
    .eq('id', reactionId)
    .single();

  // Cross-coach + missing-row both collapse to 404 (LESSONS#0039 — do not
  // leak the existence of another coach's reaction to a forged caller).
  if (!reaction || reaction.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (reaction.coach_reply_at) {
    return NextResponse.json(
      { error: 'already_replied', coach_reply_id: reaction.coach_reply_id ?? null },
      { status: 409 },
    );
  }

  // 3. Resolve the three first names for the prompt + the static template.
  const { data: playerRow } = await admin
    .from('players')
    .select('id, name')
    .eq('id', reaction.player_id)
    .single();

  const { data: coachRow } = await admin
    .from('coaches')
    .select('id, full_name, org_id, organizations(tier)')
    .eq('id', user.id)
    .single();

  const playerFirstName = firstNameOf(playerRow?.name ?? null) || 'your kid';
  const parentFirstName = firstNameOf(reaction.parent_name) || 'there';
  const coachFirstName = firstNameOf((coachRow as { full_name?: string | null } | null)?.full_name ?? null) || 'Coach';

  const orgId = (coachRow as { org_id?: string | null } | null)?.org_id ?? '';
  const tier = (((coachRow as { organizations?: { tier?: string } | null } | null)?.organizations?.tier) || 'free') as Tier;

  // 4. Tier gate (server-side, paired with <UpgradeGate feature="feature_ai_reply_draft">
  //    on the surface — per LESSONS#0023 the prop value EQUALS the tier key
  //    exactly). Free coaches DO NOT 402 — they fall to the static template
  //    so a free coach can still reply. The SEND path is unconditional.
  if (!canAccess(tier, 'feature_ai_reply_draft')) {
    return NextResponse.json({
      draft: buildStaticReplyTemplate({
        parentFirstName,
        playerFirstName,
        coachFirstName,
      }),
    });
  }

  // 5. AI happy path. Quota / provider routing handled by callAI; on a
  //    transient quota or provider failure we degrade to the static template
  //    rather than blocking the coach (the coach must always be able to reply).
  try {
    const prompt = PROMPT_REGISTRY.parentReactionReply({
      playerFirstName,
      parentFirstName,
      reactionNote: reaction.message ?? '',
      coachFirstName,
    });

    const result = await callAI(
      {
        coachId: user.id,
        teamId: reaction.team_id ?? undefined,
        interactionType: 'custom',
        systemPrompt: prompt.system,
        userPrompt: prompt.user,
        orgId,
        maxTokens: 240,
        temperature: 0.6,
      },
      admin,
    );

    const draft = (result.text ?? '').trim() || buildStaticReplyTemplate({
      parentFirstName,
      playerFirstName,
      coachFirstName,
    });

    return NextResponse.json({ draft });
  } catch {
    // Quota / provider outage / transient error — never block the coach.
    return NextResponse.json({
      draft: buildStaticReplyTemplate({
        parentFirstName,
        playerFirstName,
        coachFirstName,
      }),
    });
  }
}
