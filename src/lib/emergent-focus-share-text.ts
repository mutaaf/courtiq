// ─── Ticket 0071 — emergent-focus share-text template ──────────────────────
//
// Pure template-fill (no AI) the director taps "Copy" on to paste into the
// all-coaches text thread. The line is instructed POSITIVELY per
// LESSONS#0023 — no AGENTS.md banned word is ever in the output for any
// valid skill / team-name fixture (the vitest matrix proves this).
//
// Reads no DB. No I/O. Mirrors the shape of the other share-text helpers
// the project's voice tests rely on.

const MAX_NAMED_TEAMS = 3;

export interface EmergentFocusShareTextInput {
  skill: string;
  teamCount: number;
  teamNames: string[];
}

/**
 * Build the single-line share text. Keeps the line UNDER ~140 chars for
 * comfortable pasting into a group SMS thread, even with a long skill name.
 *
 * Voice: opens with "Nice", closes with "Keep at it." — clipboard
 * vocabulary, not marketing-landing-page hype.
 */
export function buildEmergentFocusShareText(
  input: EmergentFocusShareTextInput
): string {
  const skill = (input.skill || '').trim();
  const teamCount = Math.max(0, Math.floor(input.teamCount || 0));
  const names = (input.teamNames || []).map((n) => String(n).trim()).filter(Boolean);

  const namedTeams = names.slice(0, MAX_NAMED_TEAMS);
  const extra = Math.max(0, names.length - MAX_NAMED_TEAMS);
  const namesPart = extra > 0
    ? `${namedTeams.join(', ')} + ${extra} more`
    : namedTeams.join(', ');

  return `Nice — ${teamCount} of you converged on ${skill} independently this week (${namesPart}). Keep at it.`;
}
