'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CalendarCheck, ArrowRight, Loader2 } from 'lucide-react';
import type { SeasonPhase } from '@/lib/season-wrap-utils';

// ─── Ticket 0036 — the coach-private "that's a wrap" home card ────────────────────
//
// Appears at the top of the home feed ONLY when the active team's season is
// complete. It shows the factual totals (weeks coached, practices, players
// observed) and ONE growth highlight — all derived from data we already collect —
// and a single button: "Start next season with this team", which POSTs to the
// rollover route (carries the returning roster forward with prior_player_id, 0034).
//
// SeasonWrapCard is PURE presentational: data == null/undefined or phase !==
// 'complete' → renders nothing. It NEVER blocks the home screen and shows no
// "you've been inactive" guilt copy (banned tone). Available to EVERY coach (no
// tier gate, no AI) — a free coach should be re-activated too.
//
// SeasonWrapSection is the thin container the home page mounts: it does the
// fire-and-forget useQuery GET and the rollover POST (we never call Supabase from
// the client — AGENTS.md rule 3; the rollover route is the service-role writer).

export interface SeasonWrapData {
  phase: SeasonPhase;
  season: string | null;
  weeksCoached: number;
  practiceCount: number;
  playersObserved: number;
  highlight: string | null;
}

function StatBlock({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-lg font-bold text-zinc-100 leading-none">{value}</span>
      <span className="mt-1 text-[11px] text-zinc-400">{label}</span>
    </div>
  );
}

export function SeasonWrapCard({
  data,
  teamId: _teamId,
  onStartNextSeason,
  isStarting = false,
}: {
  data: SeasonWrapData | null | undefined;
  teamId: string;
  onStartNextSeason?: () => void;
  isStarting?: boolean;
}) {
  // Best-effort: loading (undefined) and failed (null) both render nothing.
  if (!data) return null;
  // The card only exists at the one moment that matters — a completed season.
  if (data.phase !== 'complete') return null;

  const seasonLabel = data.season ? `${data.season} — done.` : 'Season — done.';

  return (
    <div
      data-testid="season-wrap-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <CalendarCheck className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            That&apos;s a wrap
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">{seasonLabel}</p>

          {/* Factual totals — earned, specific, screenshot-able. */}
          <div className="mt-3 flex gap-6">
            <StatBlock value={data.weeksCoached} label="weeks coached" />
            <StatBlock value={data.practiceCount} label="practices" />
            <StatBlock value={data.playersObserved} label="players" />
          </div>

          {data.highlight && (
            <p className="mt-3 text-xs text-zinc-400 leading-snug">{data.highlight}</p>
          )}

          <button
            type="button"
            onClick={onStartNextSeason}
            disabled={isStarting}
            className="mt-4 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97] disabled:opacity-60"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Starting next season…
              </>
            ) : (
              <>
                Start next season with this team
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SeasonWrapSection({ teamId }: { teamId: string }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);

  // Fire-and-forget GET — never blocks or thrashes the home screen.
  const { data } = useQuery({
    queryKey: ['season-wrap', teamId],
    enabled: !!teamId,
    staleTime: 30 * 60 * 1000, // a season's end doesn't change minute to minute
    retry: false,
    queryFn: async (): Promise<SeasonWrapData | null> => {
      const res = await fetch(`/api/season/wrap?teamId=${teamId}`);
      if (!res.ok) return null;
      return (await res.json()) as SeasonWrapData;
    },
  });

  async function startNextSeason() {
    if (isStarting) return;
    // Default the next-season label off the finished one's year; the coach can
    // rename it on the roster afterward. Kept simple: one tap, no modal blocking.
    const finished = data?.season ?? '';
    const yearMatch = finished.match(/\d{4}/);
    const nextYear = yearMatch ? Number(yearMatch[0]) + 1 : new Date().getFullYear();
    const newSeasonLabel = `Season ${nextYear}`;

    setIsStarting(true);
    try {
      const res = await fetch('/api/season/rollover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, newSeasonLabel }),
      });
      if (res.ok) {
        // Send the coach to the roster so they see the carried players ready.
        router.push('/roster');
      }
    } catch {
      // Best-effort: never throw on the home screen.
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <SeasonWrapCard
      data={data}
      teamId={teamId}
      onStartNextSeason={startNextSeason}
      isStarting={isStarting}
    />
  );
}
