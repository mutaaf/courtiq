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
import {
  buildParentForwardEmail,
  buildParentForwardCrossTeamEmail,
} from '@/lib/parent-forward-email';

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

  // Ticket 0080 — same-team vs cross-team-same-program branch. When
  // the team_ids match we're on the 0079 byte-identical happy path
  // (`cross_team = false`). When they differ, we resolve BOTH teams'
  // org_ids and assert they match (the cross-team-same-program
  // contract — v1 caps at one program; cross-program is a separate
  // ticket).
  const isCrossTeam = recipientPlayer.team_id !== senderPlayer.team_id;

  // Holds the recipient's team row when cross-team. Resolved below.
  let recipientTeamRow:
    | { id: string; name: string; sport_id: string | null; org_id: string }
    | null = null;
  // Holds the recipient coach id (head_coach when cross-team; the
  // sender's coach when same-team).
  let recipientCoachId: string = (share.coach_id as string);
  if (isCrossTeam) {
    // Resolve BOTH teams' org_ids via the existing teams allow-list.
    // Per LESSONS#0036 — the smallest possible select shape.
    const { data: senderTeamFull } = await admin
      .from('teams')
      .select('id, name, sport_id, org_id')
      .eq('id', senderPlayer.team_id)
      .single();
    const { data: recipientTeamFull } = await admin
      .from('teams')
      .select('id, name, sport_id, org_id')
      .eq('id', recipientPlayer.team_id)
      .single();
    if (
      !senderTeamFull ||
      !recipientTeamFull ||
      !senderTeamFull.org_id ||
      !recipientTeamFull.org_id ||
      senderTeamFull.org_id !== recipientTeamFull.org_id
    ) {
      // v1 cross-team contract caps at same `org_id`. A different
      // org_id is the cross-program edge that v1 deliberately defers
      // to its Out-of-scope.
      return NextResponse.json(
        { error: 'not_in_same_program' },
        { status: 400 },
      );
    }
    recipientTeamRow = recipientTeamFull as unknown as typeof recipientTeamRow;

    // Resolve the recipient team's head coach via team_coaches per
    // LESSONS#0057 (NEVER `teams.coach_id`). Mint the recipient's
    // portal token against HER OWN coach, NOT the sender's. The
    // receiving parent lands on her own kid's portal under her own
    // coach's voice.
    const { data: headCoach } = await admin
      .from('team_coaches')
      .select('coach_id, role')
      .eq('team_id', recipientPlayer.team_id)
      .eq('role', 'head_coach')
      .maybeSingle();
    if (
      headCoach &&
      (headCoach as { coach_id?: string }).coach_id
    ) {
      recipientCoachId = (headCoach as { coach_id: string }).coach_id;
    }
  }

  if (!recipientPlayer.parent_email) {
    return NextResponse.json(
      { error: 'no_parent_email_on_file' },
      { status: 400 },
    );
  }

  // 4) Team display name for the email subject + body. For same-team
  //    this resolves the shared team; for cross-team this resolves
  //    the SENDER's team (the email subject names the sender's team —
  //    the recipient already knows hers).
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
  //    include flags.
  //
  //    Same-team: the existing coach owns both players (the 0079
  //    byte-identical path — `coach_id = share.coach_id`).
  //
  //    Cross-team (0080): the minted row is owned by the RECIPIENT's
  //    OWN head coach (NEVER the sender's coach) AND scoped to the
  //    RECIPIENT's team. The receiving parent then lands on HER OWN
  //    kid's portal session under HER OWN coach's voice per the
  //    COPPA contract (the sender's roster consent does NOT extend
  //    to the recipient's coach's data — but the recipient's coach
  //    has already consented to render her own kid's portal).
  const recipientShareToken = randomBytes(16).toString('hex');
  const mintTeamId = isCrossTeam ? recipientPlayer.team_id : senderPlayer.team_id;
  const { data: mintedShare } = await admin
    .from('parent_shares')
    .insert({
      player_id: recipientPlayer.id,
      team_id: mintTeamId,
      coach_id: recipientCoachId,
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

  // Cross-team requires the program name; we resolve it from the
  // sender team's org. Best-effort — if the org name can't be
  // resolved the route still falls back to the same-team builder so
  // the email goes out (the attribution row remains the load-bearing
  // signal).
  let programName = '';
  if (isCrossTeam && recipientTeamRow) {
    const teamRow = recipientTeamRow as { org_id: string };
    const { data: org } = await admin
      .from('organizations')
      .select('name')
      .eq('id', teamRow.org_id)
      .maybeSingle();
    programName = (org?.name as string | undefined) ?? '';
  }

  const email = isCrossTeam && programName
    ? buildParentForwardCrossTeamEmail({
        senderFirstName,
        senderTeamName: (team?.name as string | undefined) ?? 'your team',
        programName,
        recipientKidFirstName: recipientFirstName,
        note: rawNote,
        recipientPortalUrl,
        teamSport,
      })
    : buildParentForwardEmail({
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
  //    possible allow-list — no name, no email, no note. The 0080
  //    `cross_team` flag distinguishes the cross-team-same-program
  //    edge from the 0079 same-team default; the team_id is the
  //    RECIPIENT's team for cross-team forwards (the downstream
  //    attribution surfaces 0050 / 0072 want to credit the receiving
  //    team's coach).
  const { error: signalErr } = await admin
    .from('parent_forward_signals')
    .insert({
      sender_player_id: senderPlayer.id,
      recipient_player_id: recipientPlayer.id,
      team_id: isCrossTeam ? recipientPlayer.team_id : senderPlayer.team_id,
      cross_team: isCrossTeam,
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
