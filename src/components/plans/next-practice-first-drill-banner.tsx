// Ticket 0069 — small banner above drill #1 of a practice plan that
// carries the `content_structured.first_drill_why` line written by the
// /api/ai/plan route when the plan generation consumed a recent
// post-loss decompression. Renders nothing when the field is absent —
// the plan view stays BYTE-IDENTICAL for every plan that never carried
// a decompression (silence beats invention).
//
// Voice (AGENTS.md): no banned words. The single literal phrase in the
// banner copy ("Why this is first today —") is positive instruction.

interface Props {
  firstDrillWhy?: string | null;
}

export function NextPracticeFirstDrillBanner({ firstDrillWhy }: Props) {
  if (!firstDrillWhy || typeof firstDrillWhy !== 'string' || !firstDrillWhy.trim()) {
    return null;
  }
  return (
    <div
      className="rounded-lg border border-orange-500/30 bg-orange-500/5 px-3 py-2 text-xs italic text-orange-200"
      data-testid="first-drill-why-banner"
    >
      Why this is first today — {firstDrillWhy.trim()}
    </div>
  );
}
