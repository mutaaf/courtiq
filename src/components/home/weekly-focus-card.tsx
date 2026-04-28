'use client';

import { useState, useEffect } from 'react';
import { Target, X, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  FOCUS_CATEGORIES,
  getWeeklyFocus,
  setWeeklyFocus,
  clearWeeklyFocus,
  getFocusCategoryConfig,
  getDaysRemaining,
  formatFocusAge,
  type FocusCategory,
  type WeeklyFocus,
} from '@/lib/weekly-focus-utils';

interface WeeklyFocusCardProps {
  teamId: string;
}

export function WeeklyFocusCard({ teamId }: WeeklyFocusCardProps) {
  const [focus, setFocus] = useState<WeeklyFocus | null>(null);
  const [picking, setPicking] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read from localStorage only on the client
  useEffect(() => {
    setMounted(true);
    setFocus(getWeeklyFocus(teamId));
  }, [teamId]);

  if (!mounted) return null;

  function handleSelect(category: FocusCategory) {
    const newFocus = setWeeklyFocus(teamId, category);
    setFocus(newFocus);
    setPicking(false);
  }

  function handleClear() {
    clearWeeklyFocus(teamId);
    setFocus(null);
    setPicking(false);
  }

  const config = focus ? getFocusCategoryConfig(focus.category) : null;
  const daysLeft = focus ? getDaysRemaining(focus) : 0;
  const ageLabel = focus ? formatFocusAge(focus) : '';

  // ── Picker mode ────────────────────────────────────────────────────────────
  if (picking || !focus) {
    return (
      <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15">
              <Target className="h-4 w-4 text-indigo-400" />
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                Weekly Focus
              </p>
              <p className="text-[10px] text-zinc-500">
                {focus ? 'Change your theme for this week' : 'Set a skill theme for this week'}
              </p>
            </div>
          </div>
          {picking && focus && (
            <button
              onClick={() => setPicking(false)}
              className="p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
              aria-label="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {FOCUS_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleSelect(cat.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-all active:scale-95 touch-manipulation ${
                focus?.category === cat.id
                  ? 'border-indigo-500/60 bg-indigo-500/20 text-indigo-200'
                  : 'border-zinc-700/60 bg-zinc-800/40 text-zinc-300 hover:border-indigo-500/40 hover:bg-indigo-500/10'
              }`}
            >
              <span className="text-base leading-none">{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        {focus && (
          <button
            onClick={handleClear}
            className="w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors py-1"
          >
            Clear weekly focus
          </button>
        )}
      </div>
    );
  }

  // ── Focus set mode ─────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
      <div className="flex items-center gap-3">
        {/* Category icon */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-500/15 text-2xl">
          {config?.emoji ?? '🎯'}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
            This Week's Focus
          </p>
          <p className="text-base font-bold text-zinc-100 leading-snug">
            {config?.label ?? focus.category}
          </p>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Set {ageLabel} · {daysLeft}d left
          </p>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setPicking(true)}
          className="shrink-0 h-8 gap-1 border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 text-xs"
          aria-label="Change weekly focus"
        >
          Change
          <ChevronDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
