'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardList,
  Dumbbell,
  Trophy,
  Loader2,
  Calendar,
  ChevronRight,
  ChevronDown,
  FileText,
  Sparkles,
  X,
  AlertCircle,
  Trash2,
  Send,
} from 'lucide-react';
import type { Plan, PlanType } from '@/types/database';

const PLAN_TYPE_CONFIG: Record<
  string,
  { label: string; icon: typeof ClipboardList; color: string }
> = {
  practice: { label: 'Practice Plan', icon: Dumbbell, color: 'text-blue-400' },
  gameday: { label: 'Game Day Sheet', icon: Trophy, color: 'text-emerald-400' },
  weekly: { label: 'Weekly Plan', icon: Calendar, color: 'text-purple-400' },
  development_card: { label: 'Development Card', icon: FileText, color: 'text-orange-400' },
  parent_report: { label: 'Parent Report', icon: FileText, color: 'text-pink-400' },
  report_card: { label: 'Report Card', icon: FileText, color: 'text-amber-400' },
  custom: { label: 'Custom', icon: ClipboardList, color: 'text-zinc-400' },
};

const SUGGESTION_CHIPS = [
  '60-min practice for fundamentals',
  'Game day sheet',
  'Ball handling and passing drills',
  'Defensive positioning focus',
  'Week recap and conditioning',
  'Shooting skills for beginners',
];

