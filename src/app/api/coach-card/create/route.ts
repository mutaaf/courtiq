import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// POST /api/coach-card/create — turn the AUTHENTICATED coach's own profile into a
// public, no-auth referral token at /coach/[token] (ticket 0026). Unlike the
// team-card (0010) and season-recap (0017) surfaces — which key off a specific
// plan the coach owns — this card is scoped to the COACH themselves, so it takes
// NO planId. It is reuse-or-create: a coach has at most one active profile token
// at a time, so repeated calls are safe and return the same usable token. This is
// a growth surface: ungated by ticket decision (no tier check).
export async function POST(_request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Reuse-or-create: if the coach already has an active card, hand back the same
    // token rather than minting a second row. Keeps the public link stable across
    // repeated "Share my coaching profile" taps.
    const { data: existing } = await supabase
      .from('coach_card_shares')
      .select('token')
      .eq('coach_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.token) {
      return NextResponse.json({
        token: existing.token,
        url: `/coach/${existing.token}`,
      });
    }

    // Same token shape as src/app/api/team-card/create/route.ts.
    const token = randomBytes(16).toString('hex');

    const { data: share, error } = await supabase
      .from('coach_card_shares')
      .insert({
        token,
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
      url: `/coach/${token}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Coach card create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
