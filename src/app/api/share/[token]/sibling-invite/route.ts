/**
 * Ticket 0060 — POST /api/share/[token]/sibling-invite.
 *
 * Public route (token-scoped). Accepts the form payload the new
 * SiblingInviteCard sheet sends:
 *   { siblingFirstName: string, otherCoachEmail: string, note?: string }
 * Validates, resolves the parent's source player + program, dedupes the
 * 30-day window on `(from_share_token, to_coach_email)`, enforces a
 * rolling 7-day rate-limit of 3 invites per share token, writes ONE row
 * to `parent_initiated_invites` and sends ONE email through the existing
 * `sendEmail()`.
 *
 * Responses:
 *   200 { sent: true } — happy path.
 *   200 { sent: false, reason: 'already-invited' } — dedupe path.
 *   400 — malformed JSON / missing/invalid fields / note > 200.
 *   404 — tampered or unknown token.
 *   429 { reason: 'rate-limited' } — 4th invite in 7 days.
 *
 * NOT tier-gated — the route does not import `@/lib/tier`. The loop must
 * stay open: a free coach's parent sees the same surface as a paid
 * coach's parent.
 *
 * COPPA: the persisted row carries NO parent_email, NO parent_phone, NO
 * date_of_birth, NO sibling last name. The route strips the parent-typed
 * sibling first name to its first space-delimited token before persisting
 * (defense-in-depth: a malformed payload trying to inject a last name
 * gets stripped server-side too).
 */
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import {
  buildSiblingInviteEmail,
  checkSiblingInviteRate,
  firstNameOnly,
  isValidEmailShape,
} from '@/lib/sibling-invite-utils';
import { makeReferralCode } from '@/lib/referral-code';

const APP_URL_DEFAULT = 'https://youthsportsiq.com';
const DEDUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required.' }, { status: 400 });
  }

  // Parse — a malformed body returns 400 immediately.
  let body: {
    siblingFirstName?: string;
    otherCoachEmail?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  // The parent-typed sibling first name is stripped to its first space-
  // delimited token here too, NOT only in the candidate-lookup route.
  // Defense in depth — a forged payload trying to inject "Sofia Walker"
  // into the email body still ends up storing "Sofia".
  const siblingFirstName = firstNameOnly(body.siblingFirstName ?? '') ?? '';
  const otherCoachEmail = (body.otherCoachEmail ?? '').trim();
  const note = body.note?.trim() || null;

  if (!siblingFirstName) {
    return NextResponse.json({ error: "The sibling's first name is required." }, { status: 400 });
  }
  if (!isValidEmailShape(otherCoachEmail)) {
    return NextResponse.json({ error: "The other coach's email is required." }, { status: 400 });
  }
  if (note && note.length > 200) {
    return NextResponse.json({ error: 'Note is too long.' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // 1) Resolve the share row.
  const { data: share } = await admin
    .from('parent_shares')
    .select('id, player_id, team_id, coach_id, is_active, expires_at')
    .eq('share_token', token)
    .eq('is_active', true)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'Share link not found or inactive.' }, { status: 404 });
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired.' }, { status: 410 });
  }

  // 2) Source player — needed for the row's `from_player_id` audit field
  //    and for the parent's first name (the parent_name column carries it).
  const { data: sourcePlayer } = await admin
    .from('players')
    .select('id, name, team_id, parent_name')
    .eq('id', share.player_id)
    .single();

  // 3) Source team's name + org_id for the email's "<sibling's team>"
  //    framing and for the program-scoped referral code.
  const { data: sourceTeam } = await admin
    .from('teams')
    .select('id, name, org_id')
    .eq('id', share.team_id)
    .single();

  const programId = sourceTeam?.org_id ?? null;

  // 4) Program name (best-effort — a missing slug degrades to null).
  let programName: string | null = null;
  if (programId) {
    const { data: org } = await admin
      .from('organizations')
      .select('id, name')
      .eq('id', programId)
      .single();
    programName = org?.name ?? null;
  }

  // 5) Dedupe — has this same (token, coach email) been invited in the last
  //    30 days? If yes, return 200 with `sent: false`.
  const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
  const { data: prior } = await admin
    .from('parent_initiated_invites')
    .select('id, sent_at')
    .eq('from_share_token', token)
    .ilike('to_coach_email', otherCoachEmail)
    .gte('sent_at', dedupSince)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior) {
    return NextResponse.json({ sent: false, reason: 'already-invited' });
  }

  // 6) Rate limit — count invites from this token in the rolling 7-day
  //    window. We check the DB count (durable across restarts) AND a
  //    per-process in-memory cap (cheap defense in depth).
  const rateSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rateRows } = await admin
    .from('parent_initiated_invites')
    .select('id')
    .eq('from_share_token', token)
    .gte('sent_at', rateSince);

  if ((rateRows ?? []).length >= 3) {
    return NextResponse.json({ sent: false, reason: 'rate-limited' }, { status: 429 });
  }

  const rate = checkSiblingInviteRate(token);
  if (!rate.allowed) {
    return NextResponse.json({ sent: false, reason: 'rate-limited' }, { status: 429 });
  }

  // 7) Referral code — derived from the PROGRAM (org_id) NOT the parent
  //    or the inviting coach. The program owns the referral; the parent
  //    never receives a referral credit per the AC.
  const referralCode = programId ? makeReferralCode(programId) : '';

  // 8) Insert the dedupe row. Allow-listed columns ONLY.
  const insertPayload: Record<string, unknown> = {
    from_share_token: token,
    from_player_id: share.player_id,
    to_coach_email: otherCoachEmail,
    sibling_first_name: siblingFirstName,
    program_id: programId,
    referral_code: referralCode,
  };
  const { error: insertErr } = await admin
    .from('parent_initiated_invites')
    .insert(insertPayload);
  if (insertErr) {
    console.error('[sibling-invite] insert error:', insertErr);
    return NextResponse.json(
      { sent: false, reason: 'insert-failed' },
      { status: 500 },
    );
  }

  // 9) Build the parent-voiced email. Parent first name comes from the
  //    seeded `players.parent_name` field with a fallback to a generic
  //    salutation (the recipient still gets the coach-email signal from
  //    the From header, not the body).
  const parentFirstName = firstNameOnly(sourcePlayer?.parent_name ?? '') ?? 'A parent';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || APP_URL_DEFAULT;
  const referralUrl = referralCode && programId
    ? `${appUrl}/?ref=${referralCode}&program=${programId}`
    : `${appUrl}/`;

  const email = buildSiblingInviteEmail({
    parentFirstName,
    siblingFirstName,
    siblingTeamName: sourceTeam?.name ?? 'their team',
    programName,
    referralUrl,
    note,
  });

  const sendResult = await sendEmail({
    to: otherCoachEmail,
    subject: email.subject,
    html: email.html,
  });
  if (!sendResult.success) {
    // Row is written; we surface success:true so the UI flips state. The
    // next attempt within 30 days dedupes (no re-send), which keeps the
    // sending-domain reputation safe.
    console.error('[sibling-invite] sendEmail failed:', sendResult.error);
  }

  return NextResponse.json({ sent: true });
}
