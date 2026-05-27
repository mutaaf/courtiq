import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

// GET /api/practice-plan-shares/[token] — public, no auth. Resolves the active
// token → its practice plan → the publishing coach's FIRST name (server-side
// split). The payload is an allow-list of EXACTLY four keys:
//
//   planTitle:        string | null      // the plan's title
//   planContent:      Record<string,..>  // content_structured (drills, etc.)
//   coachFirstName:   string | null      // attribution; first name only
//   note:             string | null      // the publisher's optional one-liner
//
// COPPA: practice plans (type='practice') carry team-level drill content —
// drill names, durations, focus areas, never per-player data. The route
// HARD-PINS `.eq('type','practice')` so even a future plan type that embedded
// minor identifiers (the AI artifacts that do, like player_of_match, are
// different plan types) would NOT cross. The publisher's last name and email
// are never read or returned. This route is in publicPaths in
// src/lib/supabase/middleware.ts.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Resolve the active share token.
    const { data: share } = await supabase
      .from('practice_plan_shares')
      .select('id, plan_id, coach_id, note, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    }

    // Resolve the underlying practice plan. The .eq('type','practice') here is
    // load-bearing for COPPA: even if a future plan type embedded a minor
    // identifier (e.g. player_of_match), this route refuses to surface it.
    const { data: plan } = await supabase
      .from('plans')
      .select('id, team_id, coach_id, type, title, content_structured')
      .eq('id', share.plan_id)
      .eq('type', 'practice')
      .single();

    if (!plan) {
      return NextResponse.json({ error: 'Plan not found or inactive' }, { status: 404 });
    }

    // Resolve the publishing coach's FIRST name only. Last name and email are
    // never returned. The route reads `full_name` exclusively and splits it
    // server-side so a client-side splitter is never the trust boundary.
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name, email')
      .eq('id', share.coach_id)
      .single();

    const coachFirstName = coach?.full_name
      ? String(coach.full_name).split(' ')[0]
      : null;

    return NextResponse.json({
      planTitle: plan.title ?? null,
      planContent: plan.content_structured ?? {},
      coachFirstName,
      note: share.note ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Practice plan share view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