export default function PlansPage() {
  const { activeTeam } = useActiveTeam();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState('');
  const [generatedPreview, setGeneratedPreview] = useState<any>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: queryKeys.plans.all(activeTeam?.id || ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Plan[]>({
        table: 'plans',
        select: '*',
        filters: { team_id: activeTeam.id },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.plans,
  });

  const deleteMutation = useMutation({
    mutationFn: async (planId: string) => {
      const res = await fetch(`/api/plans/${planId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete plan');
    },
    onSuccess: () => {
      if (activeTeam) {
        qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      }
      setSelectedPlan(null);
    },
  });

  const generateFromPrompt = async (text: string) => {
    if (!activeTeam || !text.trim()) return;
    setGenerating(true);
    setError(null);
    setGeneratedPreview(null);

    // Determine type from prompt text
    const lowerText = text.toLowerCase();
    const isGameday = lowerText.includes('game day') || lowerText.includes('gameday') || lowerText.includes('game sheet');
    const type = isGameday ? 'gameday' : 'practice';

    // Extract focus skills from the prompt
    const skillKeywords = ['ball handling', 'passing', 'shooting', 'defense', 'rebounding', 'footwork', 'teamwork', 'conditioning', 'dribbling'];
    const focusSkills = skillKeywords.filter(skill => lowerText.includes(skill));

    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          type,
          focusSkills: focusSkills.length > 0 ? focusSkills : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate plan');
      }
      const data = await res.json();
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setSelectedPlan(data.plan);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleChipClick = (chip: string) => {
    setPrompt(chip);
    generateFromPrompt(chip);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      generateFromPrompt(prompt);
    }
  };

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function renderStructuredContent(plan: Plan) {
    const structured = plan.content_structured as any;
    if (!structured) {
      return (
        <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
          {plan.content}
        </div>
      );
    }

    if (structured.warmup || structured.drills || structured.scrimmage || structured.cooldown) {
      return (
        <div className="space-y-6">
          {structured.title && (
            <h2 className="text-lg font-semibold text-zinc-100">{structured.title}</h2>
          )}
          {structured.overview && (
            <p className="text-sm text-zinc-400">{structured.overview}</p>
          )}

          {structured.warmup && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400">
                Warm-Up
              </h3>
              {typeof structured.warmup === 'object' && !Array.isArray(structured.warmup) ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                  <p className="text-sm font-medium text-zinc-200">{structured.warmup.name}</p>
                  {structured.warmup.duration_minutes && (
                    <span className="text-xs text-zinc-500">{structured.warmup.duration_minutes} min</span>
                  )}
                  {structured.warmup.description && (
                    <p className="mt-1 text-xs text-zinc-400">{structured.warmup.description}</p>
                  )}
                </div>
              ) : Array.isArray(structured.warmup) ? (
                <ul className="space-y-1.5">
                  {structured.warmup.map((item: any, i: number) => (
                    <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                      <p className="text-sm font-medium text-zinc-200">
                        {typeof item === 'string' ? item : item.name || item.activity}
                      </p>
                      {item.duration && (
                        <span className="text-xs text-zinc-500">{item.duration}</span>
                      )}
                      {item.description && (
                        <p className="mt-1 text-xs text-zinc-400">{item.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-300">{String(structured.warmup)}</p>
              )}
            </div>
          )}

          {structured.drills && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                Drills
              </h3>
              {Array.isArray(structured.drills) ? (
                <ul className="space-y-2">
                  {structured.drills.map((drill: any, i: number) => (
                    <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-zinc-200">
                          {typeof drill === 'string' ? drill : drill.name || drill.activity}
                        </p>
                        {(drill.duration_minutes || drill.duration) && (
                          <Badge variant="outline" className="text-xs">
                            {drill.duration_minutes ? `${drill.duration_minutes} min` : drill.duration}
                          </Badge>
                        )}
                      </div>
                      {drill.description && (
                        <p className="mt-1 text-xs text-zinc-400">{drill.description}</p>
                      )}
                      {drill.coaching_cues && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-zinc-500">Coaching Cues:</p>
                          <ul className="mt-1 space-y-0.5">
                            {(Array.isArray(drill.coaching_cues) ? drill.coaching_cues : [drill.coaching_cues]).map(
                              (point: string, j: number) => (
                                <li key={j} className="text-xs text-zinc-400">- {point}</li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                      {drill.coaching_points && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-zinc-500">Coaching Points:</p>
                          <ul className="mt-1 space-y-0.5">
                            {(Array.isArray(drill.coaching_points) ? drill.coaching_points : [drill.coaching_points]).map(
                              (point: string, j: number) => (
                                <li key={j} className="text-xs text-zinc-400">- {point}</li>
                              )
                            )}
                          </ul>
                        </div>
                      )}
                      {drill.skill && (
                        <Badge variant="secondary" className="mt-2 text-xs">{drill.skill}</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-300">{String(structured.drills)}</p>
              )}
            </div>
          )}

          {structured.scrimmage && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400">
                Scrimmage
              </h3>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                {typeof structured.scrimmage === 'string' ? (
                  <p className="text-sm text-zinc-300">{structured.scrimmage}</p>
                ) : (
                  <>
                    {structured.scrimmage.format && (
                      <p className="text-sm font-medium text-zinc-200">{structured.scrimmage.format}</p>
                    )}
                    {structured.scrimmage.duration_minutes && (
                      <span className="text-xs text-zinc-500">{structured.scrimmage.duration_minutes} min</span>
                    )}
                    {structured.scrimmage.focus && (
                      <p className="mt-1 text-xs text-zinc-400">Focus: {structured.scrimmage.focus}</p>
                    )}
                    {structured.scrimmage.rules && (
                      <p className="mt-1 text-xs text-zinc-400">{structured.scrimmage.rules}</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {structured.cooldown && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-purple-400">
                Cool Down
              </h3>
              {typeof structured.cooldown === 'object' && !Array.isArray(structured.cooldown) ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                  {structured.cooldown.duration_minutes && (
                    <span className="text-xs text-zinc-500">{structured.cooldown.duration_minutes} min</span>
                  )}
                  {structured.cooldown.notes && (
                    <p className="mt-1 text-xs text-zinc-400">{structured.cooldown.notes}</p>
                  )}
                </div>
              ) : Array.isArray(structured.cooldown) ? (
                <ul className="space-y-1.5">
                  {structured.cooldown.map((item: any, i: number) => (
                    <li key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                      <p className="text-sm text-zinc-200">
                        {typeof item === 'string' ? item : item.name || item.activity}
                      </p>
                      {item.description && (
                        <p className="mt-1 text-xs text-zinc-400">{item.description}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-300">{String(structured.cooldown)}</p>
              )}
            </div>
          )}

          {structured.notes && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Coach Notes
              </h3>
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">
                {typeof structured.notes === 'string'
                  ? structured.notes
                  : Array.isArray(structured.notes)
                  ? structured.notes.join('\n')
                  : JSON.stringify(structured.notes, null, 2)}
              </p>
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {structured.title && (
          <h2 className="text-lg font-semibold text-zinc-100">{structured.title}</h2>
        )}
        {Object.entries(structured).map(([key, value]) => {
          if (key === 'title') return null;
          return (
            <div key={key} className="space-y-1">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                {key.replace(/_/g, ' ')}
              </h3>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap">
                {typeof value === 'string'
                  ? value
                  : Array.isArray(value)
                  ? value.map((item, i) => (
                      <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 mb-2">
                        {typeof item === 'string' ? item : JSON.stringify(item, null, 2)}
                      </div>
                    ))
                  : JSON.stringify(value, null, 2)}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Plan detail view
  if (selectedPlan) {
    const typeConfig = PLAN_TYPE_CONFIG[selectedPlan.type] || PLAN_TYPE_CONFIG.custom;
    const TypeIcon = typeConfig.icon;

    return (
      <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setSelectedPlan(null)}>
              <X className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">{selectedPlan.title || 'Untitled Plan'}</h1>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  <TypeIcon className={`h-3 w-3 mr-1 ${typeConfig.color}`} />
                  {typeConfig.label}
                </Badge>
                <span className="text-xs text-zinc-500">
                  {formatDate(selectedPlan.created_at)}
                </span>
                {selectedPlan.curriculum_week && (
                  <Badge variant="outline" className="text-xs">
                    Week {selectedPlan.curriculum_week}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            onClick={() => {
              if (confirm('Delete this plan? This cannot be undone.')) {
                deleteMutation.mutate(selectedPlan.id);
              }
            }}
          >
            <Trash2 className="h-5 w-5" />
          </Button>
        </div>

        <Card>
          <CardContent className="p-6">
            {renderStructuredContent(selectedPlan)}
          </CardContent>
        </Card>

        {selectedPlan.skills_targeted && selectedPlan.skills_targeted.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Skills Targeted</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {selectedPlan.skills_targeted.map((skill) => (
                  <Badge key={skill} variant="secondary">
                    {skill}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Plans</h1>
        <p className="text-zinc-400 text-sm">Describe what you need and AI will generate it</p>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError(null)}
            className="ml-auto text-red-500 hover:text-red-300"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Generation input */}
      <Card className="border-zinc-700/50">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
              <Sparkles className="h-5 w-5 text-orange-400" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-zinc-200">Generate with AI</p>
              <p className="text-xs text-zinc-500">Describe what you need, or tap a suggestion below</p>
            </div>
          </div>

          {/* Text input */}
          <div className="flex items-end gap-2">
            <div className="flex-1 rounded-xl border border-zinc-700 bg-zinc-800 focus-within:border-orange-500/50 focus-within:ring-1 focus-within:ring-orange-500/20 transition-all">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what you need..."
                disabled={generating || !activeTeam}
                className="w-full bg-transparent px-4 py-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
              />
            </div>
            <Button
              onClick={() => generateFromPrompt(prompt)}
              disabled={!prompt.trim() || generating || !activeTeam}
              size="icon"
              className="h-11 w-11 shrink-0 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-30"
            >
              {generating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2">
            {SUGGESTION_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                disabled={generating}
                className="rounded-full border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 hover:border-zinc-600 transition-colors disabled:opacity-50 touch-manipulation"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Generating indicator */}
          {generating && (
            <div className="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
              <Loader2 className="h-5 w-5 text-orange-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-orange-300">Generating your plan...</p>
                <p className="text-xs text-zinc-500">AI is creating a customized plan based on your roster and curriculum</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans list */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
          Previous Plans
        </h2>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : plans?.length === 0 ? (
          <Card className="border-dashed border-zinc-700">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50 mb-5">
                <ClipboardList className="h-8 w-8 text-zinc-600" />
              </div>
              <h3 className="text-lg font-semibold text-zinc-300">No plans yet</h3>
              <p className="text-zinc-500 text-sm mt-2 max-w-xs text-center">
                Describe what you need above and AI will generate a plan tailored to your roster and curriculum.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {plans?.map((plan) => {
              const typeConfig = PLAN_TYPE_CONFIG[plan.type] || PLAN_TYPE_CONFIG.custom;
              const TypeIcon = typeConfig.icon;
              const isExpanded = expandedPlanId === plan.id;

              return (
                <div key={plan.id}>
                  <Card
                    className="cursor-pointer transition-colors hover:border-zinc-700"
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      <TypeIcon className={`h-5 w-5 shrink-0 ${typeConfig.color}`} />
                      <div
                        className="flex-1 min-w-0"
                        onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                      >
                        <p className="text-sm font-medium truncate">
                          {plan.title || typeConfig.label}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-zinc-500">
                            {formatDate(plan.created_at)}
                          </span>
                          {plan.curriculum_week && (
                            <span className="text-xs text-zinc-600">
                              Week {plan.curriculum_week}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Delete this plan?')) {
                              deleteMutation.mutate(plan.id);
                            }
                          }}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setSelectedPlan(plan)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Expanded preview */}
                  {isExpanded && (
                    <Card className="mt-1 border-zinc-800/50">
                      <CardContent className="p-4 max-h-64 overflow-y-auto">
                        <div className="text-sm text-zinc-300 whitespace-pre-wrap line-clamp-[12]">
                          {plan.content?.slice(0, 500) || 'No content preview available.'}
                          {(plan.content?.length || 0) > 500 && (
                            <button
                              onClick={() => setSelectedPlan(plan)}
                              className="mt-2 text-xs text-orange-500 hover:text-orange-400 font-medium"
                            >
                              View full plan
                            </button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
