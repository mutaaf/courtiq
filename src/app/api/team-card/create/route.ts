import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// POST /api/team-card/create — turn ONE team_personality plan the caller owns
// into a public, no-auth referral token (ticket 0010). The public page at
// /team-card/[token] renders the card and a CTA carrying the coach's referral
// code. This is a growth surface: ungated by ticket decision (no tier check).
export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { planId } = body as { planId?: string };
  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Verify the plan is a team_personality artifact owned by the caller. Scoping
    // the lookup by coach_id AND type means another coach's plan (or a non-
    // personality plan) simply isn't found — no cross-coach leakage.
    const { data: plan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type')
      .eq('id', planId)
      .eq('coach_id', user.id)
      .eq('type', 'team_personality')
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: 'Team personality plan not found for this coach' },
        { status: 404 },
      );
    }

    // Same token shape as src/app/api/share/create/route.ts.
    const token = randomBytes(16).toString('hex');

    const { data: share, error } = await supabase
      .from('team_card_shares')
      .insert({
        token,
        plan_id: plan.id,
        coach_id: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      share,
      token,
      url: `/team-card/${token}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Team card create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
