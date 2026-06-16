/**
 * Ticket 0084 — `buildViralSocialProof` pure helper.
 *
 * Picks the SINGLE strongest viral event in a 14-day window for the
 * calling coach and returns ONE short factual line for the quota-wall
 * social-proof slot. Mirrors the pure-helper posture of 0072 / 0073 /
 * 0074: no DB, no clock other than the explicit `nowMs` argument.
 *
 * Write like a coach's clipboard — short factual statements, no
 * breathless hype words (LESSONS#0023 — instruct positively in the
 * jsdoc; never embed the verbatim ban-list in code that a banned-word
 * scan will then read).
 *
 * The strings never name a parent by full name (first-name + team-name
 * only is the consent posture; this helper is structurally constrained
 * — it has no input slot for a parent name at all). The drill-clone
 * variant attributes the cloning side ONLY by program name, never by
 * cloning-coach name (LESSONS#0073).
 *
 * Priority order (highest first; ties broken by recency):
 *   reputation_milestone
 *   > drill_stick_signal
 *   > parent_forward_cross_team
 *   > parent_forward_on_team
 *   > drill_clone
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_DAYS = 14;
const MAX_LINE_LEN = 140;

export type ViralProofEventKind =
  | 'parent_forward_on_team'
  | 'parent_forward_cross_team'
  | 'drill_clone'
  | 'drill_stick_signal'
  | 'reputation_milestone';

/**
 * Closed-enum union — every kind has its own required-field shape so
 * the formatter is a total function over the input.
 */
export type ViralProofEvent =
  | {
      kind: 'parent_forward_on_team';
      occurredAtMs: number;
      teamName: string;
      senderCount: number;
    }
  | {
      kind: 'parent_forward_cross_team';
      occurredAtMs: number;
      teamName: string;
    }
  | {
      kind: 'drill_clone';
      occurredAtMs: number;
      programName: string;
      drillTitle: string;
    }
  | {
      kind: 'drill_stick_signal';
      occurredAtMs: number;
      programName: string;
      drillTitle: string;
    }
  | {
      kind: 'reputation_milestone';
      occurredAtMs: number;
      programCount: number;
    };

export interface BuildViralSocialProofArgs {
  events: ViralProofEvent[];
  nowMs: number;
}

export interface ViralSocialProofResult {
  line: string;
  eventKind: ViralProofEventKind;
}

const PRIORITY: Record<ViralProofEventKind, number> = {
  reputation_milestone: 5,
  drill_stick_signal: 4,
  parent_forward_cross_team: 3,
  parent_forward_on_team: 2,
  drill_clone: 1,
};

function isFresh(ev: ViralProofEvent, nowMs: number): boolean {
  return nowMs - ev.occurredAtMs <= WINDOW_DAYS * DAY_MS && ev.occurredAtMs <= nowMs;
}

function format(ev: ViralProofEvent): string {
  // Each variant renders ONE short string. The fixed prefixes/suffixes
  // were tuned against the AGENTS.md voice contract — clipboard tone,
  // no hype words. The matrix test in tests/lib/viral-social-proof.test.ts
  // scans every variant for the banned set.
  switch (ev.kind) {
    case 'parent_forward_on_team': {
      const subject = ev.senderCount === 1 ? 'parent' : 'parents';
      return `${ev.senderCount} ${subject} on the ${ev.teamName} forwarded your last report this week`;
    }
    case 'parent_forward_cross_team': {
      return `a parent on a teammate team forwarded your last report this week`;
    }
    case 'drill_clone': {
      return `a coach in the ${ev.programName} program cloned your ${ev.drillTitle} this week`;
    }
    case 'drill_stick_signal': {
      return `a coach who cloned your ${ev.drillTitle} thumbed it up after running it`;
    }
    case 'reputation_milestone': {
      return `your work was cloned by coaches in ${ev.programCount} programs this month`;
    }
  }
}

function truncate(line: string): string {
  if (line.length <= MAX_LINE_LEN) return line;
  return line.slice(0, MAX_LINE_LEN - 1).trimEnd() + '…';
}

/**
 * Pick the SINGLE strongest fresh event and return its rendered line,
 * or `null` when no event is fresh enough to render.
 */
export function buildViralSocialProof(
  args: BuildViralSocialProofArgs,
): ViralSocialProofResult | null {
  const { events, nowMs } = args;
  if (!events || events.length === 0) return null;

  const fresh = events.filter((e) => isFresh(e, nowMs));
  if (fresh.length === 0) return null;

  // Highest priority wins; ties broken by recency (most-recent first).
  // Stable comparator → deterministic across input order.
  const sorted = [...fresh].sort((a, b) => {
    const pa = PRIORITY[a.kind];
    const pb = PRIORITY[b.kind];
    if (pa !== pb) return pb - pa;
    return b.occurredAtMs - a.occurredAtMs;
  });

  const top = sorted[0];
  return {
    line: truncate(format(top)),
    eventKind: top.kind,
  };
}
