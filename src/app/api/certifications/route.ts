import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// ─── Certification criteria ───────────────────────────────────────────────────

const CRITERIA = [
  {
    key: 'observations',
    label: '25+ observations recorded',
    description: 'Capture player development moments during practice and games',
    required: 25,
  },
  {
    key: 'sessions',
    label: '5+ sessions created',
    description: 'Consistently log your coaching sessions throughout the season',
    required: 5,
  },
  {
    key: 'plans',
    label: '3+ AI plans generated',
    description: 'Use AI to create data-driven practice plans for your team',
    required: 3,
  },
  {
    key: 'team',
    label: 'Team set up with roster',
    description: 'Build your team roster with at least 3 active players',
    required: 3,
  },
] as const;

type CriteriaKey = (typeof CRITERIA)[number]['key'];

// ─── GET /api/certifications ──────────────────────────────────────────────────

export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  // Get coach record (need org_id + preferences)
  const { data: coach } = await admin
    .from('coaches')
    .select('id, org_id, full_name, preferences')
    .eq('id', user.id)
    .single();

  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Fetch counts in parallel
  const [obsResult, sessionsResult, plansResult, playersResult] = await Promise.all([
    admin
      .from('observations')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', user.id),
    admin
      .from('sessions')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', user.id),
    admin
      .from('plans')
      .select('id', { count: 'exact', head: true })
      .eq('coach_id', user.id),
    // Count active players across all teams in the org
    admin
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .in(
        'team_id',
        // Sub-select: team IDs for this coach's org
        (
          await admin
            .from('teams')
            .select('id')
            .eq('org_id', coach.org_id)
        ).data?.map((t: any) => t.id) ?? []
      ),
  ]);

  const counts: Record<CriteriaKey, number> = {
    observations: obsResult.count ?? 0,
    sessions: sessionsResult.count ?? 0,
    plans: plansResult.count ?? 0,
    team: playersResult.count ?? 0,
  };

  // Evaluate each criterion
  const criteria = CRITERIA.map((c) => ({
    key: c.key,
    label: c.label,
    description: c.description,
    count: counts[c.key],
    required: c.required,
    met: counts[c.key] >= c.required,
  }));

  const allMet = criteria.every((c) => c.met);

  // Auto-grant certification when all criteria first met
  const prefs: any = coach.preferences ?? {};
  let earnedAt: string | null = prefs.certified_at ?? null;

  if (allMet && !earnedAt) {
    earnedAt = new Date().toISOString();
    await admin
      .from('coaches')
      .update({ preferences: { ...prefs, certified_at: earnedAt } })
      .eq('id', user.id);
  }

  return NextResponse.json({
    earned: Boolean(earnedAt),
    earnedAt,
    coachName: coach.full_name,
    criteria,
  });
}
