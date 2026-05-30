/**
 * Ticket 0057 — pure helpers for the weekly-pulse-share card.
 *
 * No database access, no AI call, no Supabase client. Three things:
 *   - `generateShareToken()` mirrors the deterministic-byte token used by
 *     team-card / season-recap / game-recap / practice-plan-shares.
 *   - `currentIsoWeek(date?)` returns the calendar-ISO week the card is
 *     stamped to (e.g. '2026-W22'). ISO weeks always start Monday; week 1
 *     contains the year's first Thursday.
 *   - `buildPulsePayload({...})` returns the EXACT keyset the public GET
 *     route serializes — no `player_*`, no `observation_text`, no `parent_*`.
 *
 * The pure boundary is the contract: the GET route uses these helpers, so
 * any future widening of what a public viewer sees has to thread through the
 * same allow-list (asserted by the route + the helper tests below).
 */

import { randomBytes } from 'crypto';

/** The four-shape allow-list the public route serializes. */
export interface PulsePayload {
  /** First name only (split server-side from coaches.full_name). */
  coachFirstName: string | null;
  /** Team display name (the coach's own team — they already see it on /home). */
  teamName: string;
  /** Sport name (e.g. 'Basketball'); resolved from the team's sport row. */
  sportName: string | null;
  /** Age group label (e.g. '11-13'); same column the team switcher reads. */
  ageGroup: string | null;
  /** ISO week the pulse belongs to (e.g. '2026-W22'). */
  isoWeek: string;
  /** Practice/game/scrimmage session count inside the ISO week. */
  sessionCount: number;
  /** Top 1-2 observation categories by count for the week. */
  topCategories: string[];
  /** Program weekly-focus (0031) or coach signature line (0037); never a player name. */
  focusLine: string | null;
  /** Optional one-line caption the publisher typed. */
  caption: string | null;
}

/** EXACT public-key allow-list. Sort + deep-equal-assert in route tests. */
export const PULSE_PAYLOAD_KEYS = [
  'ageGroup',
  'caption',
  'coachFirstName',
  'focusLine',
  'isoWeek',
  'sessionCount',
  'sportName',
  'teamName',
  'topCategories',
] as const;

/**
 * 32-hex-char opaque token. Mirrors the team-card / recap-card / practice-
 * plan-shares token shape. 16 bytes is enough entropy to make collisions
 * effectively impossible in the public-token namespace.
 */
export function generateShareToken(): string {
  return randomBytes(16).toString('hex');
}

/**
 * ISO 8601 week number for the given Date, formatted as `<YYYY>-W<NN>`.
 *
 * Standard algorithm: ISO weeks start Monday and week 1 contains the year's
 * first Thursday, so a Date in early January can belong to last year's week 52
 * (or 53) and a Date in late December can belong to next year's week 1. The
 * canonical formula (Wikipedia / W3C) is:
 *   - thursday = date - (weekday - 1) days, where Mon=1..Sun=7
 *   - yearStart = first day of thursday's calendar year
 *   - week = ceil( (thursday - yearStart + 1) / 7 )
 *   - ISO year is thursday's year (not the original date's year).
 *
 * We do the math in UTC to avoid local-vs-UTC midnight straddles flipping the
 * week (same family as LESSONS#36 / `formatFocusAge`'s UTC-day approach).
 */
export function currentIsoWeek(date: Date = new Date()): string {
  // Copy at UTC midnight of the same calendar day.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Mon=1..Sun=7
  const dayNum = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
  // Shift to the Thursday of this ISO week (Thursday determines the year).
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const isoYear = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

/**
 * Inverse of `currentIsoWeek`: returns the inclusive [Mon 00:00 UTC, Sun
 * 23:59:59.999 UTC] range the public route filters observations + sessions
 * by. Defensive on a malformed string (returns null).
 */
export function isoWeekRange(isoWeek: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-W(\d{2})$/.exec(isoWeek);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1 || week > 53) {
    return null;
  }
  // ISO week 1 contains Jan 4. Find that calendar day's ISO-Monday, then add
  // (week - 1) weeks.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4DayNum = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay();
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4DayNum - 1));
  const start = new Date(week1Monday);
  start.setUTCDate(start.getUTCDate() + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { start, end };
}

/** A minimal observation shape — just the fields the categorizer reads. */
export interface PulseObservationInput {
  category?: string | null;
  sentiment?: string | null;
}

/** A minimal session shape — just used to count practices/games in the week. */
export interface PulseSessionInput {
  id: string;
}

/** Pure inputs for the payload builder; no DB types leak into the helper. */
export interface PulsePayloadInputs {
  team: { name: string; age_group?: string | null };
  coach: { full_name?: string | null };
  sport: { name?: string | null } | null;
  observations: PulseObservationInput[];
  sessions: PulseSessionInput[];
  isoWeek: string;
  /** Program focus (0031) or coach signature line (0037); never a player name. */
  focusLine: string | null;
  /** Publisher's optional one-line caption (trimmed/length-bounded upstream). */
  caption: string | null;
}

/** Top 2 categories by combined needs-work + positive obs counts, ordered by count desc. */
export function topCategoriesFromObservations(obs: PulseObservationInput[]): string[] {
  const counts = new Map<string, number>();
  for (const o of obs) {
    const cat = typeof o.category === 'string' ? o.category.trim() : '';
    if (!cat) continue;
    // Per the AC: count BOTH 'needs-work' and 'positive' — neutral observations
    // are noise for a one-line "what we worked on" summary.
    const sent = typeof o.sentiment === 'string' ? o.sentiment.trim() : '';
    if (sent === 'needs-work' || sent === 'positive') {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    // Stable order: by count desc, ties broken alphabetically so the helper is
    // deterministic across runs.
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 2)
    .map(([cat]) => cat);
}

/**
 * Build the public-payload object the GET route serializes. The keyset
 * matches `PULSE_PAYLOAD_KEYS` exactly — adding a new field here without
 * adding it to the allow-list will fail the route's deep-equality test.
 *
 * `coachFirstName` is the LEADING token of `full_name` only (never the full
 * name); the helper does the same split the practice-plan-shares GET route
 * does so a future widening can't accidentally cross.
 */
export function buildPulsePayload(inputs: PulsePayloadInputs): PulsePayload {
  const firstName = inputs.coach?.full_name
    ? String(inputs.coach.full_name).trim().split(/\s+/)[0] || null
    : null;
  return {
    coachFirstName: firstName,
    teamName: inputs.team.name,
    sportName: inputs.sport?.name ?? null,
    ageGroup: inputs.team.age_group ?? null,
    isoWeek: inputs.isoWeek,
    sessionCount: Array.isArray(inputs.sessions) ? inputs.sessions.length : 0,
    topCategories: topCategoriesFromObservations(inputs.observations ?? []),
    focusLine: inputs.focusLine,
    caption: inputs.caption,
  };
}

/**
 * Format an ISO week ('2026-W22') as a human-readable date label
 * ('Week of May 25') for the public card's header. Returns the raw isoWeek
 * unchanged when the string is malformed (defensive: never throws).
 */
export function formatWeekHeader(isoWeek: string): string {
  const range = isoWeekRange(isoWeek);
  if (!range) return isoWeek;
  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const m = monthNames[range.start.getUTCMonth()];
  const d = range.start.getUTCDate();
  return `Week of ${m} ${d}`;
}
