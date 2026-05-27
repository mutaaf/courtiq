/**
 * POST /api/teams/[teamId]/archive
 *
 * Ticket 0053 — Manual archive of a team. Sets `teams.archived_at = NOW()`
 * (the column already exists from migration 029, where it was reserved for
 * the auto-downgrade webhook path; this route is the first manual writer).
 *
 * Role gate: org admin (`coaches.role IN ('admin','head_coach')` per the
 * config-route precedent) OR the team's head_coach (`team_coaches.role =
 * 'head_coach'`). Cross-org → 404 (never 403, no existence leak).
 *
 * Idempotent: re-posting on an already-archived team returns 200 with the
 * original archived_at timestamp unchanged.
 *
 * After a successful archive: bust /api/me cache for every coach on the team
 * (so the dashboard sheds the row on next read) and fire team.archived.
 *
 * Sister route: /unarchive is the inverse. /api/teams/[teamId] (DELETE) is
 * the destructive primitive that requires this archive as a precondition.
 */
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { fireWebhooks } from '@/lib/webhooks';
import { memBust } from '@/lib/cache/memory';
import {
  resolveTeamAccess,
  isOrgAdmin,
  isTeamHeadCoach,
  bustMeCacheForTeamCoaches,
} from '@/lib/teams/access';

export async function POST(
  _request: Request,
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

    // Authorize: org admin OR team head_coach.
    if (!isOrgAdmin(access.callerOrgRole) && !isTeamHeadCoach(access.callerTeamRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Idempotent: if archived_at is already set, return the existing value
    // without touching the row (avoids a no-op write + spurious webhook).
    if (access.team.archived_at) {
      return NextResponse.json({ ok: true, archivedAt: access.team.archived_at });
    }

    const archivedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .from('teams')
      .update({ archived_at: archivedAt })
      .eq('id', teamId);
    if (updateErr) throw updateErr;

    // Bust caches BEFORE firing the webhook so any caller who reacts to the
    // webhook by re-reading /api/me sees the post-archive state.
    await bustMeCacheForTeamCoaches(admin, teamId, memBust);

    // Fire-and-forget; route returns once the DB write + cache bust are durable.
    fireWebhooks(access.team.org_id, 'team.archived', {
      team_id: teamId,
      org_id: access.team.org_id,
      archived_at: archivedAt,
    }).catch(() => {});

    return NextResponse.json({ ok: true, archivedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
