'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Target,
  Plus,
  Sparkles,
  CheckCircle2,
  Clock,
  AlertCircle,
  Archive,
  Loader2,
  X,
  Trash2,
  ChevronDown,
  ChevronUp,
  CalendarDays,
  TrendingUp,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { PlayerGoal, GoalStatus, ProficiencyLevel } from '@/types/database';
import type { GoalSuggestion } from '@/app/api/player-goals/route';

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  GoalStatus,
  { label: string; icon: typeof Target; color: string; border: string; bg: string }
> = {
  active:   { label: 'Active',   icon: Target,       color: 'text-orange-400',  border: 'border-orange-500/30',  bg: 'bg-orange-500/10' },
  achieved: { label: 'Achieved', icon: CheckCircle2, color: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  stalled:  { label: 'Stalled',  icon: AlertCircle,  color: 'text-amber-400',   border: 'border-amber-500/30',   bg: 'bg-amber-500/10' },
  archived: { label: 'Archived', icon: Archive,      color: 'text-zinc-500',    border: 'border-zinc-700',       bg: 'bg-zinc-900/40' },
};

const LEVEL_LABELS: Record<ProficiencyLevel, string> = {
  insufficient_data: 'Not tracked',
  exploring:   'Exploring',
  practicing:  'Practicing',
  got_it:      'Got It',
  game_ready:  'Game Ready',
};

const VALID_LEVELS: ProficiencyLevel[] = ['exploring', 'practicing', 'got_it', 'game_ready'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface GoalsResponse {
  goals: PlayerGoal[];
  suggestions?: GoalSuggestion[];
}

interface Props {
  playerId: string;
  teamId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlayerGoalsPanel({ playerId, teamId }: Props) {
  const qc = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);

  // Add-goal form state
  const [formSkill, setFormSkill] = useState('');
  const [formGoalText, setFormGoalText] = useState('');
  const [formTargetLevel, setFormTargetLevel] = useState<ProficiencyLevel | ''>('');
  const [formTargetDate, setFormTargetDate] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<GoalsResponse>({
    queryKey: queryKeys.goals.player(playerId),
    queryFn: async () => {
      const res = await fetch(`/api/player-goals?player_id=${playerId}`);
      if (!res.ok) throw new Error('Failed to load goals');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const { data: suggestData, isFetching: isSuggesting } = useQuery<GoalsResponse>({
    queryKey: [...queryKeys.goals.player(playerId), 'suggest'],
    queryFn: async () => {
      const res = await fetch(`/api/player-goals?player_id=${playerId}&suggest=true`);
      if (!res.ok) throw new Error('Failed to get suggestions');
      return res.json();
    },
    enabled: showSuggestions,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.goals.player(playerId) });

  const createMutation = useMutation({
    mutationFn: async (payload: {
      skill: string;
      goal_text: string;
      target_level?: ProficiencyLevel;
      target_date?: string;
      notes?: string;
    }) => {
      const res = await fetch('/api/player-goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, team_id: teamId, ...payload }),
      });
      if (!res.ok) throw new Error('Failed to create goal');
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; status?: GoalStatus; notes?: string }) => {
      const res = await fetch(`/api/player-goals?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update goal');
      return res.json();
    },
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/player-goals?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete goal');
    },
    onSuccess: invalidate,
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function resetForm() {
    setFormSkill('');
    setFormGoalText('');
    setFormTargetLevel('');
    setFormTargetDate('');
    setFormNotes('');
  }

  function handleAddFromSuggestion(s: GoalSuggestion) {
    createMutation.mutate({
      skill: s.skill,
      goal_text: s.goal_text,
      target_level: s.target_level,
    });
  }

  function handleSubmitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!formSkill.trim() || !formGoalText.trim()) return;
    createMutation.mutate({
      skill: formSkill,
      goal_text: formGoalText,
      target_level: formTargetLevel || undefined,
      target_date: formTargetDate || undefined,
      notes: formNotes || undefined,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const goals = data?.goals ?? [];
  const active = goals.filter(g => g.status === 'active');
  const achieved = goals.filter(g => g.status === 'achieved');
  const stalled = goals.filter(g => g.status === 'stalled');
  const archived = goals.filter(g => g.status === 'archived');
  const visible = [...active, ...stalled, ...achieved, ...(showArchived ? archived : [])];
  const suggestions = suggestData?.suggestions ?? [];

  return (
    <>
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-5 w-5 text-orange-400" />
              Development Goals
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 gap-1.5 text-xs text-zinc-400 hover:text-orange-400"
                onClick={() => { setShowSuggestions(true); }}
                aria-label="Get AI goal suggestions"
              >
                <Sparkles className="h-3.5 w-3.5" />
                AI Suggest
              </Button>
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setShowAdd(true)}
                aria-label="Add new goal"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Goal
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          {isLoading ? (
            Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))
          ) : visible.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center">
              <Target className="mx-auto mb-2 h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-500">No goals set yet</p>
              <p className="mt-1 text-xs text-zinc-600">
                Add goals manually or use AI Suggest to generate recommendations
              </p>
            </div>
          ) : (
            visible.map((goal) => {
              const cfg = STATUS_CONFIG[goal.status];
              const Icon = cfg.icon;
              const isExpanded = expandedGoal === goal.id;

              return (
                <div
                  key={goal.id}
                  className={`rounded-lg border p-3 ${cfg.bg} ${cfg.border}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2 flex-1 min-w-0">
                      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
                            {goal.skill}
                          </span>
                          <Badge
                            variant="secondary"
                            className={`text-[10px] px-1.5 py-0 ${cfg.color} bg-transparent border border-current`}
                          >
                            {cfg.label}
                          </Badge>
                          {goal.target_level && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-zinc-400">
                              → {LEVEL_LABELS[goal.target_level]}
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-zinc-200 leading-snug">{goal.goal_text}</p>
                        {goal.target_date && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-zinc-500">
                            <CalendarDays className="h-3 w-3" />
                            Target: {formatDate(goal.target_date)}
                          </p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedGoal(isExpanded ? null : goal.id)}
                      className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
                      aria-label={isExpanded ? 'Collapse goal options' : 'Expand goal options'}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {goal.notes && !isExpanded && (
                    <p className="mt-2 ml-6 text-xs text-zinc-500 italic line-clamp-1">{goal.notes}</p>
                  )}

                  {isExpanded && (
                    <div className="mt-3 ml-6 space-y-2 border-t border-zinc-800 pt-3">
                      {goal.notes && (
                        <p className="text-xs text-zinc-400 italic">{goal.notes}</p>
                      )}
                      <p className="text-[11px] text-zinc-600">
                        Added {formatDate(goal.created_at)}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {goal.status !== 'achieved' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                            onClick={() => updateMutation.mutate({ id: goal.id, status: 'achieved' })}
                            disabled={updateMutation.isPending}
                            aria-label="Mark goal as achieved"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            Achieved
                          </button>
                        )}
                        {goal.status === 'active' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors"
                            onClick={() => updateMutation.mutate({ id: goal.id, status: 'stalled' })}
                            disabled={updateMutation.isPending}
                            aria-label="Mark goal as stalled"
                          >
                            <AlertCircle className="h-3 w-3" />
                            Stalled
                          </button>
                        )}
                        {goal.status === 'stalled' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 border border-orange-500/30 px-2.5 py-1 text-xs font-medium text-orange-400 hover:bg-orange-500/20 transition-colors"
                            onClick={() => updateMutation.mutate({ id: goal.id, status: 'active' })}
                            disabled={updateMutation.isPending}
                            aria-label="Reactivate goal"
                          >
                            <Target className="h-3 w-3" />
                            Reactivate
                          </button>
                        )}
                        {goal.status !== 'archived' && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-md bg-zinc-800 border border-zinc-700 px-2.5 py-1 text-xs font-medium text-zinc-400 hover:bg-zinc-700 transition-colors"
                            onClick={() => updateMutation.mutate({ id: goal.id, status: 'archived' })}
                            disabled={updateMutation.isPending}
                            aria-label="Archive goal"
                          >
                            <Archive className="h-3 w-3" />
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md bg-red-500/10 border border-red-500/30 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20 transition-colors ml-auto"
                          onClick={() => deleteMutation.mutate(goal.id)}
                          disabled={deleteMutation.isPending}
                          aria-label="Delete goal"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                      {updateMutation.isError && (
                        <p className="text-xs text-red-400">Failed to update. Try again.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}

          {archived.length > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived(!showArchived)}
              className="w-full flex items-center justify-center gap-1 py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              aria-expanded={showArchived}
            >
              {showArchived ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {showArchived ? 'Hide' : `Show ${archived.length} archived`}
            </button>
          )}

          {/* Stats strip */}
          {goals.length > 0 && (
            <div className="flex gap-4 pt-1 border-t border-zinc-800">
              {([
                ['Active', active.length, 'text-orange-400'],
                ['Achieved', achieved.length, 'text-emerald-400'],
                ['Stalled', stalled.length, 'text-amber-400'],
              ] as const).map(([label, count, color]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className={`text-sm font-semibold ${color}`}>{count}</span>
                  <span className="text-xs text-zinc-500">{label}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Goal Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-goal-title"
        >
          <div className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-6 sm:rounded-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 id="add-goal-title" className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Target className="h-4 w-4 text-orange-400" />
                New Development Goal
              </h2>
              <button
                type="button"
                onClick={() => { setShowAdd(false); resetForm(); }}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAdd} className="space-y-4">
              <div>
                <label htmlFor="goal-skill" className="block text-xs text-zinc-400 mb-1">
                  Skill / Area <span className="text-red-400">*</span>
                </label>
                <input
                  id="goal-skill"
                  type="text"
                  required
                  value={formSkill}
                  onChange={e => setFormSkill(e.target.value)}
                  placeholder="e.g. Dribbling, Defense, Shooting"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                  maxLength={80}
                />
              </div>

              <div>
                <label htmlFor="goal-text" className="block text-xs text-zinc-400 mb-1">
                  Goal <span className="text-red-400">*</span>
                </label>
                <textarea
                  id="goal-text"
                  required
                  value={formGoalText}
                  onChange={e => setFormGoalText(e.target.value)}
                  placeholder="e.g. Execute dribble-drives confidently in game situations"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                  maxLength={300}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="goal-target-level" className="block text-xs text-zinc-400 mb-1">
                    Target Level
                  </label>
                  <select
                    id="goal-target-level"
                    value={formTargetLevel}
                    onChange={e => setFormTargetLevel(e.target.value as ProficiencyLevel | '')}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 focus:border-orange-500 focus:outline-none"
                  >
                    <option value="">None</option>
                    {VALID_LEVELS.map(l => (
                      <option key={l} value={l}>{LEVEL_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="goal-target-date" className="block text-xs text-zinc-400 mb-1">
                    Target Date
                  </label>
                  <input
                    id="goal-target-date"
                    type="date"
                    value={formTargetDate}
                    onChange={e => setFormTargetDate(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 focus:border-orange-500 focus:outline-none [color-scheme:dark]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="goal-notes" className="block text-xs text-zinc-400 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="goal-notes"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="Any context or strategy for reaching this goal"
                  rows={2}
                  className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                  maxLength={500}
                />
              </div>

              <div className="flex gap-3 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  className="flex-1"
                  onClick={() => { setShowAdd(false); resetForm(); }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || !formSkill.trim() || !formGoalText.trim()}
                >
                  {createMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Goal
                </Button>
              </div>

              {createMutation.isError && (
                <p className="text-xs text-red-400 text-center">Failed to save goal. Try again.</p>
              )}
            </form>
          </div>
        </div>
      )}

      {/* AI Suggestions Modal */}
      {showSuggestions && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="suggestions-title"
        >
          <div className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-6 sm:rounded-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-2">
              <h2 id="suggestions-title" className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-orange-400" />
                AI Goal Suggestions
              </h2>
              <button
                type="button"
                onClick={() => setShowSuggestions(false)}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Close suggestions"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-zinc-500 mb-5">
              Based on skill proficiency and recent observations
            </p>

            {isSuggesting ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-3 w-full mb-1" />
                    <Skeleton className="h-3 w-3/4" />
                  </div>
                ))}
                <p className="text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing player data…
                </p>
              </div>
            ) : suggestions.length === 0 ? (
              <div className="rounded-lg border border-dashed border-zinc-800 p-6 text-center">
                <TrendingUp className="mx-auto mb-2 h-8 w-8 text-zinc-700" />
                <p className="text-sm text-zinc-500">No suggestions available</p>
                <p className="mt-1 text-xs text-zinc-600">Record more observations to unlock AI suggestions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-orange-400 uppercase tracking-wide">
                            {s.skill}
                          </span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            → {LEVEL_LABELS[s.target_level] ?? s.target_level}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-200">{s.goal_text}</p>
                        <p className="mt-1.5 text-[11px] text-zinc-500 italic">{s.rationale}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="mt-3 w-full h-8 text-xs"
                      onClick={() => handleAddFromSuggestion(s)}
                      disabled={createMutation.isPending}
                      aria-label={`Add goal: ${s.goal_text}`}
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                      ) : (
                        <Plus className="h-3 w-3 mr-1.5" />
                      )}
                      Add This Goal
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <Button
              variant="ghost"
              className="mt-4 w-full"
              onClick={() => setShowSuggestions(false)}
            >
              Close
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
