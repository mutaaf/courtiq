// ─── Ticket 0083 — program-scoped Practice Arc memory ─────────────────────
//
// Pure helper that aggregates the program's PRIOR practice plans across all
// OTHER teams in the same (org_id, age_group, sport_id) tuple, groups them
// by season_week, and returns a week-by-week arc shape:
// `{ week_index, top_skills[≤2], team_count, practice_count }`.
//
// This is the cross-COACH-within-PROGRAM counterpart to ticket 0018's
// same-coach within-season arc memory. Where 0018 remembers what the
// CURRENT coach was working on last week, 0083 remembers what the
// program's OTHER coaches were working on last YEAR for the same age
// group — so a brand-new fall coach in October lands on a real shape
// rather than an empty arc.
//
// Schema reconciliation (LESSONS#0096):
//   - `plans` has NO org_id / age_group / sport_id / season_week columns.
//     The caller is responsible for joining `plans` ↔ `teams` and threading
//     the tuple through ProgramArcPlanRow. The route's filter does the
//     team-level scoping; the helper enforces the row-level filter as
//     defense-in-depth.
//   - The plans table's `curriculum_week` column is the existing
//     deterministic week-index the helper reads as `season_week`. Callers
//     mapping over the live row set should pass
//     `season_week: row.curriculum_week`.
//
// Reads no DB. Writes no AI. Mirrors `src/lib/emergent-focus-utils.ts`
// (ticket 0071) — a tiny pure module the route + the e2e + the unit tests
// can pin without a Supabase mock.

/** Per-plan input to the aggregator. The caller pre-joins teams to expose
 *  org_id/age_group/sport_id on each row so the filter is rowwise. */
export interface ProgramArcPlanRow {
  team_id: string;
  org_id: string;
  age_group: string;
  sport_id: string;
  skills_targeted: string[] | null;
  created_at: string;
  /** Maps to the existing `plans.curriculum_week` column (schema
   *  reconciliation — the ticket prose's "season_week" is the existing
   *  curriculum_week index). Null = plan can't be placed on the arc. */
  season_week: number | null;
}

/** Surfaceable per-week arc shape: what the program's other teams
 *  emphasised on this week of the season last year. */
export interface ProgramArcWeek {
  week_index: number;
  top_skills: string[];
  team_count: number;
  practice_count: number;
}

export interface ComputeProgramArcShapeArgs {
  plans: ProgramArcPlanRow[];
  /** Excluded from the aggregate — the caller's own team's plans do not
   *  contribute to the "program memory" (the memory comes from OTHER teams). */
  callerTeamId: string;
  orgId: string;
  ageGroup: string;
  sportId: string;
  /** Number of seasons back to consider — default 1 (last season). A
   *  "season" is approximated as 365 days for the helper's purposes;
   *  the route can override via the query param. */
  seasonLookback?: number;
  /** Minimum DISTINCT teams contributing across the season for the
   *  coverage to read 'sufficient' — default 1 (the ticket's scarcity bar). */
  minTeamCount?: number;
  /** Minimum total practice count across the season for the coverage to
   *  read 'sufficient' — default 12 (the ticket's scarcity bar). */
  minPracticeCount?: number;
  /** Anchor for the season-lookback window. The route passes Date.now()
   *  at request time; tests pass a fixed anchor for determinism. */
  nowMs: number;
}

export interface ProgramArcShape {
  coverage: 'sufficient' | 'thin';
  weeks: ProgramArcWeek[];
}

const DEFAULTS = {
  seasonLookback: 1,
  minTeamCount: 1,
  minPracticeCount: 12,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const SEASON_MS = 365 * DAY_MS;
const MAX_TOP_SKILLS_PER_WEEK = 2;

/**
 * Aggregate program-scoped plans into a week-by-week arc shape. The caller
 * pre-filters to the right program at the SQL layer; this helper enforces
 * the same filter rowwise as defense-in-depth so a permissive query never
 * leaks cross-program rows into the surface.
 *
 * Deterministic across input order: weeks are sorted by week_index ASC,
 * top_skills within a week are sorted by frequency DESC with the skill
 * string's natural sort as the tiebreak.
 */
export function computeProgramArcShape(args: ComputeProgramArcShapeArgs): ProgramArcShape {
  const {
    plans,
    callerTeamId,
    orgId,
    ageGroup,
    sportId,
    seasonLookback = DEFAULTS.seasonLookback,
    minTeamCount = DEFAULTS.minTeamCount,
    minPracticeCount = DEFAULTS.minPracticeCount,
    nowMs,
  } = args;

  if (!Array.isArray(plans) || plans.length === 0) {
    return { coverage: 'thin', weeks: [] };
  }

  const windowStart = nowMs - seasonLookback * SEASON_MS;

  // week_index → { teamIds: Set<string>, practiceCount: number,
  //                skillCount: Map<string, number> }
  const byWeek = new Map<
    number,
    { teamIds: Set<string>; practiceCount: number; skillCount: Map<string, number> }
  >();
  const totalTeams = new Set<string>();
  let totalPractices = 0;

  for (const row of plans) {
    if (!row || typeof row !== 'object') continue;
    // Rowwise filter scoping — defense-in-depth even if the SQL layer
    // pre-filtered. The caller's own team is excluded from the aggregate.
    if (row.team_id === callerTeamId) continue;
    if (row.org_id !== orgId) continue;
    if (row.age_group !== ageGroup) continue;
    if (row.sport_id !== sportId) continue;
    // Drop plans the helper cannot place on the arc.
    if (typeof row.season_week !== 'number' || !Number.isFinite(row.season_week)) continue;

    const ts = Date.parse(row.created_at);
    if (!Number.isFinite(ts) || ts < windowStart) continue;

    const weekIndex = row.season_week;
    let bucket = byWeek.get(weekIndex);
    if (!bucket) {
      bucket = {
        teamIds: new Set<string>(),
        practiceCount: 0,
        skillCount: new Map<string, number>(),
      };
      byWeek.set(weekIndex, bucket);
    }
    bucket.teamIds.add(row.team_id);
    bucket.practiceCount += 1;
    totalTeams.add(row.team_id);
    totalPractices += 1;

    if (Array.isArray(row.skills_targeted)) {
      for (const raw of row.skills_targeted) {
        if (typeof raw !== 'string') continue;
        const skill = raw.trim();
        if (!skill) continue;
        bucket.skillCount.set(skill, (bucket.skillCount.get(skill) ?? 0) + 1);
      }
    }
  }

  // Build the week-by-week shape with deterministic ordering.
  const weeks: ProgramArcWeek[] = Array.from(byWeek.entries())
    .map(([weekIndex, bucket]) => {
      const topSkills = Array.from(bucket.skillCount.entries())
        .sort((a, b) => {
          if (b[1] !== a[1]) return b[1] - a[1];
          return a[0].localeCompare(b[0]);
        })
        .slice(0, MAX_TOP_SKILLS_PER_WEEK)
        .map(([s]) => s);
      return {
        week_index: weekIndex,
        top_skills: topSkills,
        team_count: bucket.teamIds.size,
        practice_count: bucket.practiceCount,
      };
    })
    .sort((a, b) => a.week_index - b.week_index);

  const coverage: 'sufficient' | 'thin' =
    totalTeams.size >= minTeamCount && totalPractices >= minPracticeCount
      ? 'sufficient'
      : 'thin';

  return { coverage, weeks };
}
