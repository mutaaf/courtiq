import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Badge tier thresholds (score = obs×1 + plans×5 + shares×3)
const BADGES = [
  { label: 'Elite Coach', minScore: 500, color: 'amber' },
  { label: 'Experienced Coach', minScore: 200, color: 'orange' },
  { label: 'Developing Coach', minScore: 50, color: 'blue' },
  { label: 'Rookie Coach', minScore: 0, color: 'zinc' },
] as const;

function getBadge(score: number) {
  return BADGES.find((b) => score >= b.minScore) ?? BADGES[BADGES.length - 1];
}

function anonymizeName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const lastName = parts[parts.length - 1];
  return `${parts[0]} ${lastName[0]}.`;
}

// GET /api/leaderboard — returns org leaderboard + caller's own stats
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Get caller's coach record (need org_id)
  const { data: me } = await admin
    .from('coaches')
    .select('id, org_id, full_name, preferences')
    .eq('id', user.id)
    .single();

  if (!me) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // All coaches in the same org
  const { data: orgCoaches } = await admin
    .from('coaches')
    .select('id, full_name, preferences, created_at')
    .eq('org_id', me.org_id);

  if (!orgCoaches || orgCoaches.length === 0) {
    return NextResponse.json({ entries: [], me: buildMyStats(me, 0, 0, 0) });
  }

  const coachIds = orgCoaches.map((c: any) => c.id);

  // Aggregate stats in parallel
  const [obsResult, plansResult, sharesResult] = await Promise.all([
    admin
      .from('observations')
      .select('coach_id', { count: 'exact', head: false })
      .in('coach_id', coachIds),
    admin
      .from('plans')
      .select('coach_id', { count: 'exact', head: false })
      .in('coach_id', coachIds),
    admin
      .from('parent_shares')
      .select('coach_id', { count: 'exact', head: false })
      .in('coach_id', coachIds),
  ]);

  // Build per-coach counts
  const obsCounts = countByCoach(obsResult.data ?? []);
  const planCounts = countByCoach(plansResult.data ?? []);
  const shareCounts = countByCoach(sharesResult.data ?? []);

  const myPrefs: any = me.preferences ?? {};
  const myOptIn = myPrefs.leaderboard_opt_in === true;

  const entries = orgCoaches
    .filter((c: any) => {
      const prefs: any = c.preferences ?? {};
      return prefs.leaderboard_opt_in === true;
    })
    .map((c: any) => {
      const obs = obsCounts[c.id] ?? 0;
      const plans = planCounts[c.id] ?? 0;
      const shares = shareCounts[c.id] ?? 0;
      const score = obs * 1 + plans * 5 + shares * 3;
      const badge = getBadge(score);
      return {
        coachId: c.id,
        // Show full name only for self, anonymized for others
        name: c.id === me.id ? me.full_name : anonymizeName(c.full_name ?? 'Coach'),
        isSelf: c.id === me.id,
        obs,
        plans,
        shares,
        score,
        badge: badge.label,
        badgeColor: badge.color,
      };
    })
    .sort((a: any, b: any) => b.score - a.score);

  const myObs = obsCounts[me.id] ?? 0;
  const myPlans = planCounts[me.id] ?? 0;
  const myShares = shareCounts[me.id] ?? 0;
  const myScore = myObs * 1 + myPlans * 5 + myShares * 3;
  const myBadge = getBadge(myScore);

  return NextResponse.json({
    entries,
    me: {
      optedIn: myOptIn,
      obs: myObs,
      plans: myPlans,
      shares: myShares,
      score: myScore,
      badge: myBadge.label,
      badgeColor: myBadge.color,
    },
  });
}

// POST /api/leaderboard — toggle opt-in
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { optIn } = await request.json();

  const admin = await createServiceSupabase();

  // Read current preferences
  const { data: coach } = await admin
    .from('coaches')
    .select('preferences')
    .eq('id', user.id)
    .single();

  const currentPrefs: any = coach?.preferences ?? {};
  const updatedPrefs = { ...currentPrefs, leaderboard_opt_in: Boolean(optIn) };

  const { error } = await admin
    .from('coaches')
    .update({ preferences: updatedPrefs })
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, optIn: Boolean(optIn) });
}

function countByCoach(rows: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const row of rows) {
    const id = row.coach_id;
    if (id) map[id] = (map[id] ?? 0) + 1;
  }
  return map;
}

function buildMyStats(me: any, obs: number, plans: number, shares: number) {
  const score = obs * 1 + plans * 5 + shares * 3;
  const badge = getBadge(score);
  const prefs: any = me.preferences ?? {};
  return {
    optedIn: prefs.leaderboard_opt_in === true,
    obs,
    plans,
    shares,
    score,
    badge: badge.label,
    badgeColor: badge.color,
  };
}
