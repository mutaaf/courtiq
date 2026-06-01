'use client';

/**
 * Ticket 0062 — opt-out toggle row for the mid-week silent-player nudge.
 *
 * Mirrors the existing 0058 Sunday-plan-prompt toggle row on
 * `src/app/(dashboard)/settings/profile/page.tsx`. The on/off encoding is
 * identical to the weekly-digest + practice-reminder + Sunday-plan-prompt
 * toggles:
 *   - "on" (enabled, the coach receives the nudge) → preferences has NO
 *     `disable_silent_player_nudge` key.
 *   - "off" (disabled, opted out) → `disable_silent_player_nudge: true`.
 *
 * The toggle writes through `mutate()` to `coaches.preferences`. The
 * /api/data/mutate route enforces `filters.id === user.id` for the coaches
 * table (ticket 0042) so a forged coach_id cannot ride through.
 *
 * Voice contract (AGENTS.md): the label + description are written
 * POSITIVELY — no banned hype tokens. See
 * `tests/components/silent-player-nudge-toggle.test.tsx`.
 */
import { useState } from 'react';
import { mutate } from '@/lib/api';

export interface SilentPlayerNudgeToggleProps {
  coachId: string;
  preferences: Record<string, unknown> | null | undefined;
}

function readDisabled(prefs: Record<string, unknown> | null | undefined): boolean {
  if (!prefs) return false;
  return prefs.disable_silent_player_nudge === true;
}

export function SilentPlayerNudgeToggle({
  coachId,
  preferences,
}: SilentPlayerNudgeToggleProps) {
  const [enabled, setEnabled] = useState<boolean>(!readDisabled(preferences));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleToggle(next: boolean) {
    setSaving(true);
    setSaved(false);
    const base = (preferences && typeof preferences === 'object' ? preferences : {}) as Record<
      string,
      unknown
    >;
    const newPrefs = next
      ? Object.fromEntries(
          Object.entries({ ...base }).filter(([k]) => k !== 'disable_silent_player_nudge'),
        )
      : { ...base, disable_silent_player_nudge: true };
    try {
      await mutate({
        table: 'coaches',
        operation: 'update',
        data: { preferences: newPrefs },
        filters: { id: coachId },
      });
      setEnabled(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="border-t border-zinc-800 pt-4 flex items-start justify-between gap-4"
      data-testid="silent-player-nudge-toggle-row"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200">Silent-player nudge</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
          On Thursday evening, get a short email when a player on your roster
          has gone 8+ days without a note — naming that one kid and linking
          straight into Capture for them.
        </p>
        {saved && <p className="text-xs text-emerald-400 mt-1">Saved!</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Silent-player nudge"
        disabled={saving}
        onClick={() => handleToggle(!enabled)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50',
          enabled ? 'bg-orange-500' : 'bg-zinc-700',
        ].join(' ')}
      >
        <span
          className={[
            'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
            enabled ? 'translate-x-5' : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </div>
  );
}
