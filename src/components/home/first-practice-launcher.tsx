'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import {
  rankTemplates,
  getTemplatesForSport,
  getTotalMinutes,
  getDrillCount,
} from '@/lib/practice-templates';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Clock, ChevronRight, Sparkles, Timer, X } from 'lucide-react';

const LAUNCHER_DISMISSED_KEY = 'sportsiq-first-practice-dismissed';

interface Props {
  teamId: string;
  coachId: string;
  sportId: string;
  ageGroup: string;
}

export function FirstPracticeLauncher({ teamId, coachId, sportId, ageGroup }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(LAUNCHER_DISMISSED_KEY);
  });

  const templates = rankTemplates(
    getTemplatesForSport(sportId),
    sportId,
    ageGroup
  ).slice(0, 3);

  if (dismissed || templates.length === 0) return null;

  const handleDismiss = () => {
    localStorage.setItem(LAUNCHER_DISMISSED_KEY, 'true');
    setDismissed(true);
  };

  const handleStartPractice = async (templateId: string) => {
    setStarting(templateId);
    try {
      const data = await mutate<any[]>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: teamId,
          coach_id: coachId,
          type: 'practice',
          date: new Date().toISOString().split('T')[0],
          notes: 'First practice',
        },
        select: '*',
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(teamId) });
      // Dismiss so it doesn't reappear when they navigate back
      localStorage.setItem(LAUNCHER_DISMISSED_KEY, 'true');
      router.push(`/sessions/${data[0].id}/timer?templateId=${templateId}`);
    } catch {
      setStarting(null);
    }
  };

  return (
    <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/5 to-zinc-900 overflow-hidden">
      <CardContent className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20 shrink-0">
              <Sparkles className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-100">Ready for your first practice?</h3>
              <p className="text-xs text-zinc-400 mt-0.5">
                Pick a ready-made plan and start immediately — no setup needed.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 rounded-full text-zinc-600 hover:text-zinc-400 transition-colors shrink-0 ml-2"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Template cards */}
        <div className="space-y-2">
          {templates.map((template) => {
            const isLoading = starting === template.id;
            const mins = getTotalMinutes(template);
            const drills = getDrillCount(template);
            return (
              <button
                key={template.id}
                onClick={() => handleStartPractice(template.id)}
                disabled={starting !== null}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 p-3.5 text-left transition-all hover:border-orange-500/50 hover:bg-zinc-800 active:scale-[0.99] touch-manipulation disabled:opacity-60"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/15 shrink-0">
                    {isLoading ? (
                      <Timer className="h-5 w-5 text-orange-500 animate-pulse" />
                    ) : (
                      <Play className="h-5 w-5 text-orange-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-zinc-100">{template.name}</span>
                      <Badge variant="outline" className="text-[10px] border-zinc-600 text-zinc-400 px-1.5 py-0">
                        {template.ageLabel}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-zinc-500 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {mins} min
                      </span>
                      <span className="text-xs text-zinc-500">
                        {drills} drill{drills !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-500 shrink-0" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="text-[11px] text-zinc-600 mt-3 text-center">
          You can customize the drills once it starts
        </p>
      </CardContent>
    </Card>
  );
}
