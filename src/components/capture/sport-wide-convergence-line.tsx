'use client';

import { useState } from 'react';
import type { SportWideConvergenceResponse } from '@/app/api/sport-wide-convergence/route';

// Quiet sport-wide convergence line surfaced on Capture (ticket 0091),
// rendered IMMEDIATELY UNDER the existing 0075 cross-program focus line
// when 25+ DISTINCT programs across the sport have shipped the same
// skill in the last 7 days. The line names the TOP-2 most-shipping
// programs by their program name and director first name; tapping the
// count phrase opens a small overlay with the named programs + the age
// groups they serve.
//
// Three variants:
//
//   FULL (2 named programs):
//     "Hawks Basketball (Director Riya) and Riverside U10 (Director Ben)
//      have published 6 closeout plans this week — 25 programs across
//      basketball are working closeouts right now."
//
//   SINGULAR (1 named program):
//     "Hawks Basketball (Director Riya) has published 6 closeout plans
//      this week — 25 programs across basketball are working closeouts
//      right now."
//
//   AMBIENT (0 named programs — every qualifying program is opted-out):
//     "25 programs across basketball are working closeouts this week."
//
// Silence beats nag: when `eligible: false` (below the 25-program bar,
// or no plans in-window, or the read failed), the component renders
// NOTHING so the 0075 line above is byte-identical.
//
// Tier posture: this is a FREE affordance (LESSONS — the supply-loop
// compound depends on every coach seeing it; gating it would invert
// the moat thesis). There is no <UpgradeGate /> wrapper.
//
// Voice contract (LESSONS#0023): every copy variant is positively
// phrased; no banned words (journey / amazing / exciting / elevate /
// empower / synergy / unlock); no defensive hype (everyone is doing it
// / trending / viral / hot right now / popular this week). The line
// voice is CLIPBOARD — counted facts and named programs, no
// superlatives.
//
// Privacy floor: the ambient variant is the floor for opted-out
// programs. The line ALWAYS has the ambient variant available so the
// count signal can fire without naming. Opted-out programs are STILL
// counted in distinctProgramCount (the quantity is honest), but they
// are never named in the rendered line.
//
// LESSONS#0029 / #0082 — data-testid scoping for e2e.
// LESSONS#0065 / #0066 / #0162 — smallest possible touch on Capture.

interface SportWideConvergenceLineProps {
  /** Result of the best-effort GET /api/sport-wide-convergence read
   *  (ticket 0091). `undefined`/`null` while loading, when no
   *  convergence exists, or after a failed/timed-out fetch — the line
   *  renders nothing in those cases so it can never gate Capture. */
  data?: SportWideConvergenceResponse | null;
  /** Display name for the caller's sport — "basketball", "soccer",
   *  "flag football". The component does not own the sport-lookup; the
   *  Capture parent resolves it from the active team and passes it
   *  down (mirrors the 0075 pattern). */
  sportName: string;
  /** Display name for the skill — "closeouts", "passing", "defense".
   *  The Capture parent resolves it from the picked skill and passes
   *  it down. */
  skillName: string;
}

export function SportWideConvergenceLine({
  data,
  sportName,
  skillName,
}: SportWideConvergenceLineProps) {
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Silence beats nag.
  if (!data || !data.eligible) return null;

  const trimmedSport = sportName.trim() || 'your sport';
  const trimmedSkill = skillName.trim() || 'this skill';
  const named = data.namedPrograms;
  const programCount = data.distinctProgramCount;
  const totalPlans = data.totalPlanCount;

  return (
    <div
      data-testid="sport-wide-convergence-line"
      className="flex w-full max-w-sm flex-col items-center gap-2 text-center"
    >
      <p className="text-xs leading-snug text-zinc-400">
        {named.length === 2 ? (
          <>
            <span className="text-zinc-300">{named[0].programName}</span>{' '}
            <span className="text-zinc-500">(Director</span>{' '}
            <span className="text-zinc-300">{named[0].directorFirstName}</span>
            <span className="text-zinc-500">) and</span>{' '}
            <span className="text-zinc-300">{named[1].programName}</span>{' '}
            <span className="text-zinc-500">(Director</span>{' '}
            <span className="text-zinc-300">{named[1].directorFirstName}</span>
            <span className="text-zinc-500">) have published</span>{' '}
            <span className="text-zinc-300">{totalPlans} {trimmedSkill} plans</span>{' '}
            <span className="text-zinc-500">this week —</span>{' '}
            <CountTrigger
              count={programCount}
              sportName={trimmedSport}
              onOpen={() => setOverlayOpen(true)}
            />{' '}
            <span className="text-zinc-500">are working {trimmedSkill} right now.</span>
          </>
        ) : named.length === 1 ? (
          <>
            <span className="text-zinc-300">{named[0].programName}</span>{' '}
            <span className="text-zinc-500">(Director</span>{' '}
            <span className="text-zinc-300">{named[0].directorFirstName}</span>
            <span className="text-zinc-500">) has published</span>{' '}
            <span className="text-zinc-300">{totalPlans} {trimmedSkill} plans</span>{' '}
            <span className="text-zinc-500">this week —</span>{' '}
            <CountTrigger
              count={programCount}
              sportName={trimmedSport}
              onOpen={() => setOverlayOpen(true)}
            />{' '}
            <span className="text-zinc-500">are working {trimmedSkill} right now.</span>
          </>
        ) : (
          <>
            <CountTrigger
              count={programCount}
              sportName={trimmedSport}
              onOpen={() => setOverlayOpen(true)}
            />{' '}
            <span className="text-zinc-500">are working {trimmedSkill} this week.</span>
          </>
        )}
      </p>

      {overlayOpen ? (
        <div
          data-testid="sport-wide-convergence-overlay"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-950/95 p-3 text-left"
        >
          <p className="mb-2 text-xs text-zinc-500">
            Programs named on this week&rsquo;s {trimmedSport} pulse for {trimmedSkill}:
          </p>
          <ul className="flex flex-col gap-1">
            {named.map((p) => (
              <li key={p.orgId} className="text-xs text-zinc-300">
                <span className="font-medium">{p.programName}</span>
                {p.directorFirstName ? (
                  <span className="text-zinc-500"> (Director {p.directorFirstName})</span>
                ) : null}
                <span className="text-zinc-500"> — {p.planCount} plans</span>
                {p.ageGroupsServed.length > 0 ? (
                  <span className="text-zinc-500">
                    {' '}· {p.ageGroupsServed.join(' / ')}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setOverlayOpen(false)}
            className="mt-3 min-h-[44px] w-full rounded-full border border-zinc-700 bg-zinc-900 px-4 py-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800 active:scale-[0.98] touch-manipulation"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** The one tappable phrase ("25 programs across basketball") that opens
 *  the overlay. Keeps the rendered string a single phrase visually
 *  (the count + the preposition + the sport) so the line reads as a
 *  single sentence with one interactive anchor. */
function CountTrigger({
  count,
  sportName,
  onOpen,
}: {
  count: number;
  sportName: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      data-testid="sport-wide-convergence-count-trigger"
      onClick={onOpen}
      className="inline-flex items-baseline gap-1 rounded text-orange-400 underline-offset-2 hover:underline focus:underline active:scale-[0.99] touch-manipulation"
    >
      <span>{count} programs across {sportName}</span>
    </button>
  );
}
