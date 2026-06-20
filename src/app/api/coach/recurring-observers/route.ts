/**
 * GET /api/coach/recurring-observers — ticket 0092.
 *
 * Returns the qualifying recurring-observer helpers (2+ helps across
 * 2+ practices in the last 14 days, not dismissed by the caller for
 * that helper-team pair in the last 30 days) so the /home
 * `<RealCoCoachCard />` knows whether to render and what to name.
 *
 * Schema-wins-over-prose deviation (LESSONS#0096) — documented in the
 * 0092 Implementation log: the ticket prose names an
 * `observer_link_opens` table with a `helper_identifier` /
 * `display_name` / `ran_drill` shape. No such table exists on disk —
 * the 0029 ship is a stateless HMAC token primitive with no
 * persisted open telemetry. The closest structural primitive on
 * disk is `sub_handoffs` (migration 061, ticket 0067): each row
 * carries `session_id`, `coach_id`, `sub_first_name` (the helper's
 * name as the regular coach typed it when issuing the handoff),
 * `sub_note_text` / `sub_note_at` (presence = the helper actually
 * ran the practice and sent a note back — the structural `ran_drill`
 * proxy), `created_at`. A regular coach who issued 2+ distinct
 * handoffs naming the same `sub_first_name` for the same team across
 * 2+ sessions = the recurring helper this card names.
 *
 * Privacy / COPPA contract (LESSONS#0036): every `.select()` uses a
 * narrow allow-list. NEVER reads coaches.email / coaches.phone /
 * coaches.full_name (no surname leak), players.* (no minor data),
 * parent_email, DOB, observation text. The route reads only:
 *   - coaches.id (the caller's own row);
 *   - team_coaches (coach_id, team_id) for the ownership join
 *     (LESSONS#0057 — never teams.coach_id);
 *   - teams.id, .name (the rendered team label);
 *   - sub_handoffs (id, coach_id, team_id, session_id,
 *     sub_first_name, sub_note_text, created_at) — the recurring-
 *     helper source;
 *   - recurring_observer_dismissals (helper_identifier, team_id) —
 *     the dismissal exclusion set.
 *
 * Tier posture: universal — the card is an ACQUISITION surface (free
 * and paid alike see the prompt; the "free until your next renewal"
 * sub-line is rendered by the COMPONENT based on tier the existing
 * `useTier()` already exposes). NO new tier feature key. NO
 * UpgradeGate.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively.
 * LESSONS#0044 — the auth check is load-bearing.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  findRecurringObserverHelpers,
  type RecurringObserverOpenRow,
} from '@/lib/recurring-observer-helpers';

export type RecurringObserversEligibilityReason =
  | 'no_observer_opens'
  | 'no_helpers_meeting_threshold'
  | 'all_helpers_already_invited';

interface RecurringObserverHelperPayload {
  helperIdentifier: string;
  displayName: string | null;
  openCount: number;
  distinctPracticeCount: number;
  ranDrill: boolean;
  lastOpenAt: string;
  teamId: string;
  teamName: string;
}

interface IneligibleResponse {
  eligible: false;
  eligibilityReason: RecurringObserversEligibilityReason;
}

interface EligibleResponse {
  eligible: true;
  helpers: RecurringObserverHelperPayload[];
  total: number;
}

const LOOKBACK_DAYS = 14;

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();
  const nowMs = Date.now();
  const windowStartIso = new Date(
    nowMs - LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    // ── (1) Read the caller's teams via team_coaches (LESSONS#0057 —
    //    never teams.coach_id). Allow-list is narrow: team_id only.
    const { data: membershipRaw } = await admin
      .from('team_coaches')
      .select('team_id')
      .eq('coach_id', user.id);
    const teamIds = (membershipRaw ?? [])
      .map((r: { team_id: string | null }) => r.team_id)
      .filter((t: string | null): t is string => Boolean(t));
    if (teamIds.length === 0) {
      const body: IneligibleResponse = {
        eligible: false,
        eligibilityReason: 'no_observer_opens',
      };
      return NextResponse.json(body);
    }

    // ── (2) Read the caller's sub_handoffs rows for the team set in
    //    the last 14 days. Allow-list is narrow: only the columns the
    //    derivation needs. NEVER selects coach email / phone /
    //    full_name surname / player_id / parent_email / DOB.
    const { data: handoffsRaw } = await admin
      .from('sub_handoffs')
      .select(
        'id, coach_id, session_id, sub_first_name, sub_note_text, created_at',
      )
      .eq('coach_id', user.id)
      .gte('created_at', windowStartIso);
    type HandoffRow = {
      id: string;
      coach_id: string;
      session_id: string | null;
      sub_first_name: string | null;
      sub_note_text: string | null;
      created_at: string;
    };
    const handoffs = (handoffsRaw ?? []) as HandoffRow[];

    // ── (3) Join handoff session_ids → sessions to learn each
    //    handoff's team_id. Narrow allow-list: id + team_id only.
    const sessionIds = Array.from(
      new Set(
        handoffs
          .map((h) => h.session_id)
          .filter((s: string | null): s is string => Boolean(s)),
      ),
    );
    const sessionTeamById = new Map<string, string>();
    if (sessionIds.length > 0) {
      const { data: sessionsRaw } = await admin
        .from('sessions')
        .select('id, team_id')
        .in('id', sessionIds);
      type SessionRow = { id: string; team_id: string };
      for (const s of (sessionsRaw ?? []) as SessionRow[]) {
        if (s.id && s.team_id) sessionTeamById.set(s.id, s.team_id);
      }
    }

    // Build the open-row shape the pure helper expects. Each
    // sub_handoffs row is treated as ONE "open"; the presence of a
    // sub_note_text is the structural ran_drill proxy (the helper
    // sent the regular coach a note back about the practice).
    const teamIdSet = new Set(teamIds);
    const observerOpenRows: RecurringObserverOpenRow[] = [];
    for (const h of handoffs) {
      const teamId = h.session_id ? sessionTeamById.get(h.session_id) : undefined;
      if (!teamId) continue;
      if (!teamIdSet.has(teamId)) continue;
      const helperLabel = (h.sub_first_name ?? '').trim();
      if (!helperLabel) continue;
      // Per LESSONS#0078 — schema wins over prose: the sub_first_name
      // IS the helper identifier on the available primitive; if the
      // observer-link telemetry table ever lands, only this row
      // construction needs to swap to its richer shape.
      observerOpenRows.push({
        helper_identifier: helperLabel.toLowerCase(),
        display_name: helperLabel,
        team_id: teamId,
        opened_at: h.created_at,
        practice_id: h.session_id,
        ran_drill: Boolean(h.sub_note_text),
      });
    }

    if (observerOpenRows.length === 0) {
      const body: IneligibleResponse = {
        eligible: false,
        eligibilityReason: 'no_observer_opens',
      };
      return NextResponse.json(body);
    }

    // ── (4) Read the caller's dismissals so the derivation excludes
    //    helper-team pairs the coach has already said "Not yet" to.
    //    The dismiss row's dismissed_at acts as the invite-cooldown
    //    proxy (see the route's jsdoc for the schema reconciliation —
    //    there is no per-helper invite log on disk; the dismiss is
    //    the structural cooldown surface).
    const { data: dismissalsRaw } = await admin
      .from('recurring_observer_dismissals')
      .select('helper_identifier, team_id, dismissed_at')
      .eq('coach_id', user.id);
    type DismissalRow = {
      helper_identifier: string;
      team_id: string;
      dismissed_at: string;
    };
    const invitesAlreadySent = ((dismissalsRaw ?? []) as DismissalRow[]).map(
      (d) => ({
        helper_identifier: d.helper_identifier,
        team_id: d.team_id,
        sent_at: d.dismissed_at,
      }),
    );

    // ── (5) Derive the eligible helpers via the pure helper.
    const eligibleHelpers = findRecurringObserverHelpers({
      observerOpenRows,
      invitesAlreadySent,
      nowMs,
    });

    if (eligibleHelpers.length === 0) {
      // Distinguish "had opens but all dismissed" from "had opens but
      // none crossed the threshold" so the surface analytics can
      // learn which gate is closing.
      const reason: RecurringObserversEligibilityReason =
        invitesAlreadySent.length > 0
          ? 'all_helpers_already_invited'
          : 'no_helpers_meeting_threshold';
      const body: IneligibleResponse = {
        eligible: false,
        eligibilityReason: reason,
      };
      return NextResponse.json(body);
    }

    // ── (6) Join each qualifying helper's team_id → teams.name. Narrow
    //    allow-list: id + name only. NEVER reads teams.coach_id (the
    //    column is unreliable per LESSONS#0057).
    const qualifyingTeamIds = Array.from(
      new Set(eligibleHelpers.map((h) => h.teamId)),
    );
    const teamNameById = new Map<string, string>();
    if (qualifyingTeamIds.length > 0) {
      const { data: teamsRaw } = await admin
        .from('teams')
        .select('id, name')
        .in('id', qualifyingTeamIds);
      type TeamRow = { id: string; name: string | null };
      for (const t of (teamsRaw ?? []) as TeamRow[]) {
        teamNameById.set(t.id, t.name ?? '');
      }
    }

    const helpers: RecurringObserverHelperPayload[] = eligibleHelpers.map(
      (h) => ({
        helperIdentifier: h.helperIdentifier,
        displayName: h.displayName,
        openCount: h.openCount,
        distinctPracticeCount: h.distinctPracticeCount,
        ranDrill: h.ranDrill,
        lastOpenAt: h.lastOpenAt,
        teamId: h.teamId,
        teamName: teamNameById.get(h.teamId) ?? '',
      }),
    );

    const body: EligibleResponse = {
      eligible: true,
      helpers,
      total: helpers.length,
    };
    return NextResponse.json(body);
  } catch (error: unknown) {
    // Best-effort: never surface a 500 to /home; the card simply
    // does not render.
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { eligible: false, eligibilityReason: 'no_observer_opens', _error: message },
      { status: 200 },
    );
  }
}
