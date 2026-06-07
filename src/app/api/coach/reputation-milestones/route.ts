/**
 * GET /api/coach/reputation-milestones — ticket 0073.
 *
 * Returns the caller coach's unconsumed reputation milestones from
 * the last 14 days so the /home `<CoachReputationMilestoneCard />`
 * can render the most-recent unseen milestone ("your closeout
 * drill was cloned by a coach in a 3rd program this month").
 *
 * COPPA contract (LESSONS#0036):
 *  - `.select()` allow-list on the read. NEVER reads cloning-coach
 *    full_name, cloning-team name, parent_email, DOB.
 *  - The response shape is `{ milestones: Array<{ id, kind,
 *    crossedAt }> }`. The cloning-coach's identity NEVER leaves the
 *    server (only the milestone kind label does).
 *
 * Auth: the caller must be authenticated. Milestones are scoped by
 * `published_coach_id = user.id`.
 *
 * Tier posture: universal — the publishing coach's reputation
 * belongs to them; no UpgradeGate.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    const cutoffIso = new Date(Date.now() - WINDOW_DAYS * DAY_MS).toISOString();
    // Allow-list: id, milestone_kind, crossed_at, notified_at. NEVER
    // joins the cloning-coach side — the surface never names the
    // cloning coach.
    const { data, error } = await admin
      .from('coach_reputation_milestones')
      .select('id, milestone_kind, crossed_at, notified_at')
      .eq('published_coach_id', user.id)
      .is('notified_at', null)
      .gte('crossed_at', cutoffIso)
      .order('crossed_at', { ascending: false });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as Array<{
      id: string;
      milestone_kind: string;
      crossed_at: string;
      notified_at: string | null;
    }>;
    const milestones = rows.map((r) => ({
      id: r.id,
      kind: r.milestone_kind,
      crossedAt: r.crossed_at,
    }));
    return NextResponse.json({ milestones });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
