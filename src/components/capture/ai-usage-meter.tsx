'use client';

import { cn } from '@/lib/utils';

/** Shape returned by GET /api/ai/usage. `unlimited` is set for paid tiers. */
export interface AIUsageStatus {
  used?: number;
  limit?: number;
  remaining?: number;
  tier?: string;
  unlimited?: boolean;
}

interface AIUsageMeterProps {
  /**
   * Result of the best-effort GET /api/ai/usage read.
   * `undefined` while loading or after a failed/timed-out fetch — the meter
   * renders nothing in that case so it can never gate or block capture.
   */
  usage?: AIUsageStatus;
}

/**
 * Compact "N of 5 AI notes left this month" line shown above the record control
 * on Capture (ticket 0008). Free-tier coaches see the count so the monthly wall
 * stops being a surprise; paid (unlimited) tiers see nothing. Turns amber on the
 * last note (remaining <= 1) to read like a low-battery warning — quiet, factual,
 * no modal. It is purely informational and never disables the record button.
 */
export function AIUsageMeter({ usage }: AIUsageMeterProps) {
  // Best-effort: render nothing while loading or when the read failed, and nothing
  // for paid/unlimited tiers (no numeric remaining to show).
  if (!usage || usage.unlimited || typeof usage.remaining !== 'number' || typeof usage.limit !== 'number') {
    return null;
  }

  const warning = usage.remaining <= 1;

  return (
    <p
      data-testid="ai-usage-meter"
      data-state={warning ? 'warning' : 'neutral'}
      className={cn(
        'text-xs font-medium',
        warning ? 'text-amber-400' : 'text-zinc-500'
      )}
    >
      <span className="tabular-nums">{usage.remaining} of {usage.limit}</span>{' '}
      AI notes left this month
    </p>
  );
}
