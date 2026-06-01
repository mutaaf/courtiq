/**
 * Ticket 0060 — GET /api/share/[token]/sibling-invite-candidate.
 *
 * Public route (token-scoped). The parent-portal client component on
 * /share/[token] calls this to decide whether to render the new
 * SiblingInviteCard. Three possible response shapes:
 *
 *   200 { candidate: { otherTeamName, otherCoachName, otherCoachEmail,
 *                      siblingFirstName, programId },
 *         alreadyOnSportsIQ: false }
 *     — a second active `players` row with the SAME parent_email
 *     (case-insensitive) exists on a DIFFERENT team, and the OTHER team's
 *     head coach is NOT already on SportsIQ (no `coaches.email` row
 *     matches the join's coach email). The card opens the invite sheet.
 *
 *   200 { candidate: null, alreadyOnSportsIQ: true }
 *     — second kid found, but the OTHER head coach IS already on SportsIQ.
 *     The card pivots to the existing 0019 self-signup copy.
 *
 *   200 { candidate: null, alreadyOnSportsIQ: false }
 *     — no second kid match. The card renders nothing (silence beats a
 *     generic invite CTA per the AC).
 *
 *   400 — token param missing.
 *   404 — tampered or unknown token.
 *
 * COPPA: the candidate `.select()` is EXACTLY
 *   'id, name, team_id, parent_email'
 * so a planted date_of_birth/medical_notes/parent_phone row on the matched
 * team can never leak. The sibling's first name in the response is
 * `firstNameOnly(name)`; the LAST name is never returned.
 *
 * Per LESSONS#0057: team-ownership lookups go through `team_coaches`,
 * NEVER `teams.coach_id` (no such column). The "is the other coach already
 * on SportsIQ" check joins `team_coaches` -> `coaches.email`.
 *
 * NOT tier-gated — this surface stays open for every parent on every
 * report (free, paid, org). The route does not import `@/lib/tier`.
 */
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { firstNameOnly } from '@/lib/sibling-invite-utils';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
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
    return NextResponse.json({ error: 'Share link not found or inactive' }, { status: 404 });
  }

  // 2) The source player — load EXACTLY (id, name, team_id, parent_email).
  // The parent_email here is the seed-time/coach-typed email; that is the
  // edge we walk to find a second active player.
  const { data: sourcePlayer } = await admin
    .from('players')
    .select('id, name, team_id, parent_email')
    .eq('id', share.player_id)
    .single();

  if (!sourcePlayer?.parent_email) {
    // No parent_email recorded → no way to find the sibling. This is the
    // typical case for a freshly-onboarded coach; respond with silence.
    return NextResponse.json({ candidate: null, alreadyOnSportsIQ: false });
  }

  // 3) The source team's org_id (the program scope that owns the
  //    referral attribution). The candidate-lookup never reads
  //    `teams.coach_id` (LESSONS#0057 — no such column).
  const { data: sourceTeam } = await admin
    .from('teams')
    .select('id, org_id')
    .eq('id', share.team_id)
    .single();

  const programId = sourceTeam?.org_id ?? null;

  // 4) Look for OTHER active players rows with the SAME parent_email
  //    (case-insensitive) on a DIFFERENT team. EXACTLY four columns —
  //    no DOB, no medical_notes, no parent_phone, no jersey_number.
  const rawEmail = sourcePlayer.parent_email.trim();
  const { data: siblings } = await admin
    .from('players')
    .select('id, name, team_id, parent_email')
    .ilike('parent_email', rawEmail)
    .neq('team_id', share.team_id)
    .eq('is_active', true)
    .limit(1);

  const siblingRow = (siblings ?? [])[0] ?? null;
  if (!siblingRow) {
    return NextResponse.json({ candidate: null, alreadyOnSportsIQ: false });
  }

  // 5) The other team's display name.
  const { data: siblingTeam } = await admin
    .from('teams')
    .select('id, name')
    .eq('id', siblingRow.team_id)
    .single();

  // 6) The other team's head coach — join via `team_coaches`. Pick the
  //    head_coach row if present, else any coach. We deliberately go
  //    through `team_coaches` (LESSONS#0057 — `teams.coach_id` does not
  //    exist).
  const { data: otherCoachJoin } = await admin
    .from('team_coaches')
    .select('coach_id, coaches:coach_id (id, full_name, email)')
    .eq('team_id', siblingRow.team_id)
    .order('role', { ascending: true })
    .limit(1)
    .maybeSingle();

  const otherCoach = (otherCoachJoin as { coaches?: { id: string; full_name: string; email: string } } | null)?.coaches ?? null;
  if (!otherCoach?.email) {
    // No coach association we can address. Treat as silence.
    return NextResponse.json({ candidate: null, alreadyOnSportsIQ: false });
  }

  // 7) Is the OTHER coach already actively on SportsIQ? Reconciling the
  //    ticket prose ("team's coach is NOT on SportsIQ") with the real
  //    schema (LESSONS#0096): every `team_coaches` row references a
  //    `coaches` row, so "coach absent from coaches" is structurally
  //    impossible. The actual onboarding-completed signal we already use
  //    elsewhere is `coaches.onboarding_complete = true`. A team whose
  //    head coach has NOT completed onboarding is, for our purposes, the
  //    invite target; a coach whose row says onboarding_complete = true
  //    is "already on SportsIQ" and the UI pivots to the 0019 self-signup
  //    surface. The dedicated lookup also tolerates seed stubs whose
  //    `onboarding_complete` is NULL by treating NULL as not-yet-on
  //    (false).
  const { data: otherCoachStatus } = await admin
    .from('coaches')
    .select('id, onboarding_complete')
    .eq('id', otherCoach.id)
    .maybeSingle();

  const alreadyOnSportsIQ = otherCoachStatus?.onboarding_complete === true;
  if (alreadyOnSportsIQ) {
    return NextResponse.json({ candidate: null, alreadyOnSportsIQ: true });
  }

  return NextResponse.json({
    candidate: {
      otherTeamName: siblingTeam?.name ?? '',
      otherCoachName: otherCoach.full_name,
      otherCoachEmail: otherCoach.email,
      siblingFirstName: firstNameOnly(siblingRow.name) ?? '',
      programId,
    },
    alreadyOnSportsIQ: false,
  });
}
