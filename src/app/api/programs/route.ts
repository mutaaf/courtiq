import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

// The EXACT set of keys each program in the public directory payload exposes.
// This is an allow-list, not a deny-list: every program object is BUILT from
// these keys only, so anything per-coach or per-minor (names, jerseys, contact
// info, observation text) is structurally excluded — it can never be added by
// accident. (AGENTS.md COPPA / data-minimization — ticket 0033.) Mirrors
// PUBLIC_PERSONALITY_FIELDS in src/app/api/team-card/[token]/route.ts.
const PUBLIC_PROGRAM_FIELDS = ['name', 'slug', 'teamCount', 'sport'] as const;

// GET /api/programs — public, no auth, service-role. Lists ONLY organizations
// that have explicitly opted into discovery (a `settings.discoverable = true`
// jsonb flag). For each opted-in org returns org-level / aggregate data only:
// { name, slug, teamCount, sport }. An org without the opt-in is never listed,
// and no team/player data is exposed. Empty list → 200 { programs: [] }.
//
// The handler reads no params/body, so it declares zero parameters (LESSONS.md
// 2026-05-21 re: no-arg handlers).
export async function GET() {
  const supabase = await createServiceSupabase();

  try {
    // Opted-in orgs only — the discoverable flag is filtered on the DB query
    // itself, so a non-opted-in org can never reach the result set. Default OFF:
    // an org is invisible until a director turns the flag on.
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name, slug')
      .eq('settings->>discoverable', 'true')
      .order('name');

    const orgRows = (orgs ?? []) as Array<{ id: string; name: string; slug: string }>;
    if (orgRows.length === 0) {
      return NextResponse.json({ programs: [] });
    }

    const orgIds = orgRows.map((o) => o.id);

    // Active teams across all opted-in orgs (one query) — used for the aggregate
    // team count and to derive the org's sport. No team name/age data is exposed.
    const { data: teams } = await supabase
      .from('teams')
      .select('org_id, sport_id')
      .in('org_id', orgIds)
      .eq('is_active', true);

    const teamRows = (teams ?? []) as Array<{ org_id: string; sport_id: string | null }>;

    // Resolve sport NAMES for the distinct sport ids the teams reference.
    const sportIds = Array.from(
      new Set(teamRows.map((t) => t.sport_id).filter((s): s is string => Boolean(s))),
    );
    const sportNameById = new Map<string, string>();
    if (sportIds.length > 0) {
      const { data: sportRows } = await supabase
        .from('sports')
        .select('id, name')
        .in('id', sportIds);
      for (const s of (sportRows ?? []) as Array<{ id: string; name: string | null }>) {
        if (s.name) sportNameById.set(s.id, s.name);
      }
    }

    // Per-org aggregates: count active teams; derive the dominant sport.
    const teamsByOrg = new Map<string, Array<{ sport_id: string | null }>>();
    for (const t of teamRows) {
      const list = teamsByOrg.get(t.org_id) ?? [];
      list.push(t);
      teamsByOrg.set(t.org_id, list);
    }

    const programs = orgRows.map((org) => {
      const orgTeams = teamsByOrg.get(org.id) ?? [];

      // Sport = the most common sport name among the org's active teams (null
      // when the org has no active teams or no sport set). Honest, aggregate.
      const sportTally = new Map<string, number>();
      for (const t of orgTeams) {
        const name = t.sport_id ? sportNameById.get(t.sport_id) : undefined;
        if (name) sportTally.set(name, (sportTally.get(name) ?? 0) + 1);
      }
      let sport: string | null = null;
      let best = 0;
      for (const [name, count] of sportTally) {
        if (count > best) {
          best = count;
          sport = name;
        }
      }

      // Build the program object from the allow-list ONLY.
      const built: Record<string, unknown> = {
        name: org.name,
        slug: org.slug,
        teamCount: orgTeams.length,
        sport,
      };
      const safe: Record<string, unknown> = {};
      for (const key of PUBLIC_PROGRAM_FIELDS) safe[key] = built[key];
      return safe;
    });

    return NextResponse.json({ programs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[api/programs] error', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
