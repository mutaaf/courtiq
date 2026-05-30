import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import {
  buildPulsePayload,
  isoWeekRange,
  type PulseObservationInput,
  type PulseSessionInput,
} from '@/lib/weekly-pulse-utils';
import { makeReferralCode } from '@/lib/referral-code';
import { readProgramFocus } from '@/lib/ai/program-focus';
import {
  buildCoachingSignature,
  type CoachPlanRow,
} from '@/lib/coaching-signature-utils';

// GET /api/weekly-pulse/[token] — public, no auth. Resolves the active token
// → its (coach, team, iso_week) → joins live to teams / sports / observations
// / sessions to compute the team-level aggregate the public /week/[token]
// page renders.
//
// The payload is an allow-list of EXACTLY these keys (sorted) — see
// PULSE_PAYLOAD_KEYS in src/lib/weekly-pulse-utils.ts:
//
//   ageGroup, caption, coachFirstName, focusLine, isoWeek,
//   sessionCount, sportName, teamName, topCategories
//
// PLUS a `referralCode` (the publisher's makeReferralCode(coach.id) so the
// public page's CTA can deep-link /signup?ref=<code> for warm-landing per
// 0011/0021). This route is in publicPaths in src/lib/supabase/middleware.ts.
//
// COPPA: the joined sources (observations / sessions / teams / coaches /
// sports / config_overrides / plans) include per-player rows the route NEVER
// surfaces. The response shape is fixed by `buildPulsePayload` and asserted
// keyset-equal in tests/api/weekly-pulse-token-get.test.ts; observation TEXT
// is read here only to count categories — the text itself is never returned.
// The coach's last name and email are never returned (the helper splits
// full_name server-side and exposes only the first token).
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
      .from('weekly_pulse_shares')
      .select('id, token, coach_id, team_id, iso_week, caption, is_active')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (!share) {
      return NextResponse.json({ error: 'Pulse not found or inactive' }, { status: 404 });
    }

    // Resolve the team + its sport. The select stays narrow on PURPOSE —
    // every column listed here is either a team-level display string the
    // public card already renders, or the org_id needed to resolve the
    // program weekly focus. No `players`-style join. `teams` has no
    // `coach_id` column — the share row already carries the publisher
    // identity via its own `coach_id` (LESSONS#0039 family: schema wins).
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, age_group, org_id, sport_id')
      .eq('id', share.team_id)
      .single();

    if (!team) {
      return NextResponse.json({ error: 'Pulse not found or inactive' }, { status: 404 });
    }

    // Resolve the publishing coach's FIRST name only. The helper splits
    // full_name on the first whitespace run server-side; the last name and
    // email are never read into the response.
    const { data: coach } = await supabase
      .from('coaches')
      .select('id, full_name')
      .eq('id', share.coach_id)
      .single();

    // Resolve the sport name (e.g. 'Basketball') if the team has one.
    let sportName: string | null = null;
    if (team.sport_id) {
      const { data: sport } = await supabase
        .from('sports')
        .select('id, name')
        .eq('id', team.sport_id)
        .single();
      sportName = sport?.name ?? null;
    }

    // Compute the week's observation + session aggregate. ISO weeks always
    // start Monday; isoWeekRange returns the inclusive [Mon 00:00, Sun
    // 23:59:59.999] UTC range. Observations rows can legitimately have
    // player_id set — the route does NOT read it.
    const range = isoWeekRange(share.iso_week);
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

    // Focus line: program weekly focus (0031) if the org has one and is on a
    // tier that includes the feature; else fall back to the coach's signature
    // (0037) top-skill if they have enough plans for a signature; else null.
    // NEVER any per-player text.
    let focusLine: string | null = null;
    try {
      const programFocus = await readProgramFocus(team.id, supabase);
      if (typeof programFocus === 'string' && programFocus.trim().length > 0) {
        focusLine = programFocus.trim();
      } else {
        const { data: planRows } = await supabase
          .from('plans')
          .select('id, type, skills_targeted, content_structured')
          .eq('coach_id', share.coach_id);
        const signature = buildCoachingSignature((planRows ?? []) as CoachPlanRow[]);
        if (signature && signature.top_skills.length > 0) {
          focusLine = signature.top_skills.slice(0, 2).join(' & ');
        }
      }
    } catch {
      // Best-effort focus resolution; a missing focus is rendered as null on
      // the public page (the card still shows session count + top categories).
      focusLine = null;
    }

    const payload = buildPulsePayload({
      team: { name: team.name, age_group: team.age_group ?? null },
      coach: { full_name: coach?.full_name ?? null },
      sport: sportName ? { name: sportName } : null,
      observations,
      sessions,
      isoWeek: share.iso_week,
      focusLine,
      caption: share.caption ?? null,
    });

    // The referral code is computed server-side from the joined coach id, so a
    // forged `?ref=` in the URL is overwritten by the page's computed CTA
    // (LESSONS#0039 — never trust a client-supplied identifier).
    const referralCode = share.coach_id ? makeReferralCode(share.coach_id) : null;

    return NextResponse.json({ ...payload, referralCode });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Weekly pulse share view error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
