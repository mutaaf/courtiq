// Ticket 0047 — pure helper for the referral-conversion celebration card.
//
// Diffs the inviting coach's CURRENT referral count vs. their LAST SEEN
// count and builds the celebration message string. No DB I/O lives here;
// the API routes do the IO and pass values in.
//
// Voice: the message is constructed POSITIVELY — "Coach <First> you invited
// just joined SportsIQ" — and never enumerates the AGENTS.md banned tokens
// (journey, amazing, exciting, elevate, empower, synergy). See LESSONS#0023
// for why a verbatim ban-list breaks any test that lints the rendered
// surface for banned words.
//
// Privacy: the helper consumes only `coach_first_name` from the upstream
// lookup; even if the route ever widened that input, the helper trims to the
// first token so emails / surnames / full-name leakage is impossible at the
// message layer.

export interface ReferralCelebrationInput {
  currentCount: number;
  lastSeenCount: number;
  latestReferral: { coach_first_name: string; joined_at: string } | null;
}

export interface ReferralCelebration {
  show: boolean;
  message: string | null;
}

const NAMED_MESSAGE = (first: string) =>
  `Coach ${first} you invited just joined SportsIQ`;
const ANON_MESSAGE = 'Someone you invited just joined SportsIQ';

/** Returns first-name only (split on whitespace). Defensive against widened input. */
export function extractFirstToken(name: string | null | undefined): string {
  if (!name) return '';
  return name.trim().split(/\s+/)[0] ?? '';
}

export function referralCelebrationFor(
  input: ReferralCelebrationInput,
): ReferralCelebration {
  const { currentCount, lastSeenCount, latestReferral } = input;

  // No new conversions — defensive against currentCount < lastSeenCount too.
  if (currentCount <= lastSeenCount) {
    return { show: false, message: null };
  }

  const first = extractFirstToken(latestReferral?.coach_first_name);
  if (latestReferral && first) {
    return { show: true, message: NAMED_MESSAGE(first) };
  }
  return { show: true, message: ANON_MESSAGE };
}
