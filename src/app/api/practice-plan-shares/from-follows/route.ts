import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// GET /api/practice-plan-shares/from-follows — ticket 0063.
//
// Returns up to 5 most-recent active `practice_plan_shares` rows whose
// `coach_id` is in the caller's `coach_follows.followee_id` set. This is the
// source the `/plans` "From coaches you follow" section reads (and a
// follow-up email-digest could use too — it is the same shape).
//
// Response shape:
//   {
//     plans: Array<{
//       token: string,
//       planTitle: string | null,
//       publisherFirstName: string | null,
//       publisherDisplaySport: string,
//       ageGroup: string | null,
//       createdAt: string,
//     }>,
//   }
//
// COPPA: the route never returns the publisher's email, last name, or any
// player data. The `.select()` allow-lists on every joined table enforce
// this structurally. The publisher's FIRST name only is parsed server-side
// (LESSONS#0009 - server-side string operations are the trust boundary).
//
// Tier posture: universal (no `tier.ts` import) — gating discovery inverts
// the network effect (same posture as 0055).
export async function GET(_request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  try {
    // 1) Resolve the caller's followee set. Empty → empty payload.
    const { data: followsRaw } = await admin
      .from('coach_follows')
      .select('followee_id')
      .eq('follower_id', user.id);
    const follows = (followsRaw ?? []) as Array<{ followee_id: string }>;
    if (follows.length === 0) {
      return NextResponse.json({ plans: [] });
    }
    const followeeIds = Array.from(new Set(follows.map((f) => f.followee_id)));

    // 2) Active practice-plan shares from those publishers (most-recent
    //    first, capped at 5). The plan join carries id + title + team_id +
    //    type — we filter to type='practice' server-side to guarantee no
    //    other plan kind crosses (defense in depth; the publish route only
    //    mints shares for practice plans).
    const { data: sharesRaw } = await admin
      .from('practice_plan_shares')
      .select('token, coach_id, plan_id, created_at, is_active, plans(id, title, team_id, type)')
      .in('coach_id', followeeIds)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(5);
    const shares = (sharesRaw ?? []) as Array<{
      token: string;
      coach_id: string;
      plan_id: string;
      created_at: string;
      is_active: boolean;
      plans?:
        | { id: string; title: string | null; team_id: string; type: string }
        | Array<{ id: string; title: string | null; team_id: string; type: string }>;
    }>;
    if (shares.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    const practiceShares = shares.filter((s) => {
      const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
      return plan?.type === 'practice';
    });
    if (practiceShares.length === 0) {
      return NextResponse.json({ plans: [] });
    }

    // 3) Resolve the publisher first names — `.select('id, full_name')`
    //    allow-list ONLY; NEVER read email / phone / preferences here
    //    (LESSONS#0036 COPPA posture).
    const publisherIds = Array.from(new Set(practiceShares.map((s) => s.coach_id)));
    const { data: coachesRaw } = await admin
      .from('coaches')
      .select('id, full_name')
      .in('id', publisherIds);
    const fullNameById = new Map<string, string>();
    for (const c of (coachesRaw ?? []) as Array<{ id: string; full_name: string | null }>) {
      fullNameById.set(c.id, c.full_name ?? '');
    }

    // 4) Resolve each plan's team age group + sport display label. We pull
    //    the team rows in a single `.in(id, ...)` so the route stays a
    //    bounded fan-out. `.select` allow-list is id + age_group +
    //    sports(slug) — never coach_id, never any player-related field.
    const teamIds = Array.from(
      new Set(
        practiceShares
          .map((s) => (Array.isArray(s.plans) ? s.plans[0]?.team_id : s.plans?.team_id))
          .filter((v): v is string => typeof v === 'string'),
      ),
    );
    const { data: teamsRaw } = await admin
      .from('teams')
      .select('id, age_group, sports(slug)')
      .in('id', teamIds);
    const teamById = new Map<string, { ageGroup: string | null; sportSlug: string }>();
    for (const t of (teamsRaw ?? []) as Array<{
      id: string;
      age_group: string | null;
      sports?: { slug?: string } | Array<{ slug?: string }>;
    }>) {
      const sportField = t.sports;
      const slug = Array.isArray(sportField)
        ? sportField[0]?.slug ?? 'unknown'
        : sportField?.slug ?? 'unknown';
      teamById.set(t.id, { ageGroup: t.age_group ?? null, sportSlug: slug });
    }

    const plans = practiceShares.map((s) => {
      const plan = Array.isArray(s.plans) ? s.plans[0] : s.plans;
      const team = plan ? teamById.get(plan.team_id) : null;
      const fullName = fullNameById.get(s.coach_id) ?? '';
      const firstName = String(fullName).split(' ')[0] || null;
      return {
        token: s.token,
        planTitle: plan?.title ?? null,
        publisherFirstName: firstName,
        publisherDisplaySport: displaySportLabel(team?.sportSlug ?? 'unknown'),
        ageGroup: team?.ageGroup ?? null,
        createdAt: s.created_at,
      };
    });

    return NextResponse.json({ plans });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('practice-plan-shares from-follows error:', message);
    // Fail soft — a transient DB error should never block /plans.
    return NextResponse.json({ plans: [] });
  }
}

/** Map the sports.slug to the display label the section renders. */
function displaySportLabel(slug: string): string {
  switch (slug) {
    case 'basketball':
      return 'Basketball';
    case 'flag_football':
      return 'Flag Football';
    case 'soccer':
      return 'Soccer';
    case 'volleyball':
      return 'Volleyball';
    case 'baseball':
      return 'Baseball';
    default:
      return 'Sport';
  }
}
