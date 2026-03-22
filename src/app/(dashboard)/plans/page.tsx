'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [generating, setGenerating] = useState<PlanType | null>(null);

  const { data: plans, isLoading } = useQuery({
    queryKey: queryKeys.plans.all(activeTeam?.id || ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .eq('team_id', activeTeam.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Plan[];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.plans,
  });

  async function handleGenerate(type: PlanType) {
    if (!activeTeam) return;
    setGenerating(type);

    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('plans')
        .insert({
          team_id: activeTeam.id,
          coach_id: user.id,
          type,
          title: `${PLAN_TYPE_CONFIG[type]?.label || type} - ${new Date().toLocaleDateString()}`,
          content: `Generating ${type} plan... This will be populated by the AI pipeline.`,
          curriculum_week: activeTeam.current_week,
        })
        .select()
        .single();

      if (error) throw error;

      queryClient.invalidateQueries({
        queryKey: queryKeys.plans.all(activeTeam.id),
      });

      if (data) setSelectedPlan(data as Plan);
    } catch (err) {
      console.error('Failed to generate plan:', err);
    } finally {
      setGenerating(null);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
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
            <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
              {selectedPlan.content}
            </div>
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

      {/* Generate buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Card
          className="cursor-pointer transition-colors hover:border-blue-500/50"
          onClick={() => handleGenerate('practice')}
        >
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 shrink-0">
              {generating === 'practice' ? (
                <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
              ) : (
                <Dumbbell className="h-6 w-6 text-blue-400" />
              )}
            </div>
            <div>
              <p className="font-medium">Generate Practice Plan</p>
              <p className="text-xs text-zinc-500">
                AI-powered plan based on curriculum and observations
              </p>
            </div>
            <Sparkles className="h-4 w-4 text-zinc-600 ml-auto shrink-0" />
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer transition-colors hover:border-emerald-500/50"
          onClick={() => handleGenerate('gameday')}
        >
          <CardContent className="flex items-center gap-4 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 shrink-0">
              {generating === 'gameday' ? (
                <Loader2 className="h-6 w-6 text-emerald-400 animate-spin" />
              ) : (
                <Trophy className="h-6 w-6 text-emerald-400" />
              )}
            </div>
            <div>
              <p className="font-medium">Generate Game Day Sheet</p>
              <p className="text-xs text-zinc-500">
                Lineup, rotations, and focus areas for game day
              </p>
            </div>
            <Sparkles className="h-4 w-4 text-zinc-600 ml-auto shrink-0" />
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
