'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  FileText,
  Sparkles,
  X,
  AlertCircle,
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

export default function PlansPage() {
  const { activeTeam } = useActiveTeam();
  const qc = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [generating, setGenerating] = useState<PlanType | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const generatePlan = async (type: 'practice' | 'gameday') => {
    if (!activeTeam) return;
    setGenerating(type);
    setError(null);
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, type }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate plan');
      }
      const data = await res.json();
      // Refresh plans list
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setSelectedPlan(data.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(null);
    }
  };

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  // Render structured plan content (warmup, drills, scrimmage, cooldown)
  function renderStructuredContent(plan: Plan) {
    const structured = plan.content_structured as any;
    if (!structured) {
      return (
        <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
          {plan.content}
        </div>
      );
    }

    // Practice plan structure
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
              {Array.isArray(structured.warmup) ? (
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
                        {drill.duration && (
                          <Badge variant="outline" className="text-xs">{drill.duration}</Badge>
                        )}
                      </div>
                      {drill.description && (
                        <p className="mt-1 text-xs text-zinc-400">{drill.description}</p>
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
                    {structured.scrimmage.duration && (
                      <span className="text-xs text-zinc-500">{structured.scrimmage.duration}</span>
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
              {Array.isArray(structured.cooldown) ? (
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

    // Gameday / other structured content — render sections generically
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
        <p className="text-zinc-400 text-sm">Generate and manage practice plans and game sheets</p>
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

      {/* Generate buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card
          className={`cursor-pointer transition-colors hover:border-blue-500/50 active:scale-[0.98] touch-manipulation ${
            generating ? 'pointer-events-none opacity-60' : ''
          }`}
          onClick={() => generatePlan('practice')}
        >
          <CardContent className="flex items-center gap-4 p-5 sm:p-4">
            <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-blue-500/20 shrink-0">
              {generating === 'practice' ? (
                <Loader2 className="h-7 w-7 sm:h-6 sm:w-6 text-blue-400 animate-spin" />
              ) : (
                <Dumbbell className="h-7 w-7 sm:h-6 sm:w-6 text-blue-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base sm:text-sm">Generate Practice Plan</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {generating === 'practice'
                  ? 'AI is generating your plan...'
                  : 'AI-powered plan based on curriculum and observations'}
              </p>
            </div>
            <Sparkles className="h-5 w-5 sm:h-4 sm:w-4 text-blue-500/50 shrink-0" />
          </CardContent>
        </Card>

        <Card
          className={`cursor-pointer transition-colors hover:border-emerald-500/50 active:scale-[0.98] touch-manipulation ${
            generating ? 'pointer-events-none opacity-60' : ''
          }`}
          onClick={() => generatePlan('gameday')}
        >
          <CardContent className="flex items-center gap-4 p-5 sm:p-4">
            <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-xl bg-emerald-500/20 shrink-0">
              {generating === 'gameday' ? (
                <Loader2 className="h-7 w-7 sm:h-6 sm:w-6 text-emerald-400 animate-spin" />
              ) : (
                <Trophy className="h-7 w-7 sm:h-6 sm:w-6 text-emerald-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base sm:text-sm">Generate Game Day Sheet</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {generating === 'gameday'
                  ? 'AI is generating your game sheet...'
                  : 'Lineup, rotations, and focus areas for game day'}
              </p>
            </div>
            <Sparkles className="h-5 w-5 sm:h-4 sm:w-4 text-emerald-500/50 shrink-0" />
          </CardContent>
        </Card>
      </div>

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
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <ClipboardList className="h-12 w-12 text-zinc-600 mb-4" />
              <p className="text-zinc-400 text-sm">No plans generated yet</p>
              <p className="text-zinc-500 text-xs mt-1">
                Use the buttons above to generate your first plan
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {plans?.map((plan) => {
              const typeConfig = PLAN_TYPE_CONFIG[plan.type] || PLAN_TYPE_CONFIG.custom;
              const TypeIcon = typeConfig.icon;

              return (
                <Card
                  key={plan.id}
                  className="cursor-pointer transition-colors hover:border-zinc-700"
                  onClick={() => setSelectedPlan(plan)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    <TypeIcon className={`h-5 w-5 shrink-0 ${typeConfig.color}`} />
                    <div className="flex-1 min-w-0">
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
                    <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
