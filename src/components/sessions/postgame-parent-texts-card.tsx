'use client';

import { useState } from 'react';
import { MessageSquare, Loader2, AlertCircle, Copy, Check } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import type { PostgameParentTexts } from '@/lib/ai/schemas';

// ─── Ticket 0048 — coach-private post-game parent texts card ─────────────────
//
// Saturday afternoon, the just-finished game, the coach's kid in the back seat
// eating goldfish. The coach taps "Generate parent texts" on the session page;
// six seconds later they have one row per kid — name + a single short, specific
// text to paste into that parent's Messages thread. No public surface, no
// share link, no parent view by design (the artifact's value is delivered
// THROUGH the coach's own Messages app, never on a SportsIQ URL).
//
// Tier gate: paired with the server-side `canAccess(tier, 'report_cards')`
// check in /api/ai/postgame-parent-texts (AGENTS.md rule 5; LESSONS#0023 —
// the `feature` prop value MUST equal the tier-key string verbatim).
//
// This card is INTENTIONALLY one-tap, not auto-loading. The AI call only
// fires when the coach taps the button after the buzzer.

export function PostgameParentTextsCard({
  sessionId,
  teamId,
}: {
  sessionId: string;
  teamId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<PostgameParentTexts | null>(null);
  const [coldGame, setColdGame] = useState(false);
  const [copiedRow, setCopiedRow] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    setColdGame(false);
    try {
      const res = await fetch('/api/ai/postgame-parent-texts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Could not generate the post-game texts.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      // Below-threshold short-circuit (mirror 0046's quiet-game pattern).
      if (!json?.content_structured) {
        setColdGame(true);
        setSheet(null);
      } else {
        setSheet(json.content_structured as PostgameParentTexts);
      }
    } catch (_e) {
      setError('Could not generate the post-game texts.');
    } finally {
      setLoading(false);
    }
  }

  async function copyRow(playerId: string, text: string) {
    try {
      // Defensive guard for older browsers; the real path is the modern
      // navigator.clipboard.writeText.
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopiedRow(playerId);
        setTimeout(() => setCopiedRow((cur) => (cur === playerId ? null : cur)), 2000);
      }
    } catch {
      // Surface as a tiny visual nothing — the row text is still selectable.
    }
  }

  return (
    <UpgradeGate feature="report_cards" featureLabel="Post-game parent texts">
      <div
        data-testid="postgame-parent-texts"
        className="rounded-2xl border border-orange-500/25 bg-zinc-900/60 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
            <MessageSquare className="h-4 w-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
              Post-game parent texts
            </p>
            <p className="text-sm font-semibold text-zinc-100 leading-snug">
              One short text per kid to paste into Messages
            </p>
            <p className="mt-1 text-xs text-zinc-400 leading-snug">
              Built from this game&rsquo;s notes. Coach-only — copy a row, paste it into the parent&rsquo;s text thread.
            </p>

            {!sheet && !coldGame && (
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                data-testid="postgame-parent-texts-button"
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/15 px-4 py-3 text-sm font-medium text-orange-200 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Writing the texts&hellip;
                  </>
                ) : (
                  <>Generate parent texts</>
                )}
              </button>
            )}

            {coldGame && (
              <p
                data-testid="postgame-parent-texts-cold"
                className="mt-3 text-xs text-zinc-500 leading-snug"
              >
                Not enough notes from this game to write specific texts yet —
                capture a few observations and come back.
              </p>
            )}

            {error && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                {error}
              </p>
            )}

            {sheet && (
              <ul
                data-testid="postgame-parent-texts-entries"
                className="mt-3 space-y-2.5 select-text"
              >
                {sheet.entries.map((entry) => {
                  const copied = copiedRow === entry.player_id;
                  return (
                    <li
                      key={entry.player_id}
                      data-testid={`postgame-parent-texts-row-${entry.player_id}`}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-zinc-100">
                            {entry.player_first_name}
                          </p>
                          {/* The whole row is one contiguous text block so a
                              long-press selects-all cleanly on iOS / Android
                              (no inline buttons interrupting the sentence). */}
                          <p className="mt-1 text-sm leading-snug text-zinc-200">
                            {entry.text_message}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => copyRow(entry.player_id, entry.text_message)}
                          data-testid={`postgame-parent-texts-copy-${entry.player_id}`}
                          aria-label={`Copy text for ${entry.player_first_name}`}
                          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100 transition-colors touch-manipulation active:scale-[0.97]"
                        >
                          {copied ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </>
                          )}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </UpgradeGate>
  );
}
