import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { memCached, TTL } from '@/lib/cache/memory';

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await memCached(`me:${user.id}`, TTL.MEDIUM, async () => {
    const admin = await createServiceSupabase();

    const [{ data: coach }, { data: teamCoaches }] = await Promise.all([
      admin
        .from('coaches')
        .select('*, organizations(id, name, slug, tier, sport_config, subscription_status, current_period_end, cancel_at_period_end, settings)')
        .eq('id', user.id)
        .single(),
      admin
        .from('team_coaches')
        .select('team_id, role, teams(*, sports(slug))')
        .eq('coach_id', user.id),
    ]);

    if (!coach) return null;

    // Ticket 0053: default active-team list excludes archived rows so the
    // dashboard, team switcher, capture screens, and billing roster math
    // all see the same live-team count. Archived rows remain queryable
    // through dedicated surfaces (e.g. /settings/organization's archived
    // panel) that opt in explicitly.
    const teams = (teamCoaches || [])
      .map((tc: any) => ({ ...tc.teams, coachRole: tc.role }))
      .filter((t: any) => t && t.archived_at == null);

    return { coach, teams };
  });

  if (!result) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Check if AI is available via env vars (not cached — env vars are static per process)
  const aiPlatformAvailable = !!(
    process.env.ANTHROPIC_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.GEMINI_API_KEY
  );

  const response = NextResponse.json({ ...result, aiPlatformAvailable });
  response.headers.set('Cache-Control', 'private, max-age=120, stale-while-revalidate=300');
  return response;
}
