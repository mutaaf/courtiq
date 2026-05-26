'use client';

import { useState } from 'react';
import { ClipboardList, Loader2, AlertCircle } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import type { SidelineTalkingPoints } from '@/lib/ai/schemas';

// ─── Ticket 0046 — coach-private sideline cheat sheet card ─────────────────────
//
// Saturday morning, ten minutes before the U10 game, in the parking lot. The
// coach taps the card; six seconds later they have one screen they can scroll
// through at half-time, one row per kid, two short lines per row. No public
// surface, no share link, no parent view by design (the artifact's value is in
// the coach's hands, never in front of the parent — see ticket body).
//
// Tier gate: paired with the server-side `canAccess(tier, 'report_cards')` check
// in /api/ai/sideline-talking-points (AGENTS.md rule 5; LESSONS#0023 — the
// `feature` prop value MUST equal the tier-key string verbatim).
//
// This card is INTENTIONALLY one-tap, not auto-loading like the weekly digest:
// the artifact is pre-game, on-demand, and quota-aware. We never fire the AI
// call until the coach asks for it.

export function SidelineCheatSheetCard({ teamId }: { teamId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SidelineTalkingPoints | null>(null);
  const [coldTeam, setColdTeam] = useState(false);

  async function generate() {
    setLoading(true);
    setError(null);
    setColdTeam(false);
    try {
      const res = await fetch('/api/ai/sideline-talking-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error || 'Could not generate the sideline sheet.');
        setLoading(false);
        return;
      }
      const json = await res.json();
      // Below-threshold short-circuit (mirror 0023's quiet-week pattern).
      if (!json?.content_structured) {
        setColdTeam(true);
        setSheet(null);
      } else {
        setSheet(json.content_structured as SidelineTalkingPoints);
      }
    } catch (_e) {
      setError('Could not generate the sideline sheet.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <UpgradeGate feature="report_cards" featureLabel="the Sideline Cheat Sheet">
      <div
        data-testid="sideline-cheat-sheet-card"
        className="rounded-2xl border border-orange-500/25 bg-zinc-900/60 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
            <ClipboardList className="h-4 w-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
              Sideline cheat sheet
            </p>
            <p className="text-sm font-semibold text-zinc-100 leading-snug">
              One line per kid to say to that kid&rsquo;s parent
            </p>
            <p className="mt-1 text-xs text-zinc-400 leading-snug">
              Built from your last two weeks of notes. Coach-only — never shared, never sent.
            </p>

            {!sheet && !coldTeam && (
              <button
                type="button"
                onClick={generate}
                disabled={loading}
                data-testid="sideline-cheat-sheet-button"
                className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/30 bg-orange-500/15 px-4 py-3 text-sm font-medium text-orange-200 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97] disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Building the sheet&hellip;
                  </>
                ) : (
                  <>Generate sideline cheat sheet</>
                )}
              </button>
            )}

            {coldTeam && (
              <p
                data-testid="sideline-cheat-sheet-cold"
                className="mt-3 text-xs text-zinc-500 leading-snug"
              >
                Not enough notes in the last two weeks to write specific lines yet — keep capturing
                during practice and come back before the next game.
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
                data-testid="sideline-cheat-sheet-entries"
                className="mt-3 space-y-2.5 select-text"
              >
                {sheet.entries.map((entry) => (
                  <li
                    key={entry.player_id}
                    data-testid="sideline-cheat-sheet-row"
                    className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"
                  >
                    <p className="text-sm font-semibold text-zinc-100">{entry.player_first_name}</p>
                    <p className="mt-1 text-xs leading-snug text-zinc-300">{entry.lead_line}</p>
                    <p className="mt-1 text-xs leading-snug text-zinc-400 italic">
                      {entry.working_on_line}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </UpgradeGate>
  );
}
