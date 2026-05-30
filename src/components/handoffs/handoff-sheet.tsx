'use client';

/**
 * Ticket 0059 — the source coach's end-of-season handoff sheet.
 *
 * Mounted on /home next to the season-recap surface. The coach taps the
 * primary button → the sheet POSTs `/api/player-handoffs/generate-preview`
 * once on open, renders a checkbox per eligible player with the AI-generated
 * preview body, and lets the coach uncheck any player she wants to think
 * about more. The "Send to program" CTA POSTs `/api/player-handoffs/commit`
 * with only the checked playerIds + their previews and collapses the sheet
 * to a quiet "Handoff queued for N players" confirmation toast.
 *
 * Voice contract (AGENTS.md §non-negotiable #7, LESSONS#0023): every string
 * here is written positively — never enumerates banned tokens; no "amazing
 * journey," no "elevate," no decorative emojis on headings.
 *
 * No direct send to the receiving coach. No public surface. The handoffs
 * live in the program's roster intake and materialize when a coach in the
 * same `org_id` claims a matching player on their /roster.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserCheck, X, Loader2, Check } from 'lucide-react';

interface PreviewRow {
  playerId: string;
  playerFirstName: string;
  cardBody: string;
}

interface DroppedRow {
  playerId: string;
  reason: 'insufficient_observations';
}

interface PreviewResponse {
  previews: PreviewRow[];
  dropped: DroppedRow[];
}

interface HandoffSheetProps {
  teamId: string;
  /** All eligible player ids for the team (the caller passes the full roster). */
  playerIds: string[];
  /** Optional className override so this can drop into the season-recap card. */
  className?: string;
}

type Phase = 'idle' | 'loading' | 'preview' | 'committing' | 'done' | 'error';

export function HandoffSheet({ teamId, playerIds, className }: HandoffSheetProps) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [previews, setPreviews] = useState<PreviewRow[]>([]);
  const [dropped, setDropped] = useState<DroppedRow[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [committedCount, setCommittedCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // One POST on open — never a re-render-firing effect. The dependency list
    // omits `phase` on purpose: putting `phase` in deps would cause the
    // cleanup to cancel the very fetch this effect just launched (the
    // setPhase('loading') call inside the effect re-runs the effect, and the
    // previous effect's cleanup cancels the in-flight request). We guard
    // re-entry with the `phase` SNAPSHOT at run time instead.
    if (!open) return;
    if (phase !== 'idle') return;
    let cancelled = false;
    setPhase('loading');
    setError(null);
    (async () => {
      try {
        const res = await fetch('/api/player-handoffs/generate-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ teamId, playerIds }),
        });
        if (cancelled) return;
        if (res.status === 402) {
          setError(
            'Handing off your players is a Coach plan feature. Open Settings to upgrade.',
          );
          setPhase('error');
          return;
        }
        if (!res.ok) {
          setError('Could not generate the previews. Try again in a moment.');
          setPhase('error');
          return;
        }
        const body = (await res.json()) as PreviewResponse;
        setPreviews(body.previews || []);
        setDropped(body.dropped || []);
        const initial: Record<string, boolean> = {};
        for (const p of body.previews || []) initial[p.playerId] = true;
        setChecked(initial);
        setPhase('preview');
      } catch {
        if (!cancelled) {
          setError('Could not generate the previews. Try again in a moment.');
          setPhase('error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, teamId, playerIds]);

  async function onCommit() {
    const checkedIds = previews
      .map((p) => p.playerId)
      .filter((id) => checked[id]);
    if (checkedIds.length === 0) return;
    setPhase('committing');
    try {
      const res = await fetch('/api/player-handoffs/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          playerIds: checkedIds,
          previews: previews
            .filter((p) => checked[p.playerId])
            .map((p) => ({ playerId: p.playerId, cardBody: p.cardBody })),
        }),
      });
      if (!res.ok) {
        setError('Could not send the handoff notes. Try again in a moment.');
        setPhase('error');
        return;
      }
      const body = (await res.json()) as { committed: Array<{ playerId: string }> };
      setCommittedCount(body.committed?.length ?? checkedIds.length);
      setPhase('done');
    } catch {
      setError('Could not send the handoff notes. Try again in a moment.');
      setPhase('error');
    }
  }

  function reset() {
    setOpen(false);
    setPhase('idle');
    setPreviews([]);
    setDropped([]);
    setChecked({});
    setCommittedCount(0);
    setError(null);
  }

  return (
    <div className={className} data-testid="handoff-sheet-root">
      {!open && (
        <Button
          variant="outline"
          className="w-full justify-start gap-2 border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
          onClick={() => setOpen(true)}
          data-testid="handoff-sheet-open"
        >
          <UserCheck className="h-4 w-4 text-orange-400" />
          Hand off your players to next season&apos;s coach
        </Button>
      )}

      {open && (
        <div
          className="rounded-2xl border border-zinc-800 bg-zinc-900/80 p-4 shadow-xl"
          data-testid="handoff-sheet"
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-semibold text-zinc-100">
              Hand off your players to next season
            </h3>
            <button
              type="button"
              aria-label="Close handoff sheet"
              onClick={reset}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              data-testid="handoff-sheet-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {phase === 'loading' && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
              Pulling together what you wrote about each kid this season…
            </div>
          )}

          {phase === 'error' && error && (
            <p className="text-sm text-orange-300">{error}</p>
          )}

          {phase === 'preview' && previews.length === 0 && (
            <p className="text-sm text-zinc-400">
              You don&apos;t have enough notes on any player yet to write a handoff. Capture a few
              more observations and try again.
            </p>
          )}

          {phase === 'preview' && previews.length > 0 && (
            <div className="space-y-3">
              <ul className="space-y-3" data-testid="handoff-preview-list">
                {previews.map((p) => (
                  <li
                    key={p.playerId}
                    className="rounded-xl border border-zinc-800 bg-zinc-950 p-3"
                    data-testid={`handoff-preview-row-${p.playerId}`}
                  >
                    <label className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-orange-500"
                        checked={!!checked[p.playerId]}
                        onChange={(e) =>
                          setChecked((prev) => ({ ...prev, [p.playerId]: e.target.checked }))
                        }
                        data-testid={`handoff-preview-check-${p.playerId}`}
                      />
                      <span className="flex-1">
                        <span className="block text-sm font-semibold text-zinc-100">
                          {p.playerFirstName}
                        </span>
                        <span className="mt-1 block text-sm text-zinc-300">{p.cardBody}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              {dropped.length > 0 && (
                <p className="text-xs text-zinc-500" data-testid="handoff-dropped-line">
                  {dropped.length} player{dropped.length === 1 ? '' : 's'} skipped — not enough
                  observations yet.
                </p>
              )}

              <Button
                className="w-full bg-orange-500 text-zinc-950 hover:bg-orange-600"
                onClick={onCommit}
                data-testid="handoff-commit"
              >
                Send to program
              </Button>
            </div>
          )}

          {phase === 'committing' && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
              Queuing the handoff notes…
            </div>
          )}

          {phase === 'done' && (
            <div
              className="flex items-center gap-2 text-sm text-emerald-400"
              data-testid="handoff-done-toast"
            >
              <Check className="h-4 w-4" />
              Handoff queued for {committedCount} player{committedCount === 1 ? '' : 's'}. The
              next coach will see it when they pick up the roster.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
