'use client';

import { SeasonOpenerEntry } from '@/components/onboarding/season-opener-entry';

// Ticket 0068 — the /home entry-point for the season-opener card.
//
// Gated on the active team's `created_at` being within the last 7 days.
// Past the first week the card disappears entirely; /home stays clean
// for every coach past their first week (LESSONS#0065 / #0066 / #0162 —
// /home is a DIRTY hotspot; mount with the smallest possible touch).
//
// The card itself just wraps the existing <SeasonOpenerEntry /> sheet —
// its only responsibility is the freshness predicate.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function isSeasonOpenerFresh(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  const created = Date.parse(createdAt);
  if (Number.isNaN(created)) return false;
  return Date.now() - created < SEVEN_DAYS_MS;
}

interface Props {
  teamId: string;
  teamCreatedAt: string | null | undefined;
}

export function SeasonOpenerCard({ teamId, teamCreatedAt }: Props) {
  if (!isSeasonOpenerFresh(teamCreatedAt)) {
    return null;
  }
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-zinc-100">
          Your season opener
        </h3>
        <p className="mt-1 text-xs text-zinc-400">
          One tap. One line. The first thing your parents see this season.
        </p>
      </div>
      <SeasonOpenerEntry teamId={teamId} />
    </div>
  );
}
