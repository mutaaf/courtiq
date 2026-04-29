'use client';

/**
 * Catch-up flow for coaches who joined SportsIQ mid-season. Lets them rapidly
 * create past sessions and (optionally) drop a recap note per session that
 * gets AI-segmented into observations — so the dashboard reflects the season
 * already in progress without filling out the full new-session form per row.
 */

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Loader2,
  Plus,
  X,
  Calendar,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { SessionType } from '@/types/database';
import { trackEvent } from '@/lib/analytics';

interface BackfillRow {
  id: string;          // local-only key for React
  date: string;        // YYYY-MM-DD
  type: SessionType;
  opponent: string;
  notes: string;
  notesOpen: boolean;  // collapsed by default to keep the list dense
}

const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'practice', label: 'Practice' },
  { value: 'game', label: 'Game' },
  { value: 'scrimmage', label: 'Scrimmage' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'training', label: 'Training' },
];

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Quick-fill: create N rows, one per week going back, each on the typical
 * practice day-of-week (defaults to today's weekday).
 */
function buildWeeklyRows(weeks: number, defaultType: SessionType = 'practice'): BackfillRow[] {
  const rows: BackfillRow[] = [];
  for (let i = 0; i < weeks; i++) {
    rows.push({
      id: genId(),
      date: daysAgoStr(7 * (i + 1)),
      type: defaultType,
      opponent: '',
      notes: '',
      notesOpen: false,
    });
  }
  return rows;
}

export default function BackfillSessionsPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [rows, setRows] = useState<BackfillRow[]>([
    { id: genId(), date: daysAgoStr(7), type: 'practice', opponent: '', notes: '', notesOpen: false },
    { id: genId(), date: daysAgoStr(14), type: 'practice', opponent: '', notes: '', notesOpen: false },
    { id: genId(), date: daysAgoStr(21), type: 'practice', opponent: '', notes: '', notesOpen: false },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sessionsCreated: number;
    observationsCreated: number;
    errors: number;
  } | null>(null);

  const validRowCount = useMemo(
    () => rows.filter((r) => r.date && r.type).length,
    [rows],
  );
  const rowsWithNotes = useMemo(
    () => rows.filter((r) => r.notes.trim().length > 0).length,
    [rows],
  );

  function update(id: string, patch: Partial<BackfillRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { id: genId(), date: todayStr(), type: 'practice', opponent: '', notes: '', notesOpen: false },
    ]);
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function quickFill(weeks: number) {
    setRows(buildWeeklyRows(weeks));
    trackEvent('backfill_quick_fill', { weeks });
  }

  async function handleSubmit() {
    if (!activeTeam) return;
    setSubmitting(true);
    setError(null);

    const payload = rows
      .filter((r) => r.date && r.type)
      .map((r) => ({
        date: r.date,
        type: r.type,
        opponent: r.opponent.trim() || undefined,
        notes: r.notes.trim() || undefined,
      }));

    if (payload.length === 0) {
      setError('Add at least one session to backfill.');
      setSubmitting(false);
      return;
    }

    trackEvent('backfill_submitted', {
      session_count: payload.length,
      with_notes: payload.filter((p) => p.notes).length,
    });

    try {
      const res = await fetch('/api/sessions/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, sessions: payload }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Backfill failed');
      }
      const data: {
        sessions: Array<{ id: string; date: string; type: string; observations_created: number }>;
        errors: Array<{ index: number; reason: string }>;
      } = await res.json();

      const sessionsCreated = data.sessions.length;
      const observationsCreated = data.sessions.reduce((sum, s) => sum + (s.observations_created || 0), 0);

      trackEvent('backfill_succeeded', {
        sessions_created: sessionsCreated,
        observations_created: observationsCreated,
        errors: data.errors.length,
      });

      // Refresh sessions list cache
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(activeTeam.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.observations.all(activeTeam.id) });

      setResult({ sessionsCreated, observationsCreated, errors: data.errors.length });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      trackEvent('backfill_failed', { reason: msg });
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-zinc-400">Select a team first.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8">
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
              <CheckCircle2 className="h-9 w-9 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100">Caught up!</h1>
            <p className="mt-2 text-sm text-zinc-400 max-w-sm">
              Added {result.sessionsCreated} session{result.sessionsCreated === 1 ? '' : 's'} to your timeline
              {result.observationsCreated > 0
                ? ` and pulled ${result.observationsCreated} observations from your notes.`
                : '.'}
              {result.errors > 0 && (
                <span className="block mt-2 text-amber-400">
                  {result.errors} note{result.errors === 1 ? '' : 's'} couldn&apos;t be processed —
                  the sessions are still saved; you can add observations manually.
                </span>
              )}
            </p>
            <div className="mt-6 flex w-full gap-2">
              <Button onClick={() => router.push('/sessions')} className="flex-1">
                View Sessions
              </Button>
              <Button variant="outline" onClick={() => { setResult(null); setRows([]); }}>
                Add more
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4 lg:p-8 overflow-x-hidden">
      <Link
        href="/sessions"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Sessions
      </Link>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-zinc-100">Catch up your season</h1>
        <p className="text-sm text-zinc-400 leading-relaxed max-w-xl">
          Joined mid-season? Add past practices and games here in one shot. Drop a recap note per
          session and we&apos;ll pull observations out of it automatically — so your dashboard,
          report cards, and AI plans reflect the whole season, not just from today forward.
        </p>
      </div>

      {/* Quick-fill */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Quick fill</p>
        <p className="text-xs text-zinc-400">
          Fill in past weeks at once — one practice per week, you can edit dates after.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {[3, 6, 9, 12].map((n) => (
            <button
              key={n}
              onClick={() => quickFill(n)}
              className="rounded-full bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-colors active:scale-95 touch-manipulation"
            >
              Last {n} weeks
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {/* Rows */}
      <div className="space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-700 p-6 text-center">
            <Calendar className="mx-auto h-8 w-8 text-zinc-600" />
            <p className="mt-2 text-sm text-zinc-400">No rows yet — add one or use Quick fill above.</p>
          </div>
        )}
        {rows.map((row) => {
          const isGameLike =
            row.type === 'game' || row.type === 'scrimmage' || row.type === 'tournament';
          return (
            <div
              key={row.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  max={todayStr()}
                  value={row.date}
                  onChange={(e) => update(row.id, { date: e.target.value })}
                  className="w-auto flex-1 sm:flex-none sm:w-44 h-9"
                />
                <select
                  value={row.type}
                  onChange={(e) => update(row.id, { type: e.target.value as SessionType })}
                  className="h-9 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
                >
                  {SESSION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => removeRow(row.id)}
                  aria-label="Remove row"
                  className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {isGameLike && (
                <Input
                  placeholder="Opponent (optional)"
                  value={row.opponent}
                  onChange={(e) => update(row.id, { opponent: e.target.value })}
                  className="h-9"
                />
              )}

              {/* Notes accordion */}
              <button
                onClick={() => update(row.id, { notesOpen: !row.notesOpen })}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {row.notesOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {row.notes ? `Recap notes (${row.notes.length})` : 'Add recap notes'}
                {!row.notesOpen && row.notes && (
                  <span className="text-emerald-400">·</span>
                )}
              </button>

              {row.notesOpen && (
                <div className="space-y-1.5">
                  <Textarea
                    rows={4}
                    placeholder="Recap what happened — players, what they did well or need work on, key moments. We'll pull observations out of this automatically."
                    value={row.notes}
                    onChange={(e) => update(row.id, { notes: e.target.value })}
                    maxLength={5000}
                  />
                  <p className="text-[11px] text-zinc-500 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-orange-400" />
                    AI segments your recap into per-player observations on save.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add row */}
      <Button variant="outline" onClick={addRow} className="w-full">
        <Plus className="h-4 w-4" />
        Add another session
      </Button>

      {/* Submit */}
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4 z-10">
        <Card className="shadow-xl">
          <CardContent className="flex items-center justify-between gap-3 p-3">
            <div className="text-sm">
              <p className="font-semibold text-zinc-100">
                {validRowCount} session{validRowCount === 1 ? '' : 's'}
              </p>
              {rowsWithNotes > 0 && (
                <p className="text-xs text-zinc-400">{rowsWithNotes} with recap notes</p>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || validRowCount === 0}
              size="lg"
              className="shrink-0"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Backfill {validRowCount > 0 ? validRowCount : ''}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
