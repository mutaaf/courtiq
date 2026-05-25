// First-artifact activation nudge (ticket 0030).
//
// The activation arc (GettingStartedCard, FirstPracticeLauncher) walks a new
// coach to "capture an observation" and stops at the INPUT. This helper decides
// when to surface the missing final step — the OUTPUT: a coach who has logged
// enough notes to make a first shareable AI artifact but hasn't generated one
// yet. It is a pure function so eligibility is unit-testable without rendering,
// mirroring the pure-helper-plus-component split the other home cards use
// (next-best-actions-utils.ts behind quick-wins-card.tsx, etc.).

// "Enough notes" bar. Small on purpose: a coach who has captured a few
// observations already has enough material for a useful first report/debrief.
export const FIRST_ARTIFACT_OBS_THRESHOLD = 3;

// The CTA routes into an EXISTING first-artifact generator surface. /plans is
// the in-app artifact hub (parent report / report card / etc.) reachable for
// any coach — the nudge itself is ungated; the generator there keeps its own
// tier/quota rules via callAI(). No new AI route or prompt is introduced.
export const FIRST_ARTIFACT_CTA_HREF = '/plans';

export interface FirstArtifactNudgeInput {
  // The coach's aggregate observation count for the active team.
  observations: number;
  // How many AI artifacts (plans rows) the coach has already generated for the
  // team. Read from existing data — NOT a new tracking field on any table.
  artifactsGenerated: number;
}

// Show the nudge only when the coach has crossed the "enough notes" threshold
// AND has not yet generated a single artifact. Once any artifact exists the
// coach has reached the magic moment, so the card self-dismisses (returns
// false) forever.
export function shouldShowFirstArtifactNudge({
  observations,
  artifactsGenerated,
}: FirstArtifactNudgeInput): boolean {
  if (!Number.isFinite(observations) || observations < FIRST_ARTIFACT_OBS_THRESHOLD) {
    return false;
  }
  // A positive artifact count means the coach already made one. Treat a
  // missing/negative count defensively as "none yet".
  if (Number.isFinite(artifactsGenerated) && artifactsGenerated > 0) {
    return false;
  }
  return true;
}
