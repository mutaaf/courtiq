'use client';

/**
 * Ticket 0061 — PlayerTrajectoryCard.
 *
 * The "Week 1 vs now" per-player card on the trajectory page. Reads
 * /api/players/[playerId]/trajectory via TanStack useQuery (LESSONS#0036
 * — a 'use client' useQuery is browser-side, interceptable by both
 * Playwright `page.route()` and a vitest fetch mock).
 *
 * Renders:
 *   - When observationCount < 4 → a quiet "first observations are still
 *     being written" line (silence beats half-evidence per the AC).
 *   - Otherwise → two columns ("Where she started" / "Where she is now"),
 *     a row of up to 3 turning-point dots, and a Save card link to the
 *     OG route.
 *
 * Voice contract: the user-facing strings contain NO AGENTS.md banned word
 * (LESSONS#0023). The route ALSO scans the AI output at render time, so
 * the rendered sentences are guaranteed clean even if the AI returned a
 * banned token.
 */
import { useQuery } from '@tanstack/react-query';
import { CircleDot } from 'lucide-react';

interface TrajectoryAnchor {
  headline: string;
  sentence: string;
  observation_id: string;
  observed_at: string;
}
interface TrajectoryTurningPoint {
  observation_id: string;
  observed_at: string;
  oneWordLabel: string;
}
interface TrajectoryPayload {
  started: TrajectoryAnchor | null;
  now: TrajectoryAnchor | null;
  turningPoints: TrajectoryTurningPoint[];
  observationCount: number;
}

export function PlayerTrajectoryCard({
  playerId,
  playerFirstName,
}: {
  playerId: string;
  playerFirstName: string;
}) {
  const { data, isLoading } = useQuery<TrajectoryPayload>({
    queryKey: ['player-trajectory', playerId],
    queryFn: async () => {
      const res = await fetch(`/api/players/${playerId}/trajectory`);
      if (!res.ok) throw new Error(`trajectory ${res.status}`);
      return (await res.json()) as TrajectoryPayload;
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading || !data) {
    return (
      <div
        data-testid="player-trajectory-card"
        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-300"
      >
        <p className="text-sm text-zinc-500">Pulling together {playerFirstName}&apos;s trajectory…</p>
      </div>
    );
  }

  const weeks = Math.max(1, Math.ceil(data.observationCount / 1));

  // Below the floor — silence beats half-evidence.
  if (!data.started || !data.now || data.observationCount < 4) {
    return (
      <div
        data-testid="player-trajectory-card"
        className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-300"
      >
        <h2 className="text-lg font-semibold text-zinc-100">{playerFirstName} — {weeks} weeks</h2>
        <p className="mt-2 text-sm text-zinc-400">
          {playerFirstName}&apos;s first observations are still being written —
          come back after a few more practices.
        </p>
      </div>
    );
  }

  const turningPoints = data.turningPoints.slice(0, 3);

  return (
    <div
      data-testid="player-trajectory-card"
      className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-zinc-300"
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-100">
          {playerFirstName} — {data.observationCount} weeks
        </h2>
        <span className="text-xs text-zinc-500">{data.observationCount} observations</span>
      </header>

      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <section data-testid="player-trajectory-started">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Where {playerFirstName} started
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-200">{data.started.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">{data.started.sentence}</p>
        </section>
        <section data-testid="player-trajectory-now">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-orange-400">
            Where {playerFirstName} is now
          </p>
          <p className="mt-2 text-sm font-medium text-zinc-100">{data.now.headline}</p>
          <p className="mt-1 text-sm leading-relaxed text-zinc-100">{data.now.sentence}</p>
        </section>
      </div>

      {turningPoints.length > 0 && (
        <div className="mt-6 border-t border-zinc-900 pt-4" data-testid="player-trajectory-turning-points">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            Turning points
          </p>
          <ul className="mt-3 flex flex-wrap gap-3">
            {turningPoints.map((tp) => (
              <li
                key={tp.observation_id}
                className="flex items-center gap-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-3 py-1 text-xs text-orange-300"
              >
                <CircleDot className="h-3 w-3" />
                {tp.oneWordLabel}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <a
          data-testid="player-trajectory-save-card"
          href={`/api/og/player-trajectory/${playerId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-sm font-medium text-orange-300 hover:bg-orange-500/20"
        >
          Save growth card for parent pickup
        </a>
      </div>
    </div>
  );
}
