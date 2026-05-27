import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// POST /api/practice-plan-shares/create — turn ONE practice plan the caller
// owns into a public, no-auth referral token (ticket 0049). The public page
// at /plan/[token] renders the plan and a CTA other coaches tap to clone it
// onto their own team. Free for every tier — gating publish inverts the
// network effect (ticket decision).
//
// This route is AUTHENTICATED — it is NOT in publicPaths (only /api/practice-
// plan-shares/<token> GETs are public). It self-enforces auth below.
//
// Idempotency: re-create on the same planId reuses the existing active row
// (so a publisher who taps "Publish" twice never ends up with two tokens).
// Mirrors src/app/api/team-card/create/route.ts byte-for-byte where applicable.
export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { planId, note } = body as { planId?: string; note?: string };
  if (!planId) {
    return NextResponse.json({ error: 'planId required' }, { status: 400 });
  }

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Verify the plan is a practice artifact owned by the caller. The schema's
    // PlanType uses `'practice'` (NOT `'practice_plan'`); the ticket prose's
    // shorthand is reconciled to the real enum here (Implementation log).
    // Scoping by (id, coach_id, type) means another coach's plan (or a non-
    // practice plan) simply isn't found — no cross-coach leakage.
    const { data: plan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type')
      .eq('id', planId)
      .eq('coach_id', user.id)
      .eq('type', 'practice')
      .single();

    if (!plan) {
      return NextResponse.json(
        { error: 'Practice plan not found for this coach' },
        { status: 404 },
      );
    }

    // Idempotency: if an active share already exists for this plan + coach,
    // reuse its token rather than mint a second one. The token is the public
    // URL — keeping it stable means the publisher's previously-shared link
    // never goes stale on a re-tap of Publish.
    const { data: existing } = await supabase
      .from('practice_plan_shares')
      .select('id, token, plan_id, coach_id, is_active')
      .eq('plan_id', plan.id)
      .eq('coach_id', user.id)
      .eq('is_active', true)
      .single();

    if (existing && existing.token) {
      return NextResponse.json({
        share: existing,
        token: existing.token,
        url: `/plan/${existing.token}`,
      });
    }

    // Same token shape as src/app/api/team-card/create/route.ts and
    // src/app/api/recap-card/create/route.ts.
    const token = randomBytes(16).toString('hex');

    // The optional one-line note rides on the share row, not the plan itself,
    // so editing the plan later never accidentally rewrites the publisher's
    // context. Trim to a sane length to keep the public page readable.
    const trimmedNote = typeof note === 'string' && note.trim().length > 0
      ? note.trim().slice(0, 280)
      : null;

    const { data: share, error } = await supabase
      .from('practice_plan_shares')
      .insert({
        token,
        plan_id: plan.id,
        coach_id: user.id,
        note: trimmedNote,
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
      url: `/plan/${token}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Practice plan share create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
