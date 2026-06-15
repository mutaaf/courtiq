// ─── Ticket 0083 — program-scoped Practice Arc summary composer ────────────
//
// Deterministic, AI-free composer for the one-line program arc summary
// the <ProgramArcHistoryHint /> renders above the empty Practice Arc
// state. Given a week-by-week shape from computeProgramArcShape, picks
// the two CONTIGUOUS week ranges with the strongest top-skill frequency
// and composes one sentence:
//
//   "Last year's <ageGroup> <programName> spent weeks A-B on X and
//    weeks C-D on Y; that arc carried for them."
//
// Mirrors LESSONS#0023 voice: clipboard tone, never marketing. The voice
// scan helper `containsBannedWord` uses LITERAL spaces (not `\s+`) per
// LESSONS#0061 so labelled-key newline structure cannot false-positive.
//
// Reads no DB. Writes no AI. Mirrors the shape of
// `src/lib/emergent-focus-utils.ts` — a tiny pure module the route + the
// component test can pin without a Supabase mock.

/** The minimal week-row shape the composer reads. Mirrors the
 *  ProgramArcWeek shape but is redeclared here so the helper has no
 *  cross-file dependency for type-only consumers (the route can pass the
 *  ProgramArcShape.weeks array directly because of structural typing). */
export interface ProgramArcSummaryWeek {
  week_index: number;
  top_skills: string[];
  team_count: number;
  practice_count: number;
}

export interface ProgramArcSummaryOpts {
  /** The program's display name (organizations.name). Rendered verbatim. */
  programName: string;
  /** The age group label (teams.age_group like "U10" or "11-13"). */
  ageGroup: string;
}

interface SkillRange {
  skill: string;
  startWeek: number;
  endWeek: number;
  /** Total weight = sum of frequency the skill appeared as a top-2 in
   *  weeks inside the range — used to rank between candidate ranges. */
  weight: number;
}

/** Internal: walk the weeks and discover every contiguous run where a
 *  skill is in the week's top_skills. Returns one record per (skill,
 *  contiguous run). */
function findContiguousRanges(weeks: ProgramArcSummaryWeek[]): SkillRange[] {
  // Stable order ascending — defensive even though the helper already
  // emits weeks sorted.
  const ordered = [...weeks].sort((a, b) => a.week_index - b.week_index);

  // skill → array of {start, end, weight} runs.
  const runs: SkillRange[] = [];
  // skill → currently open range (or null).
  const openBySkill = new Map<string, { startWeek: number; endWeek: number; weight: number }>();

  // Helper to close every still-open range tagged at <= the given week,
  // because the run is no longer contiguous past that point.
  function closeRange(skill: string) {
    const open = openBySkill.get(skill);
    if (!open) return;
    runs.push({ skill, startWeek: open.startWeek, endWeek: open.endWeek, weight: open.weight });
    openBySkill.delete(skill);
  }

  let lastWeek: number | null = null;
  for (const week of ordered) {
    // Any skill that was open but did NOT appear in THIS week's top_skills,
    // or if this week is not adjacent to the previous, must close.
    if (lastWeek !== null && week.week_index !== lastWeek + 1) {
      for (const skill of Array.from(openBySkill.keys())) closeRange(skill);
    }
    const presentThisWeek = new Set(week.top_skills);
    // Close ranges for skills that did not continue this week.
    for (const skill of Array.from(openBySkill.keys())) {
      if (!presentThisWeek.has(skill)) closeRange(skill);
    }
    // Open or extend ranges for skills present this week.
    for (const skill of week.top_skills) {
      const open = openBySkill.get(skill);
      if (open) {
        open.endWeek = week.week_index;
        open.weight += 1;
      } else {
        openBySkill.set(skill, { startWeek: week.week_index, endWeek: week.week_index, weight: 1 });
      }
    }
    lastWeek = week.week_index;
  }
  // Close every still-open range.
  for (const skill of Array.from(openBySkill.keys())) closeRange(skill);

  return runs;
}

/** Format a single week range — "weeks 2-4" or "week 3" when start==end. */
function formatRangeLabel(startWeek: number, endWeek: number): string {
  if (startWeek === endWeek) return `week ${startWeek}`;
  return `weeks ${startWeek}-${endWeek}`;
}

/**
 * Compose the one-line program arc summary. Returns null when the input
 * has no rangeable week data (caller should treat null as "show no hint").
 *
 * Deterministic across input order: ranges sort by weight DESC, then by
 * startWeek ASC, then by skill string ASC.
 */
export function composeProgramArcSummary(
  weeks: ProgramArcSummaryWeek[],
  opts: ProgramArcSummaryOpts,
): string | null {
  if (!Array.isArray(weeks) || weeks.length === 0) return null;

  const ranges = findContiguousRanges(weeks);
  if (ranges.length === 0) return null;

  // Rank candidate ranges: by total weight descending, then by startWeek
  // ascending so the EARLIER block comes first in a tie, then by skill
  // name ascending for full determinism.
  ranges.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (a.startWeek !== b.startWeek) return a.startWeek - b.startWeek;
    return a.skill.localeCompare(b.skill);
  });

  // Pick at most two ranges with DISTINCT skills.
  const top: SkillRange[] = [];
  const seenSkills = new Set<string>();
  for (const range of ranges) {
    if (seenSkills.has(range.skill)) continue;
    top.push(range);
    seenSkills.add(range.skill);
    if (top.length === 2) break;
  }

  if (top.length === 0) return null;

  // Order the chosen ranges by startWeek so the sentence reads
  // chronologically.
  top.sort((a, b) => a.startWeek - b.startWeek);

  const programName = (opts.programName || '').trim();
  const ageGroup = (opts.ageGroup || '').trim();

  // Build the sentence. Voice is clipboard-tone per LESSONS#0023 —
  // instruct positively in code, never enumerate banned tokens here.
  const prefix = `Last year's ${ageGroup} ${programName}`.trim();
  if (top.length === 1) {
    const r = top[0];
    return `${prefix} spent ${formatRangeLabel(r.startWeek, r.endWeek)} on ${r.skill}; that arc carried for them.`;
  }
  const [a, b] = top;
  return `${prefix} spent ${formatRangeLabel(a.startWeek, a.endWeek)} on ${a.skill} and ${formatRangeLabel(b.startWeek, b.endWeek)} on ${b.skill}; that arc carried for them.`;
}

// ─── Banned-word scan (LESSONS#0023, #0061) ──────────────────────────────

/** AGENTS.md banned words. Stored as a private list — never enumerated in
 *  a user-facing string. The literal-space scan is intentional per
 *  LESSONS#0061: \s+ would conflate labelled-key newline structure
 *  ("skill:\nNeighborhood") with the banned word "Neighborhood" prefix
 *  matches. Words sourced from the AGENTS.md "Voice" section; this list
 *  is a defensive guard, not the canonical source. */
const BANNED_TOKENS: ReadonlyArray<string> = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

/** Case-insensitive whole-token scan. Uses LITERAL spaces (not \s+) per
 *  LESSONS#0061 so a labelled-key newline does not produce a false
 *  positive. */
export function containsBannedWord(text: string): boolean {
  if (typeof text !== 'string' || text.length === 0) return false;
  const lower = text.toLowerCase();
  for (const token of BANNED_TOKENS) {
    if (lower.includes(token)) return true;
  }
  return false;
}
