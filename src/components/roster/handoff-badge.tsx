'use client';

/**
 * Ticket 0059 — the RECEIVING coach's per-row "1 handoff note" badge on /roster.
 *
 * For each player row the component fires a one-shot query to
 * `/api/player-handoffs/for-player?playerId=…`. When a handoff is found the
 * badge renders beside the player's name; tapping it opens a small sheet
 * with the source coach's first name + season label + card body, plus
 * "Save to my coach notes" and "Close" buttons.
 *
 * "Save" POSTs `/api/player-handoffs/[handoffId]/claim` which both stamps
 * the handoff row AND writes the body into the receiving coach's existing
 * `player_notes` table (no new column on `players` — COPPA).
 *
 * No public surface. No parent-side. Receiver-side is universal across
 * tiers (the source coach is gated; gating the receiver would orphan the
 * handoffs in the program).
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { UserCheck, Check } from 'lucide-react';

interface HandoffResponse {
  handoff: {
    handoffId: string;
    sourceCoachFirstName: string;
    seasonLabel: string;
    cardBody: string;
  } | null;
}

interface HandoffBadgeProps {
  playerId: string;
}

type ClaimPhase = 'idle' | 'saving' | 'saved' | 'already' | 'error';

export function HandoffBadge({ playerId }: HandoffBadgeProps) {
  const [handoff, setHandoff] = useState<HandoffResponse['handoff']>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<ClaimPhase>('idle');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/player-handoffs/for-player?playerId=${encodeURIComponent(playerId)}`,
        );
        if (cancelled) return;
        if (!res.ok) {
          setLoaded(true);
          return;
        }
        const body = (await res.json()) as HandoffResponse;
        setHandoff(body.handoff);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  async function onClaim() {
    if (!handoff) return;
    setPhase('saving');
    try {
      const res = await fetch(`/api/player-handoffs/${handoff.handoffId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId }),
      });
      if (res.status === 409) {
        setPhase('already');
        return;
      }
      if (!res.ok) {
        setPhase('error');
        return;
      }
      setPhase('saved');
    } catch {
      setPhase('error');
    }
  }

  if (!loaded || !handoff) {
    return null;
  }

  return (
    <span className="inline-flex items-center" data-testid={`handoff-badge-${playerId}`}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/15 px-2 py-0.5 text-xs font-medium text-orange-300 hover:bg-orange-500/25"
        data-testid={`handoff-badge-button-${playerId}`}
      >
        <UserCheck className="h-3 w-3" />
        1 handoff note
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center"
          data-testid={`handoff-sheet-${playerId}`}
        >
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-xl">
            <div className="mb-2 flex items-baseline justify-between">
              <h3 className="text-base font-semibold text-zinc-100">
                From Coach {handoff.sourceCoachFirstName}
              </h3>
              <span className="text-xs text-zinc-500">{handoff.seasonLabel}</span>
            </div>
            <p
              className="mb-4 whitespace-pre-line text-sm leading-relaxed text-zinc-200"
              data-testid={`handoff-body-${playerId}`}
            >
              {handoff.cardBody}
            </p>

            {phase === 'saved' && (
              <p
                className="mb-3 flex items-center gap-1.5 text-sm text-emerald-400"
                data-testid={`handoff-saved-${playerId}`}
              >
                <Check className="h-4 w-4" />
                Saved to your coach notes.
              </p>
            )}
            {phase === 'already' && (
              <p className="mb-3 text-sm text-zinc-400">Already saved.</p>
            )}
            {phase === 'error' && (
              <p className="mb-3 text-sm text-orange-300">
                Could not save right now. Try again.
              </p>
            )}

            <div className="flex gap-2">
              <Button
                onClick={onClaim}
                disabled={phase === 'saving' || phase === 'saved'}
                className="flex-1 bg-orange-500 text-zinc-950 hover:bg-orange-600"
                data-testid={`handoff-save-${playerId}`}
              >
                Save to my coach notes
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                className="flex-1 text-zinc-300"
                data-testid={`handoff-close-${playerId}`}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </span>
  );
}
