/**
 * DELETE /api/teams/[teamId]
 *
 * Ticket 0053 — Hard-delete a team and its records. This is the destructive
 * primitive that turns "the U10 Lions don't exist anymore" from "I'm stuck
 * with an unused row forever" into a clean 30-second admin task.
 *
 * Preconditions (each maps to a specific 4xx — never collapse into a generic
 * error):
 *   - 401: no auth.
 *   - 404: team doesn't exist, OR belongs to a different org (no existence
 *          leak — matches the cross-org 404 in /api/sessions/[sessionId]).
 *   - 409: team is not archived. The admin MUST archive first; that two-step
 *          asymmetry is intentional (archive is reversible, delete is not).
 *   - 403: caller is not an ORG ADMIN. A head_coach of the team is permitted
 *          to ARCHIVE the team (their own coaching surface) but never to
 *          permanently destroy it; that destructive primitive is admin-only.
 *   - 400: confirm body field missing or does not case-insensitive-trimmed-
 *          equal the team's name.
 *
 * On success: delete the team and every cascaded child row. The schema-level
 * `ON DELETE CASCADE` on `teams(id)` does most of the work — we re-issue the
 * deletes explicitly per child table so the route's intent is auditable
 * without relying on schema-level cascade (same pattern as the 0051
 * delete-session route). Tables WITHOUT cascade on `team_id` (only
 * `ai_interactions` in the live schema) get their `team_id` NULLed so the
 * row survives at the org-level audit log.
 *
 * After a successful delete:
 *  1. Bust /api/me cache for every coach who was on the team (BEFORE
 *     deleting team_coaches — the bust needs the membership rows).
 *  2. Fire `team.deleted` with the removed_counts snapshot for webhook
 *     consumers to react to.
 *
 * Sister change: /api/data/mutate already rejects `operation:'delete'` on
 * `teams` (the delete-denial primitive added by ticket 0051). This route is
 * the ONLY sanctioned path to remove a team — and the only one with the
 * role gate and the typed-name confirm.
 */
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { fireWebhooks } from '@/lib/webhooks';
import { memBust } from '@/lib/cache/memory';
import {
  resolveTeamAccess,
  isOrgAdmin,
  bustMeCacheForTeamCoaches,
} from '@/lib/teams/access';

// Child tables that have `team_id references teams(id) ON DELETE CASCADE` in
// the live schema. We delete from each explicitly so the route's intent is
// auditable without relying on schema-level cascade. Order matters only for
// parents-before-children when cascades are intra-set; the per-table deletes
// here are all keyed on team_id directly (not transitively), so ordering is
// purely cosmetic.
//
// Sourced from grep "team_id.*references teams" supabase/migrations/ — see
// the Implementation log in docs/backlog/0053-*.md for the full list.
const CASCADE_TABLES = [
  'players',
  'sessions',
  'observations',
  'recordings',
  'media',
  'plans',
  'parent_shares',
  'team_announcements',
  'season_archives',
  'recurring_sessions',
  'config_overrides',
  'player_availability',
  'player_achievements',
  'player_goals',
  'player_notes',
  'team_custom_skills',
  'team_coaches',
] as const;

// Tables where `team_id` references `teams(id)` WITHOUT cascade. The row
// stays but the team_id is NULLed so the org-level audit/history survives.
// (`ai_interactions` is intentionally NOT cascaded in 001 so historical AI
// usage rows remain queryable at the org level after a team is deleted.)
const NULL_OUT_TABLES = ['ai_interactions'] as const;

// Tables we count BEFORE the delete to return a `removed_counts` snapshot in
// the response (also fed into the team.deleted webhook payload).
const COUNT_TABLES = [
  'players',
  'sessions',
  'observations',
  'plans',
  'parent_shares',
  'ai_interactions',
] as const;

type RemovedCounts = Record<(typeof COUNT_TABLES)[number], number>;

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceSupabase();
    const access = await resolveTeamAccess(admin, teamId, user.id);

    if (!access.team) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // 409 — must archive first. (We check this BEFORE the role gate so the
    // 409 surfaces to anyone with a legitimate read on the team; the role
    // check still gates the actual destructive write.)
    if (!access.team.archived_at) {
      return NextResponse.json(
        { error: 'Team must be archived before it can be deleted' },
        { status: 409 },
      );
    }

    // 403 — hard-delete is ORG ADMIN ONLY. A head_coach who is not also an
    // org admin can archive their own team but cannot hard-delete.
    if (!isOrgAdmin(access.callerOrgRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 400 — typed-name confirm. Case-insensitive, trimmed compare.
    let body: { confirm?: unknown } = {};
    try {
      body = (await request.json()) as { confirm?: unknown };
    } catch {
      body = {};
    }
    const confirm = typeof body?.confirm === 'string' ? body.confirm : '';
    const teamName = access.team.name;
    const matches =
      confirm.trim().toLowerCase() === teamName.trim().toLowerCase() &&
      confirm.trim().length > 0;
    if (!matches) {
      return NextResponse.json(
        { error: 'Type the team name to confirm permanent delete' },
        { status: 400 },
      );
    }

    // Count the child rows we're about to remove so the response (and the
    // webhook payload) can report what was deleted. Head-count queries don't
    // pull data, just totals.
    const removedCounts = {} as RemovedCounts;
    for (const t of COUNT_TABLES) {
      const { count } = await admin
        .from(t)
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId);
      removedCounts[t] = count ?? 0;
    }

    // Bust /api/me cache for every team coach BEFORE we delete team_coaches.
    await bustMeCacheForTeamCoaches(admin, teamId, memBust);

    // NULL-out tables first (we don't want a row to be ambiguously "deleted"
    // when its FK was no-cascade). ai_interactions rows survive.
    for (const t of NULL_OUT_TABLES) {
      const { error: nullErr } = await admin
        .from(t)
        .update({ team_id: null })
        .eq('team_id', teamId);
      if (nullErr) throw nullErr;
    }

    // Explicit deletes for cascade tables. Intent is auditable here even
    // though the schema would do this on the final `delete from teams`.
    for (const t of CASCADE_TABLES) {
      const { error: delErr } = await admin
        .from(t)
        .delete()
        .eq('team_id', teamId);
      if (delErr) throw delErr;
    }

    // Finally, the team itself.
    const { error: teamErr } = await admin
      .from('teams')
      .delete()
      .eq('id', teamId);
    if (teamErr) throw teamErr;

    fireWebhooks(access.team.org_id, 'team.deleted', {
      team_id: teamId,
      org_id: access.team.org_id,
      team_name: teamName,
      removed_counts: removedCounts,
    }).catch(() => {});

    return NextResponse.json({ ok: true, removedCounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
