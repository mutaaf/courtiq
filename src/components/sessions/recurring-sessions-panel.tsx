'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Repeat, Plus, Trash2, Zap, X, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import type { RecurringSession, SessionType } from '@/types/database';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const SESSION_TYPE_COLORS: Record<SessionType, string> = {
  practice:   'bg-blue-500/20 text-blue-400',
  game:       'bg-emerald-500/20 text-emerald-400',
  scrimmage:  'bg-purple-500/20 text-purple-400',
  tournament: 'bg-amber-500/20 text-amber-400',
  training:   'bg-orange-500/20 text-orange-400',
};

type GenerateResult = { created: number; skipped: number };

function formatTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(':');
  const hour = parseInt(h);
  return `${hour % 12 || 12}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
}

// ── Create Form (bottom sheet) ──────────────────────────────────────────────

interface CreateFormProps {
  teamId: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateForm({ teamId, onClose, onCreated }: CreateFormProps) {
  const [type, setType]         = useState<SessionType>('practice');
  const [dayOfWeek, setDay]     = useState<number>(2); // Tuesday
  const [startTime, setStart]   = useState('16:00');
  const [endTime, setEnd]       = useState('17:00');
  const [location, setLocation] = useState('');
  const [startDate, setSD]      = useState(() => new Date().toISOString().split('T')[0]);
  const [endDate, setED]        = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  });
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const SESSION_TYPES: { value: SessionType; label: string }[] = [
    { value: 'practice',   label: 'Practice' },
    { value: 'game',       label: 'Game' },
    { value: 'scrimmage',  label: 'Scrimmage' },
    { value: 'tournament', label: 'Tournament' },
    { value: 'training',   label: 'Training' },
  ];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/recurring-sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId, type, day_of_week: dayOfWeek,
          start_time: startTime || null,
          end_time: endTime || null,
          location: location || null,
          start_date: startDate,
          end_date: endDate,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to create');
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg bg-zinc-900 rounded-t-2xl sm:rounded-2xl border border-zinc-800 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div>
            <h2 className="text-lg font-semibold">New Recurring Session</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Auto-generate sessions every week</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors touch-manipulation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {/* Session type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Session Type</label>
            <div className="flex flex-wrap gap-2">
              {SESSION_TYPES.map(st => (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => setType(st.value)}
                  className={`rounded-full px-4 py-2 text-sm font-medium transition-colors touch-manipulation ${
                    type === st.value
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Day of week */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300">Day of Week</label>
            <div className="grid grid-cols-7 gap-1">
              {DAY_NAMES.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setDay(i)}
                  className={`h-11 rounded-lg text-sm font-medium transition-colors touch-manipulation ${
                    dayOfWeek === i
                      ? 'bg-orange-500 text-white'
                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Time range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Start Time</label>
              <Input type="time" value={startTime} onChange={e => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">End Time</label>
              <Input type="time" value={endTime} onChange={e => setEnd(e.target.value)} />
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Location (optional)</label>
            <Input
              placeholder="e.g. Main Gym, Court 3"
              value={location}
              onChange={e => setLocation(e.target.value)}
            />
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Season Start</label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setSD(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">Season End</label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setED(e.target.value)}
                required
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">{error}</div>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" className="flex-1 h-12 sm:h-10" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1 h-12 sm:h-10" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Schedule
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function RecurringSessionsPanel() {
  const { activeTeam } = useActiveTeam();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, GenerateResult>>({});

  const { data: schedules, isLoading } = useQuery<RecurringSession[]>({
    queryKey: ['recurring-sessions', activeTeam?.id],
    queryFn: async () => {
      const res = await fetch(`/api/recurring-sessions?team_id=${activeTeam!.id}`);
      if (!res.ok) throw new Error('Failed to load');
      return res.json();
    },
    enabled: !!activeTeam,
    staleTime: 60_000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/recurring-sessions/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recurring-sessions', activeTeam?.id] });
    },
  });

  async function generate(id: string) {
    setGenerating(id);
    try {
      const res = await fetch(`/api/recurring-sessions/${id}/generate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResults(r => ({ ...r, [id]: data }));
      // Invalidate sessions so the sessions list refreshes
      qc.invalidateQueries({ queryKey: ['sessions'] });
    } catch {
      // ignore — leave generating state clear
    } finally {
      setGenerating(null);
    }
  }

  if (!activeTeam) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-orange-500" />
              <CardTitle className="text-base">Recurring Sessions</CardTitle>
              {schedules && schedules.length > 0 && (
                <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                  {schedules.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                aria-label="New recurring session"
                onClick={() => setShowForm(true)}
                className="h-9 w-9 touch-manipulation"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <button
                onClick={() => setCollapsed(c => !c)}
                aria-expanded={!collapsed}
                aria-label={collapsed ? 'Expand recurring sessions' : 'Collapse recurring sessions'}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors touch-manipulation"
              >
                {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="space-y-3">
            {isLoading ? (
              <>
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
              </>
            ) : schedules?.length === 0 ? (
              <button
                onClick={() => setShowForm(true)}
                className="w-full rounded-xl border border-dashed border-zinc-700 p-5 text-center hover:border-zinc-600 transition-colors touch-manipulation"
              >
                <Repeat className="mx-auto h-8 w-8 text-zinc-600 mb-2" />
                <p className="text-sm font-medium text-zinc-400">No recurring sessions</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Set up a weekly schedule to auto-generate sessions
                </p>
              </button>
            ) : (
              schedules?.map(s => {
                const result = results[s.id];
                const isGen = generating === s.id;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3"
                  >
                    {/* Info */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${SESSION_TYPE_COLORS[s.type]}`}>
                          {s.type.charAt(0).toUpperCase() + s.type.slice(1)}
                        </span>
                        <span className="text-sm font-medium text-zinc-100">
                          Every {DAY_NAMES_FULL[s.day_of_week]}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                        {(s.start_time || s.end_time) && (
                          <span>
                            {formatTime(s.start_time)}
                            {s.end_time && ` – ${formatTime(s.end_time)}`}
                          </span>
                        )}
                        {s.location && <span>{s.location}</span>}
                        <span>
                          {new Date(s.start_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {' – '}
                          {new Date(s.end_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      {result && (
                        <div className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle className="h-3.5 w-3.5" />
                          {result.created === 0
                            ? 'All sessions already exist'
                            : `${result.created} session${result.created !== 1 ? 's' : ''} created${result.skipped > 0 ? `, ${result.skipped} skipped` : ''}`}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => generate(s.id)}
                        disabled={isGen}
                        aria-label="Generate sessions"
                        title="Generate sessions for this schedule"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-orange-400 hover:bg-orange-500/10 transition-colors touch-manipulation disabled:opacity-50"
                      >
                        {isGen ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(s.id)}
                        aria-label="Delete recurring session"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors touch-manipulation"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        )}
      </Card>

      {showForm && (
        <CreateForm
          teamId={activeTeam.id}
          onClose={() => setShowForm(false)}
          onCreated={() => qc.invalidateQueries({ queryKey: ['recurring-sessions', activeTeam.id] })}
        />
      )}
    </>
  );
}
