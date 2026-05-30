import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import {
  buildPulsePayload,
  currentIsoWeek,
  isoWeekRange,
  type PulseObservationInput,
  type PulseSessionInput,
} from '@/lib/weekly-pulse-utils';
import { readProgramFocus } from '@/lib/ai/program-focus';
import {
  buildCoachingSignature,
  type CoachPlanRow,
} from '@/lib/coaching-signature-utils';

// GET /api/weekly-pulse/preview?teamId=<id> — authed live preview the home
// card uses to render BEFORE the coach taps "Share this week". Returns the
// SAME payload shape as the public token GET (minus `referralCode`, which
// only the public surface needs). Lets the home card decide whether to render
// at all — on a coach with no observations this week, the card stays absent
// (silence beats nag, ticket decision).
//
// AUTHENTICATED. NOT in publicPaths. The /api/weekly-pulse/ blanket prefix in
// middleware covers all subpaths but every authed route in this family
// self-enforces auth in the handler.
export async function GET(request: Request) {
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const teamId = url.searchParams.get('teamId');
  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, age_group, org_id, sport_id, coach_id')
      .eq('id', teamId)
      .eq('coach_id', user.id)
      .single();

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found for this coach' },
        { status: 404 },
      );
    }

    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name')
      .eq('id', user.id)
      .single();

    let sportName: string | null = null;
    if (team.sport_id) {
      const { data: sport } = await supabase
        .from('sports')
        .select('id, name')
        .eq('id', team.sport_id)
        .single();
      sportName = sport?.name ?? null;
    }

    const isoWeek = currentIsoWeek();
    const range = isoWeekRange(isoWeek);
    let observations: PulseObservationInput[] = [];
    let sessions: PulseSessionInput[] = [];
    if (range) {
      const { data: obsRows } = await supabase
        .from('observations')
        .select('id, category, sentiment, created_at')
        .eq('team_id', team.id)
        .gte('created_at', range.start.toISOString())
        .lte('created_at', range.end.toISOString());
      observations = ((obsRows ?? []) as Array<{ category?: string | null; sentiment?: string | null }>)
        .map((o) => ({ category: o.category ?? null, sentiment: o.sentiment ?? null }));

      const { data: sessionRows } = await supabase
        .from('sessions')
        .select('id, date')
        .eq('team_id', team.id)
        .gte('date', range.start.toISOString().slice(0, 10))
        .lte('date', range.end.toISOString().slice(0, 10));
      sessions = ((sessionRows ?? []) as Array<{ id: string }>)
        .map((s) => ({ id: s.id }));
    }

    let focusLine: string | null = null;
    try {
      const programFocus = await readProgramFocus(team.id, supabase);
      if (typeof programFocus === 'string' && programFocus.trim().length > 0) {
        focusLine = programFocus.trim();
      } else {
        const { data: planRows } = await supabase
          .from('plans')
          .select('id, type, skills_targeted, content_structured')
          .eq('coach_id', user.id);
        const signature = buildCoachingSignature((planRows ?? []) as CoachPlanRow[]);
        if (signature && signature.top_skills.length > 0) {
          focusLine = signature.top_skills.slice(0, 2).join(' & ');
        }
      }
    } catch {
      focusLine = null;
    }

    // Also report whether the coach has ALREADY shared this week (so the home
    // card's button reads "Copy link" instead of "Share this week" — the
    // sheet still POSTs /create, which short-circuits to the idempotent reuse
    // branch and returns the same token).
    const { data: existing } = await supabase
      .from('weekly_pulse_shares')
      .select('id, token, is_active')
      .eq('coach_id', user.id)
      .eq('team_id', team.id)
      .eq('iso_week', isoWeek)
      .eq('is_active', true)
      .single();

    const payload = buildPulsePayload({
      team: { name: team.name, age_group: team.age_group ?? null },
      coach: { full_name: coach?.full_name ?? null },
      sport: sportName ? { name: sportName } : null,
      observations,
      sessions,
      isoWeek,
      focusLine,
      caption: null,
    });

    return NextResponse.json({
      ...payload,
      existingToken: existing?.token ?? null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Weekly pulse preview error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
