'use client';

/**
 * Ticket 0058 — opt-out toggle row for the Sunday-evening plan-finish prompt.
 *
 * Mirrors the existing "Practice day reminders" toggle row on
 * `src/app/(dashboard)/settings/profile/page.tsx`. The on/off encoding is
 * identical to the weekly-digest + practice-reminder toggles:
 *   - "on" (enabled, the coach receives the prompt) → preferences has NO
 *     `disable_planning_prompts` key.
 *   - "off" (disabled, opted out) → `disable_planning_prompts: true`.
 *
 * The toggle writes through `mutate()` to `coaches.preferences`. The
 * /api/data/mutate route enforces `filters.id === user.id` for the coaches
 * table (ticket 0042) so a forged coach_id cannot ride through.
 *
 * Voice contract (AGENTS.md): the label + description are written
 * POSITIVELY — no banned hype tokens. See
 * `tests/components/sunday-plan-prompt-toggle.test.tsx`.
 */
import { useState } from 'react';
import { mutate } from '@/lib/api';

export interface SundayPlanPromptToggleProps {
  coachId: string;
  preferences: Record<string, unknown> | null | undefined;
}

function readDisabled(prefs: Record<string, unknown> | null | undefined): boolean {
  if (!prefs) return false;
  return prefs.disable_planning_prompts === true;
}

export function SundayPlanPromptToggle({
  coachId,
  preferences,
}: SundayPlanPromptToggleProps) {
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
          Object.entries({ ...base }).filter(([k]) => k !== 'disable_planning_prompts'),
        )
      : { ...base, disable_planning_prompts: true };
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
      data-testid="sunday-plan-prompt-toggle-row"
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200">Sunday planning prompt</p>
        <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
          On Sunday evening, get a short email about any practice plan you started but
          have not finished yet, with a one-tap link back to it.
        </p>
        {saved && <p className="text-xs text-emerald-400 mt-1">Saved!</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Sunday planning prompt"
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
