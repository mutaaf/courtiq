/**
 * DELETE /api/sessions/[sessionId]
 *
 * Ticket 0051 — Delete a practice. The role-gated, two-mode primitive that
 * removes a coach-authored session from a team's record:
 *
 *   - preserve (default): detach observations / recordings / media from the
 *     session (session_id := null) and hard-delete the session row plus its
 *     session-scoped artifacts (session_attendance, the session-scoped plan,
 *     cv_processing_jobs — the last two cascade in schema).
 *   - cascade: also hard-delete every observation that referenced this
 *     session. Requires a `confirm` body field equal (case-insensitive,
 *     trimmed) to the team's name.
 *
 * Role gate: the caller must be the session's `coach_id` (the creator) OR
 * have `role='head_coach'` in `team_coaches` for the session's team. Sibling
 * ticket 0053 will inherit the same role pattern at the team level.
 *
 * Cross-org safety: if the session belongs to a team in a different org from
 * the caller, return 404 (not 403) so the route never reveals the session's
 * existence cross-org.
 *
 * Sister change: /api/data/mutate now REJECTS `operation:'delete'` on
 * `sessions`, `teams`, `players` — making this the ONLY sanctioned path to
 * remove a session and closing a quiet privacy hole. See
 * tests/data/mutate-delete-denial.test.ts.
 */
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

type Mode = 'preserve' | 'cascade';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceSupabase();

    // Mode + body (cascade requires the typed team-name confirm).
    const url = new URL(request.url);
    const rawMode = url.searchParams.get('mode');
    const mode: Mode = rawMode === 'cascade' ? 'cascade' : 'preserve';

    // Resolve the caller's org first — cross-org sessions must look like 404.
    const { data: callerCoach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .maybeSingle();
    const callerOrgId = (callerCoach as { org_id?: string } | null)?.org_id ?? null;

    // Resolve the session + its team.
    const { data: sess } = await admin
      .from('sessions')
      .select('id, team_id, coach_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!sess) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const { data: team } = await admin
      .from('teams')
      .select('id, org_id, name')
      .eq('id', (sess as { team_id: string }).team_id)
      .maybeSingle();
    if (!team) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Cross-org: 404, never 403 — don't leak existence.
    if (callerOrgId && (team as { org_id: string }).org_id !== callerOrgId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Role gate: creator OR head_coach for this team.
    const isCreator = (sess as { coach_id: string }).coach_id === user.id;
    let isHead = false;
    if (!isCreator) {
      const { data: membership } = await admin
        .from('team_coaches')
        .select('role')
        .eq('team_id', (sess as { team_id: string }).team_id)
        .eq('coach_id', user.id)
        .maybeSingle();
      isHead = (membership as { role?: string } | null)?.role === 'head_coach';
    }
    if (!isCreator && !isHead) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Cascade-mode: require a confirm body field == team's name (ci, trimmed).
    if (mode === 'cascade') {
      let body: { confirm?: unknown } = {};
      try {
        body = (await request.json()) as { confirm?: unknown };
      } catch {
        body = {};
      }
      const confirm = typeof body?.confirm === 'string' ? body.confirm : '';
      const teamName = (team as { name: string }).name;
      const matches = confirm.trim().toLowerCase() === teamName.trim().toLowerCase()
        && confirm.trim().length > 0;
      if (!matches) {
        return NextResponse.json(
          { error: 'Type the team name to confirm cascade delete' },
          { status: 400 }
        );
      }
    }

    // Detach (preserve mode) or hard-delete (cascade) observations.
    if (mode === 'cascade') {
      // Hard-delete every observation; children cascade per existing migrations.
      const { error: obsErr } = await admin
        .from('observations')
        .delete()
        .eq('session_id', sessionId);
      if (obsErr) throw obsErr;
    } else {
      const { error: obsErr } = await admin
        .from('observations')
        .update({ session_id: null })
        .eq('session_id', sessionId);
      if (obsErr) throw obsErr;
    }

    // Recordings + media: always detach (they outlive the session — the audio
    // file the coach uploaded is theirs even if the session row goes away).
    const { error: recErr } = await admin
      .from('recordings')
      .update({ session_id: null })
      .eq('session_id', sessionId);
    if (recErr) throw recErr;
    const { error: medErr } = await admin
      .from('media')
      .update({ session_id: null })
      .eq('session_id', sessionId);
    if (medErr) throw medErr;

    // Session-scoped attendance: hard-delete (it has no meaning without the
    // session it counts attendance for). session_attendance.session_id has
    // ON DELETE CASCADE in migration 014, but we delete it explicitly so the
    // route's intent is auditable without relying on schema-level cascade.
    const { error: attErr } = await admin
      .from('session_attendance')
      .delete()
      .eq('session_id', sessionId);
    if (attErr) throw attErr;

    // Now the session itself. plans.session_id (032) and cv_processing_jobs
    // (001 schema) cascade — both go with this row.
    const { error: sessErr } = await admin
      .from('sessions')
      .delete()
      .eq('id', sessionId);
    if (sessErr) throw sessErr;

    return NextResponse.json({ ok: true, mode });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
