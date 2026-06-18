/**
 * Ticket 0088 — pure helper detecting the FIRST cross-coach signal of a
 * coach's life on SportsIQ.
 *
 * The product surfaces eight cross-coach signal events (clones, sticks,
 * thanks, parent forwards on-team and cross-team, parent reactions
 * across team boundaries). The product currently shows each of those
 * events on its OWN home card, one per event — so the moment a coach
 * crosses from "user of SportsIQ" to "person other coaches learn
 * from" sits in the middle of the regular feed and slides past in
 * the noise.
 *
 * This helper names that one moment. Given the raw signal arrays for
 * one coach plus the set of signal-kinds that have already been
 * celebrated (dismissed by the coach in a prior session), it returns
 * the SINGLE EARLIEST remaining signal — or null when none remain.
 *
 * Pure, reads no DB, never mutates its inputs (LESSONS#0070). The
 * route reads the six signal tables (in practice five — see the
 * Implementation log of 0088: parent_forward_cross_team is a flag on
 * the existing parent_forward_signals table, not a separate table)
 * and hands the flattened rows to this helper.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively and
 * never embeds an AGENTS.md banned word verbatim — the test scans the
 * helper's OUTPUT, not its source.
 */

export type FirstCrossCoachSignalKind =
  | 'clone'
  | 'thank'
  | 'parent_forward'
  | 'parent_forward_cross_team'
  | 'reaction_cross_team';

export interface FirstCrossCoachSignal {
  kind: FirstCrossCoachSignalKind;
  firedAt: string;
  senderFirstName?: string;
  senderProgramName?: string;
  artifactLabel: string;
}

export interface FirstCrossCoachSignalInputs {
  drillClones: Array<{
    id: string;
    cloned_at: string;
    cloner_coach_first_name?: string;
    cloner_program_name?: string;
    drill_label: string;
  }>;
  cloneStickSignals: Array<{
    id: string;
    signaled_at: string;
    cloner_coach_first_name?: string;
    cloner_program_name?: string;
    drill_label: string;
  }>;
  thankMessages: Array<{
    id: string;
    sent_at: string;
    sender_first_name?: string;
    sender_program_name?: string;
    artifact_label: string;
  }>;
  parentForwards: Array<{
    id: string;
    forwarded_at: string;
    artifact_label: string;
  }>;
  parentForwardsCrossTeam: Array<{
    id: string;
    forwarded_at: string;
    recipient_program_name?: string;
    artifact_label: string;
  }>;
  reactionsCrossTeam: Array<{
    id: string;
    reacted_at: string;
    reactor_program_name?: string;
    artifact_label: string;
  }>;
}

interface Candidate {
  kind: FirstCrossCoachSignalKind;
  firedAt: string;
  senderFirstName?: string;
  senderProgramName?: string;
  artifactLabel: string;
}

/**
 * Flatten the six signal arrays into one chronological list, drop any
 * kind the caller has already celebrated, and return the earliest
 * remaining candidate.
 *
 * Returns null when no signal has fired yet OR every signal kind has
 * already been celebrated (the card has been seen and dismissed for
 * every shape).
 */
export function detectFirstCrossCoachSignal(args: {
  coachId: string;
  signals: FirstCrossCoachSignalInputs;
  alreadyCelebrated: Set<FirstCrossCoachSignalKind>;
}): FirstCrossCoachSignal | null {
  const { signals, alreadyCelebrated } = args;

  const candidates: Candidate[] = [];

  for (const row of signals.drillClones) {
    candidates.push({
      kind: 'clone',
      firedAt: row.cloned_at,
      senderFirstName: row.cloner_coach_first_name,
      senderProgramName: row.cloner_program_name,
      artifactLabel: row.drill_label,
    });
  }
  for (const row of signals.cloneStickSignals) {
    // Stick signals are still "your work was picked up" — the
    // helper rolls them under the same 'clone' kind for the
    // activation moment. A coach should never see TWO first-of-its-
    // kind clone cards.
    candidates.push({
      kind: 'clone',
      firedAt: row.signaled_at,
      senderFirstName: row.cloner_coach_first_name,
      senderProgramName: row.cloner_program_name,
      artifactLabel: row.drill_label,
    });
  }
  for (const row of signals.thankMessages) {
    candidates.push({
      kind: 'thank',
      firedAt: row.sent_at,
      senderFirstName: row.sender_first_name,
      senderProgramName: row.sender_program_name,
      artifactLabel: row.artifact_label,
    });
  }
  for (const row of signals.parentForwards) {
    candidates.push({
      kind: 'parent_forward',
      firedAt: row.forwarded_at,
      artifactLabel: row.artifact_label,
    });
  }
  for (const row of signals.parentForwardsCrossTeam) {
    candidates.push({
      kind: 'parent_forward_cross_team',
      firedAt: row.forwarded_at,
      senderProgramName: row.recipient_program_name,
      artifactLabel: row.artifact_label,
    });
  }
  for (const row of signals.reactionsCrossTeam) {
    candidates.push({
      kind: 'reaction_cross_team',
      firedAt: row.reacted_at,
      senderProgramName: row.reactor_program_name,
      artifactLabel: row.artifact_label,
    });
  }

  if (candidates.length === 0) return null;

  // Drop celebrated kinds (the dedup set the route built from
  // coach_first_signal_celebrations rows).
  const remaining = candidates.filter((c) => !alreadyCelebrated.has(c.kind));
  if (remaining.length === 0) return null;

  // Sort a COPY (LESSONS#0070 — never mutate input arrays). Use a
  // stable comparator keyed on firedAt; ties break on kind (stable
  // alphabetical) so identical timestamps render deterministically.
  const sorted = [...remaining].sort((a, b) => {
    if (a.firedAt === b.firedAt) return a.kind.localeCompare(b.kind);
    return a.firedAt < b.firedAt ? -1 : 1;
  });

  const earliest = sorted[0];
  return {
    kind: earliest.kind,
    firedAt: earliest.firedAt,
    ...(earliest.senderFirstName ? { senderFirstName: earliest.senderFirstName } : {}),
    ...(earliest.senderProgramName ? { senderProgramName: earliest.senderProgramName } : {}),
    artifactLabel: earliest.artifactLabel,
  };
}
