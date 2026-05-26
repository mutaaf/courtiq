/**
 * Ticket 0045 — quiet "Carrying from last week" line on the plan view.
 *
 * Pure presentational. Rendered above the drills section of a freshly-
 * generated practice plan ONLY when `content_structured.rollover_from_last_week`
 * is non-empty. Mirrors the dark-theme + orange-accent surface of the rest of
 * the plans page; informational, no upsell, no nag.
 */
import type { ReactNode } from 'react';
import { Repeat2 } from 'lucide-react';

export interface RolloverFromLastWeekEntry {
  drill_id: string;
  drill_name: string;
  source_plan_id: string;
}

interface PracticePlanRolloverLineProps {
  rollover?: RolloverFromLastWeekEntry[];
}

export function PracticePlanRolloverLine({
  rollover,
}: PracticePlanRolloverLineProps): ReactNode {
  if (!rollover || rollover.length === 0) return null;

  // Join drill names with a comma-separator the eye reads easily ("Corner
  // Shooting, 3-on-3 to Shot"). The line is a quiet single-row hint, not a
  // chip rack — the coach already recognises the drill names from last week.
  const drillNames = rollover.map((r) => r.drill_name).join(', ');

  return (
    <div
      data-testid="practice-plan-rollover-line"
      className="flex items-start gap-2 rounded-lg border border-orange-500/20 bg-orange-500/5 px-3 py-2 text-xs text-zinc-300"
    >
      <Repeat2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-400" aria-hidden="true" />
      <p className="leading-snug">
        <span className="font-medium text-orange-300">Carrying from last week:</span>{' '}
        <span className="text-zinc-200">{drillNames}</span>
      </p>
    </div>
  );
}
