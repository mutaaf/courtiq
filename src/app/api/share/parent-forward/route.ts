/**
 * Ticket 0079 — POST /api/share/parent-forward.
 *
 * Public route. The parent-portal share token IS the contract (no
 * auth required) — the route inherits the SAME consent posture as
 * the existing /share/[token] page (LESSONS#0096 — read the existing
 * shape at pickup).
 *
 * Payload:
 *   { shareToken, recipientPlayerId, senderFirstName, note }
 *
 * Behavior — happy path:
 *   1. Resolve the sender's player + team via parent_shares (token).
 *   2. Read the recipient player by id; verify it belongs to the SAME
 *      team_id (in-team contract).
 *   3. Read the recipient's parent_email server-side; reject if absent.
 *   4. Check parent_forward_signals for a prior edge in the 7-day
 *      window — if present, return 429 already_sent (idempotency).
 *   5. Mint a NEW parent_shares row for the RECIPIENT's player
 *      (mirrors /api/share/create — same column posture).
 *   6. Dispatch ONE email via sendEmail() — best-effort
 *      (LESSONS#0036): a mail-pipeline failure still writes the
 *      signal row.
 *   7. Write ONE row to parent_forward_signals (UNIQUE constraint on
 *      (sender_player_id, recipient_player_id) is the durable
 *      idempotency gate).
 *
 * Responses:
 *   200 { ok: true } — happy path.
 *   400 { error: 'invalid_share_token' } — token lookup miss.
 *   400 { error: 'not_on_same_team' } — recipient lives on a different
 *        team.
 *   400 { error: 'no_parent_email_on_file' } — recipient row has no
 *        parent_email (the candidate-lookup UI pre-filters; the
 *        server-side check is defense in depth).
 *   429 { error: 'already_sent' } — prior signal row found in the 7-day
 *        window.
 *
 * NOT tier-gated — the parent-portal surface is the only product
 * surface not gated by tier (read at pickup per LESSONS#0096); mirror
 * that posture. The route does not import @/lib/tier and does not
 * call canAccess.
 *
 * COPPA: the response NEVER returns the sender's OR the recipient's
 * parent_email. The signal row stores ONLY player-id edges +
 * team_id; never a name, an email, a phone, the note text, or the
 * subject line.
 *
 * publicPaths: /api/share/ is already in the middleware allow-list
 * (the entire share API surface is public), so a separate entry is
 * not required (LESSONS#0058).
 *
 * .test.ts file: tests/api/share-parent-forward.test.ts.
 */
import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { buildParentForwardEmail } from '@/lib/parent-forward-email';

