'use client';

import { useState } from 'react';
import { composeSeedLine, type ReactionSeed } from '@/lib/reaction-seed-utils';

interface ReactionSeedLineProps {
  /**
   * The most-recent qualifying parent_reactions seed for the focused player,
   * derived server-side from a 14-day lookback (see
   * `src/lib/reaction-seed-utils.ts` for the rules). `undefined`/`null` while
   * loading, when no qualifying reaction exists, or after a failed/timed-out
   * fetch — the line renders nothing in those cases so it can never gate or
   * block capture (mirrors the 0014 / 0025 best-effort capture lines).
   */
  seed?: ReactionSeed | null;
}

/**
 * Ticket 0082 — the parent-reaction → capture seed line. One quiet zinc-500
 * line shown ABOVE the existing 0025 per-player memory line on the Capture
 * player card:
 *
 *   "Sarah said their shooting carried last week — what did you see today?"
 *
 * Tap (or click) the line to expand the parent's full note inline as a small
 * zinc-300 paragraph below it. The seed is REMOVED from the surface the
 * moment the coach writes the next observation for the player (the consumer
 * sets the `seed` prop to null on the next render — see the e2e spec).
 *
 * Voice contract per LESSONS#0023 / #0036 / #0078: the pronoun is ALWAYS
 * "their" — the player table has no gender field, so inventing one is a
 * bigger voice failure than the voice-neutral form. The "A parent" fallback
 * is provided by the helper before this component sees it.
 *
 * COPPA contract: the component only reads `parent_first_name`, `note`, and
 * `created_at` from the seed (the allow-list the route enforces on the read).
 * It never renders a surname (the parent_first_name is just whatever the
 * helper handed in), a parent email, a kid DOB, or a jersey number.
 */
export function ReactionSeedLine({ seed }: ReactionSeedLineProps) {
  const [expanded, setExpanded] = useState(false);

  if (!seed) return null;

  const line = composeSeedLine(seed);

  return (
    <div className="w-full max-w-xs">
      <button
        type="button"
        data-testid="reaction-seed-line"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-2 text-left text-xs leading-snug text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        {/* A tiny orange dot left-anchored — the visual hook the coach learns
            to associate with "the parent left a note about this kid." */}
        <span
          aria-hidden="true"
          className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
        />
        <span className="flex-1">{line}</span>
      </button>
      {expanded && (
        <p
          data-testid="reaction-seed-expand"
          className="mt-1.5 pl-3.5 text-xs leading-snug text-zinc-300"
        >
          {seed.note}
        </p>
      )}
    </div>
  );
}
