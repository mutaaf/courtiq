/**
 * POST /api/teams/[teamId]/unarchive
 *
 * Ticket 0053 — Inverse of the manual archive primitive. Clears
 * `teams.archived_at` so the team returns to the dashboard, the team switcher,
 * the billing roster count, and every other surface that filters on
 * `archived_at IS NULL`.
 *
 * Role gate: org admin OR team head_coach (same as /archive). Cross-org → 404.
 *
 * Idempotent: re-posting on a live (already-unarchived) team is a no-op 200.
 *
 * Notes:
 *  - We do NOT re-grant tier capacity automatically. The tier-pre-check on
 *    /api/auth/create-team and the maxTeams math will reflect the restored
 *    count on next read; if the org is OVER its tier ceiling after unarchive,
 *    the existing tier-gate UX surfaces the upgrade prompt on the next
 *    create-team attempt (consistent with the rest of the platform).
 *  - We fire `team.unarchived` so webhook consumers can re-sync.
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

    if (!isOrgAdmin(access.callerOrgRole) && !isTeamHeadCoach(access.callerTeamRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Idempotent: if the team is already live, return ok without writing.
    if (!access.team.archived_at) {
      return NextResponse.json({ ok: true });
    }

    const { error: updateErr } = await admin
      .from('teams')
      .update({ archived_at: null })
      .eq('id', teamId);
    if (updateErr) throw updateErr;

    await bustMeCacheForTeamCoaches(admin, teamId, memBust);

    fireWebhooks(access.team.org_id, 'team.unarchived', {
      team_id: teamId,
      org_id: access.team.org_id,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
