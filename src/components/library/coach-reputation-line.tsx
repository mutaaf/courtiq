// ─── Ticket 0073 — coach reputation line ───────────────────────────────────
//
// The small zinc-500 line that renders under each discovery card on the
// 0055 league-discovery surface (the `<LeaguePlansSection />` at the top
// of /plans). When the published coach's reputation is above the
// discovery threshold (cloneCount >= 3 AND distinctProgramCount >= 2),
// the line reads:
//
//   "Cloned by <N> coaches in <M> programs this month."
//
// When reputation is null, the line is ABSENT — silence beats small-
// number bragging (the 0073 contract).
//
// data-testid is scoped per CARD so digits like "12" / "4" never strict-
// mode-collide on the discovery surface (LESSONS#0029 / #0082).
//
// Voice contract (LESSONS#0023): the rendered string instructs positively
// ("cloned by N coaches in M programs"). No banned hype words.

interface CoachReputationLineProps {
  /** Unique per-card key — concatenated with "coach-reputation-line-" to
   *  form the data-testid. */
  cardKey: string;
  reputation: {
    cloneCount: number;
    distinctProgramCount: number;
    distinctCoachCount: number;
  } | null;
}

export function CoachReputationLine({
  cardKey,
  reputation,
}: CoachReputationLineProps) {
  if (!reputation) return null;
  return (
    <p
      data-testid={`coach-reputation-line-${cardKey}`}
      className="text-xs text-zinc-500 mt-1"
    >
      Cloned by {reputation.distinctCoachCount} coaches in{' '}
      {reputation.distinctProgramCount} programs this month.
    </p>
  );
}