const APP_URL_DEFAULT = 'https://youthsportsiq.com';
const IDEMPOTENCY_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const SENDER_FIRST_NAME_MAX = 30;
const NOTE_MAX = 200;
// Per LESSONS#0061 — defensive sanitizers use literal character
// classes, never `\s+` shorthand that conflates newlines + spaces.
const SENDER_FIRST_NAME_RE = /^[A-Za-z][A-Za-z'\-]*$/;

export async function POST(request: Request) {
  // Parse — a malformed body returns 400 immediately.
  let body: {
    shareToken?: string;
    recipientPlayerId?: string;
    senderFirstName?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  const shareToken = (body.shareToken ?? '').trim();
  const recipientPlayerId = (body.recipientPlayerId ?? '').trim();
  const senderFirstName = (body.senderFirstName ?? '').trim();
  // Strip inline HTML tags from the note BEFORE the length check so a
  // payload trying to smuggle 200 chars of `<script>` plus visible
  // text still gets bounded.
  const rawNote = (body.note ?? '').replace(/<[^>]*>/g, '').trim();

  if (!shareToken) {
    return NextResponse.json({ error: 'shareToken_required' }, { status: 400 });
  }
  if (!recipientPlayerId) {
    return NextResponse.json({ error: 'recipientPlayerId_required' }, { status: 400 });
  }
  if (!senderFirstName) {
    return NextResponse.json({ error: 'senderFirstName_required' }, { status: 400 });
  }
  if (senderFirstName.length > SENDER_FIRST_NAME_MAX) {
    return NextResponse.json({ error: 'senderFirstName_too_long' }, { status: 400 });
  }
  if (!SENDER_FIRST_NAME_RE.test(senderFirstName)) {
    return NextResponse.json({ error: 'senderFirstName_invalid' }, { status: 400 });
  }
  if (!rawNote) {
    return NextResponse.json({ error: 'note_required' }, { status: 400 });
  }
  if (rawNote.length > NOTE_MAX) {
    return NextResponse.json({ error: 'note_too_long' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // 1) Resolve the share row.
  const { data: share } = await admin
    .from('parent_shares')
    .select('id, player_id, team_id, coach_id, is_active, expires_at')
    .eq('share_token', shareToken)
    .eq('is_active', true)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'invalid_share_token' }, { status: 400 });
  }

  // 2) Resolve the sender's player (for the FK on the signal row).
  //    LESSONS#0036 allow-list — only the four columns the signal
  //    row needs.
  const { data: senderPlayer } = await admin
    .from('players')
    .select('id, name, team_id')
    .eq('id', share.player_id)
    .single();

  if (!senderPlayer) {
    // Bad data — the token resolved but the player is gone.
    return NextResponse.json({ error: 'invalid_share_token' }, { status: 400 });
  }

  // 3) Resolve the recipient player. The .select() allow-list is the
  //    smallest possible set: id, name (for the email), team_id (for
  //    the same-team check), parent_email (for the dispatch). NEVER
  //    reads DOB / medical_notes / jersey_number / photo_url /
  //    parent_phone / nickname.
  const { data: recipientPlayer } = await admin
    .from('players')
    .select('id, name, team_id, parent_email')
    .eq('id', recipientPlayerId)
    .single();

  if (!recipientPlayer) {
    return NextResponse.json({ error: 'invalid_share_token' }, { status: 400 });
  }

  // Same-team contract — the in-team graph the email's consent
  // posture depends on.
  if (recipientPlayer.team_id !== senderPlayer.team_id) {
    return NextResponse.json({ error: 'not_on_same_team' }, { status: 400 });
  }

  if (!recipientPlayer.parent_email) {
    return NextResponse.json(
      { error: 'no_parent_email_on_file' },
      { status: 400 },
    );
  }

  // 4) Team display name for the email subject + body.
  const { data: team } = await admin
    .from('teams')
    .select('id, name, sport_id')
    .eq('id', senderPlayer.team_id)
    .single();

  // 5) Idempotency — check parent_forward_signals for a prior edge in
  //    the 7-day window on (sender_player_id, recipient_player_id).
  const sinceIso = new Date(Date.now() - IDEMPOTENCY_WINDOW_MS).toISOString();
  const { data: prior } = await admin
    .from('parent_forward_signals')
    .select('id, dispatched_at')
    .eq('sender_player_id', senderPlayer.id)
    .eq('recipient_player_id', recipientPlayer.id)
    .gte('dispatched_at', sinceIso)
    .order('dispatched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior) {
    return NextResponse.json({ error: 'already_sent' }, { status: 429 });
  }

  // 6) Mint a NEW parent_shares row for the RECIPIENT's player. We
  //    mirror /api/share/create's column posture exactly — same
  //    include flags, same coach_id (the same coach owns both
  //    players because they are on the same team).
  const recipientShareToken = randomBytes(16).toString('hex');
  const { data: mintedShare } = await admin
    .from('parent_shares')
    .insert({
      player_id: recipientPlayer.id,
      team_id: senderPlayer.team_id,
      coach_id: share.coach_id,
      share_token: recipientShareToken,
      include_report_card: true,
      include_development_card: true,
      include_highlights: true,
      include_observations: false,
      include_goals: true,
      include_drills: true,
      include_coach_note: true,
      include_skill_challenges: true,
      is_active: true,
      expires_at: null,
    })
    .select()
    .single();

  // 7) Dispatch the email — best-effort (LESSONS#0036). A mail-
  //    pipeline failure does NOT abort the signal row write; the
  //    attribution edge is the load-bearing artifact for the 0050 /
  //    0072 downstream surfaces.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || APP_URL_DEFAULT;
  const recipientPortalUrl = `${appUrl}/share/${recipientShareToken}`;
  // Sport lookup is best-effort; the email body falls back to a
  // generic "team" phrasing when the sport row can't be resolved.
  let teamSport = '';
  if (team?.sport_id) {
    const { data: sport } = await admin
      .from('sports')
      .select('slug, name')
      .eq('id', team.sport_id)
      .maybeSingle();
    teamSport = (sport?.name as string | undefined) ?? (sport?.slug as string | undefined) ?? '';
  }
  const recipientFirstName = (recipientPlayer.name as string | null | undefined)
    ? ((recipientPlayer.name as string).trim().split(/ /)[0] || '')
    : '';
  const email = buildParentForwardEmail({
    senderFirstName,
    teamName: (team?.name as string | undefined) ?? 'your team',
    recipientKidFirstName: recipientFirstName,
    note: rawNote,
    recipientPortalUrl,
    teamSport,
  });

  try {
    const sendResult = await sendEmail({
      to: recipientPlayer.parent_email as string,
      subject: email.subject,
      html: email.html,
    });
    if (!sendResult.success) {
      // The signal row still writes — the next retry within 7 days
      // dedupes via the UNIQUE constraint.
      // eslint-disable-next-line no-console
      console.error('[parent-forward] sendEmail failed:', sendResult.error);
    }
  } catch (mailErr) {
    // eslint-disable-next-line no-console
    console.error('[parent-forward] sendEmail threw:', mailErr);
  }

  // 8) Write the signal row. UNIQUE(sender_player_id,
  //    recipient_player_id) makes the second attempt no-op at the DB
  //    level, but we still attempt it so the dispatched_at gets
  //    refreshed on the rare race where two near-simultaneous taps
  //    each pass the 7-day check. The insert payload is the smallest
  //    possible allow-list — no name, no email, no note.
  const { error: signalErr } = await admin
    .from('parent_forward_signals')
    .insert({
      sender_player_id: senderPlayer.id,
      recipient_player_id: recipientPlayer.id,
      team_id: senderPlayer.team_id,
    });
  if (signalErr) {
    // eslint-disable-next-line no-console
    console.error('[parent-forward] signal insert failed:', signalErr);
  }

  // The response NEVER carries the recipient parent_email, the
  // recipient's full name, or the team name (LESSONS#0072 — the
  // sender's UI does not need any of it). The minted share id is
  // surfaced for downstream UI but is opaque.
  return NextResponse.json({
    ok: true,
    mintedShareId: (mintedShare as { id?: string } | null)?.id ?? null,
  });
}
