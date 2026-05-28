// Ticket 0055 — pure helpers for the league-internal practice-plan discovery
// surface. No DB access, no fetch. Lives here so the route, the section
// component, and the vitest suite all consume the SAME row format and can
// never disagree.
//
// The single function `formatLeaguePlanRow` returns the line that renders
// under each peer plan row at the top of /plans, matching the format named
// by ticket 0055's acceptance criteria:
//
//   "Coach <first_name> — <plan_title> — <sport> age <age_group>"
//
// Voice: clipboard, not consumer-SaaS — no AGENTS.md banned tokens. We
// instruct positively (just compose the line) rather than enumerate banned
// words in any string (LESSONS#23).

export interface LeaguePlanRowInput {
  coachFirstName: string | null;
  planTitle: string | null;
  sportSlug: string;
  ageGroup: string | null;
}

export function formatLeaguePlanRow(input: LeaguePlanRowInput): string {
  // The publishing coach's first name. Falls back to a bare "Coach" rather
  // than crashing if upstream ever returns null — the row stays useful.
  const coachLabel = input.coachFirstName
    ? `Coach ${input.coachFirstName}`
    : 'Coach';

  // The plan title. The seed and the AI prompt both produce a non-empty
  // title, but a future row with no title still renders gracefully.
  const planLabel = (input.planTitle ?? '').trim() || 'Practice plan';

  // The sport slug is internal (snake_case); humanize underscores to spaces
  // for the rendered line. Slug normalisation lives next to the format so
  // every consumer renders the same string.
  const humanSport = input.sportSlug.replace(/_/g, ' ');

  // The age group is optional — only show "age <ag>" when we have one.
  const ageSegment = input.ageGroup ? ` age ${input.ageGroup}` : '';

  return `${coachLabel} — ${planLabel} — ${humanSport}${ageSegment}`;
}
