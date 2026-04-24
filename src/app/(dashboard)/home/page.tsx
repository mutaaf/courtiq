'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic,
  Users,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  Calendar,
  CalendarClock,
  Plus,
  Sparkles,
  ArrowRight,
  Minus,
  Zap,
  AlertTriangle,
  Target,
  Lightbulb,
  Star,
  ChevronRight,
  Trophy,
  Award,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Play,
  Square,
  Bell,
  Flame,
  Timer,
  Dumbbell,
  Cake,
  Send,
  Copy,
  X,
} from 'lucide-react';
import type { Session, Drill } from '@/types/database';
import { useAppStore } from '@/lib/store';
import { PostPracticeDebrief } from '@/components/capture/post-practice-debrief';
import { formatTimeAgo } from '@/lib/team-wins-utils';
import {
  buildStreakData,
  getStreakMessage,
  getNextMilestone,
  getDaysToNextMilestone,
  isNewRecord,
  streakPercentToNextMilestone,
  getEarnedMilestones,
  getDayKey,
} from '@/lib/streak-utils';
import type { StreakData } from '@/lib/streak-utils';
import type { TeamWin } from '@/lib/team-wins-utils';
import { isCurrentWeekStar } from '@/lib/player-spotlight-utils';
import {
  buildSkillTrends,
  getTopImprovingSkills,
  getTopDecliningSkills,
  formatSkillLabel,
  formatTrendDelta,
  getTrendColor,
  getTrendBgColor,
  hasEnoughDataForTrends,
} from '@/lib/skill-trend-utils';
import type { SkillTrend } from '@/lib/skill-trend-utils';
import {
  buildDailyFocusSuggestion,
  capitaliseCategory,
} from '@/lib/daily-focus-utils';
import type { DailyFocusSuggestion } from '@/lib/daily-focus-utils';
import {
  selectDrillOfDay,
  buildDrillDismissKey,
  buildDrillViewUrl,
  getDrillCategoryLabel,
  getDrillDurationLabel,
  getDrillCues,
  getDrillPlayerCountLabel,
} from '@/lib/drill-of-day-utils';
import type { WeeklyStar } from '@/lib/ai/schemas';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { TestimonialPrompt } from '@/components/onboarding/testimonial-prompt';
import { FreemiumNudge } from '@/components/ui/freemium-nudge';
import { SeasonalPromo } from '@/components/onboarding/seasonal-promo';
import { FirstPracticeLauncher } from '@/components/home/first-practice-launcher';
import { GettingStartedCard } from '@/components/home/getting-started-card';
import {
  filterBirthdaysToday,
  filterUpcomingBirthdays,
  sortByUpcomingBirthday,
  formatBirthdayLabel,
  getAgeThisBirthday,
  buildBirthdayMessage,
  buildBirthdayWhatsAppUrl,
  getBirthdayDismissKey,
  hasUpcomingBirthdays,
  type BirthdayPlayer,
} from '@/lib/birthday-utils';

// ─── AI Coaching Tips ─────────────────────────────────────────────────────────

interface CoachingTip {
  type: 'alert' | 'suggestion' | 'praise';
  message: string;
  action_label?: string;
  action_href?: string;
}

const TIP_CONFIG: Record<
  CoachingTip['type'],
  { icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }
> = {
  alert: {
    icon: AlertTriangle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-l-red-500',
  },
  suggestion: {
    icon: Lightbulb,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-l-blue-500',
  },
  praise: {
    icon: Star,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-l-amber-500',
  },
};

function CoachingTipsCard({ teamId }: { teamId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['coaching-tips', teamId],
    queryFn: async (): Promise<CoachingTip[]> => {
      const res = await fetch('/api/ai/coaching-tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      if (!res.ok) throw new Error('Failed to load tips');
      const json = await res.json();
      return json.tips || [];
    },
    staleTime: 4 * 60 * 60 * 1000, // 4 hours — regenerate once per session block
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-zinc-800">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-28 rounded" />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-3">
          <Skeleton className="h-14 rounded-xl" />
          <Skeleton className="h-14 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <Card className="overflow-hidden border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500/15">
            <Sparkles className="h-4 w-4 text-orange-400" />
          </div>
          AI Coach Tips
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-2.5">
        {data.map((tip, i) => {
          const cfg = TIP_CONFIG[tip.type] ?? TIP_CONFIG.suggestion;
          const Icon = cfg.icon;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-xl border border-l-4 border-zinc-800 ${cfg.border} p-3.5`}
            >
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${cfg.bg}`}>
                <Icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-zinc-200 leading-snug">{tip.message}</p>
                {tip.action_label && tip.action_href && (
                  <Link
                    href={tip.action_href}
                    className={`mt-1.5 inline-flex items-center gap-0.5 text-xs font-medium ${cfg.color} hover:underline`}
                  >
                    {tip.action_label}
                    <ChevronRight className="h-3 w-3" />
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ─── Weekly Star ─────────────────────────────────────────────────────────────

interface WeeklyStarPlan {
  id: string;
  type: string;
  title: string;
  content_structured: WeeklyStar | null;
  created_at: string;
}

function WeeklyStarCard({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ['plans-weekly-star', teamId],
    queryFn: async (): Promise<WeeklyStarPlan[]> => {
      const res = await fetch(
        `/api/data?table=plans&select=id,type,title,content_structured,created_at&filters=${encodeURIComponent(JSON.stringify({ team_id: teamId, type: 'weekly_star' }))}&order=${encodeURIComponent(JSON.stringify({ column: 'created_at', ascending: false }))}&limit=1`
      );
      if (!res.ok) return [];
      const json = await res.json();
      return json.data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const currentStar: WeeklyStarPlan | null =
    plans?.find((p) => isCurrentWeekStar(p.created_at)) ?? null;

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/weekly-star', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate');
      qc.invalidateQueries({ queryKey: ['plans-weekly-star', teamId] });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function share(star: WeeklyStar) {
    const text = [
      `⭐ SportsIQ Weekly Star — Week of ${star.week_label}`,
      '',
      `${star.player_name}: ${star.headline}`,
      '',
      star.achievement,
      '',
      `"${star.coach_shoutout}"`,
    ].join('\n');

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: `Weekly Star — ${star.player_name}`, text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Don't show the card at all until plans data loads and we know the star status
  if (plans === undefined) return null;

  if (currentStar?.content_structured) {
    const star = currentStar.content_structured;
    return (
      <Card className="overflow-hidden border-amber-500/25">
        <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent px-5 pt-4 pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
                <Star className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-100">Weekly Star</h3>
                <p className="text-xs text-zinc-500">Week of {star.week_label}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-zinc-400 hover:text-zinc-200"
              onClick={() => share(star)}
              aria-label={`Share ${star.player_name}'s weekly star spotlight`}
            >
              {copied ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {copied ? 'Copied!' : 'Share'}
            </Button>
          </div>
        </div>
        <CardContent className="px-5 pb-5 pt-3 space-y-3">
          <div>
            <p className="text-base font-bold text-amber-300">{star.player_name}</p>
            <p className="text-sm text-zinc-300 leading-relaxed mt-0.5">{star.headline}</p>
          </div>
          <p className="text-sm text-zinc-400 leading-relaxed">{star.achievement}</p>
          {star.coach_shoutout && (
            <div className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3.5 py-2.5">
              <p className="text-xs text-amber-300/80 italic">&ldquo;{star.coach_shoutout}&rdquo;</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // No star for this week yet — show generate prompt
  return (
    <Card className="overflow-hidden border-dashed border-amber-500/30">
      <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/15">
          <Star className="h-6 w-6 text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-200">Weekly Star</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            AI picks this week&apos;s standout player based on observations
          </p>
        </div>
        {error && (
          <p className="text-xs text-red-400 rounded-lg bg-red-500/10 px-3 py-2 max-w-xs">{error}</p>
        )}
        <Button
          size="sm"
          variant="outline"
          className="border-amber-500/40 text-amber-300 hover:bg-amber-500/10 gap-2 touch-manipulation"
          onClick={generate}
          disabled={generating}
          aria-label="Generate weekly star spotlight"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generating ? 'Picking this week\'s star…' : 'Pick Weekly Star'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Team Wins Feed ───────────────────────────────────────────────────────────

function TeamWinsCard({ teamId }: { teamId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['team-wins', teamId],
    queryFn: async (): Promise<TeamWin[]> => {
      const res = await fetch(`/api/team-wins?team_id=${encodeURIComponent(teamId)}&days=14`);
      if (!res.ok) throw new Error('Failed to load wins');
      const json = await res.json();
      return json.wins ?? [];
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-zinc-800">
        <CardHeader className="pb-3 pt-4 px-5">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-4 w-24 rounded" />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 space-y-2.5">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) return null;

  return (
    <Card className="overflow-hidden border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15">
            <Trophy className="h-4 w-4 text-amber-400" />
          </div>
          Team Wins
          <span className="ml-auto text-xs font-normal text-zinc-500">last 14 days</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-2">
        {data.slice(0, 8).map((win, i) => {
          const isBadge = win.type === 'badge';
          const date = isBadge ? (win as any).earned_at : (win as any).achieved_at;
          return (
            <Link
              key={i}
              href={`/roster/${win.player_id}`}
              className="group flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 transition-all hover:border-zinc-700 hover:bg-zinc-800/60 active:scale-[0.98] touch-manipulation"
            >
              {/* Icon */}
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                  isBadge ? 'bg-amber-500/15' : 'bg-emerald-500/15'
                }`}
              >
                {isBadge ? (
                  <Award className="h-4 w-4 text-amber-400" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                )}
              </div>

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200 truncate">
                  {win.player_jersey != null && (
                    <span className="mr-1 text-zinc-500 text-xs">#{win.player_jersey}</span>
                  )}
                  {win.player_name.split(' ')[0]}
                  {' '}
                  <span className={isBadge ? 'text-amber-400' : 'text-emerald-400'}>
                    {isBadge ? `earned ${(win as any).badge_name}` : 'achieved goal'}
                  </span>
                </p>
                <p className="text-xs text-zinc-500 truncate">
                  {isBadge ? (win as any).badge_description : (win as any).goal_text}
                </p>
              </div>

              {/* Time */}
              <span className="shrink-0 text-[10px] text-zinc-600">{formatTimeAgo(date)}</span>
            </Link>
          );
        })}
        {data.length > 8 && (
          <p className="text-center text-xs text-zinc-600 pt-1">
            +{data.length - 8} more this fortnight
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Skill Trends ─────────────────────────────────────────────────────────────

function SkillTrendsCard({
  improving,
  declining,
}: {
  improving: SkillTrend[];
  declining: SkillTrend[];
}) {
  const hasImproving = improving.length > 0;
  const hasDeclining = declining.length > 0;

  if (!hasImproving && !hasDeclining) return null;

  return (
    <Card className="overflow-hidden border-zinc-800">
      <CardHeader className="pb-2 pt-4 px-5">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/15">
            <TrendingUp className="h-4 w-4 text-violet-400" />
          </div>
          Team Skill Trends
          <span className="ml-auto text-[10px] font-normal text-zinc-500">this week vs last week</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-4 space-y-3">
        {hasImproving && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-500 mb-1.5">
              Trending Up
            </p>
            <div className="space-y-1.5">
              {improving.map((t) => (
                <div
                  key={t.category}
                  className="flex items-center gap-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2"
                >
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  <span className="flex-1 text-sm text-zinc-200">{formatSkillLabel(t.category)}</span>
                  <span className={`text-xs font-semibold tabular-nums ${getTrendColor(t.direction)}`}>
                    {formatTrendDelta(t.delta)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getTrendBgColor(t.direction)} ${getTrendColor(t.direction)}`}
                  >
                    {t.recentCount} obs
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasDeclining && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-red-500 mb-1.5">
              Needs Attention
            </p>
            <div className="space-y-1.5">
              {declining.map((t) => (
                <Link key={t.category} href="/plans">
                  <div
                    className="flex items-center gap-2.5 rounded-lg border border-red-500/15 bg-red-500/5 px-3 py-2 transition-colors hover:border-red-500/30 hover:bg-red-500/10 active:scale-[0.98] touch-manipulation"
                  >
                    <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-400" />
                    <span className="flex-1 text-sm text-zinc-200">{formatSkillLabel(t.category)}</span>
                    <span className={`text-xs font-semibold tabular-nums ${getTrendColor(t.direction)}`}>
                      {formatTrendDelta(t.delta)}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${getTrendBgColor(t.direction)} ${getTrendColor(t.direction)}`}
                    >
                      {t.recentCount} obs
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <p className="text-[10px] text-zinc-600 text-right">
          Tap a declining skill to build a practice plan
        </p>
      </CardContent>
    </Card>
  );
}

// ─── Daily Focus Card ─────────────────────────────────────────────────────────

function DailyFocusCard({
  suggestion,
  teamId,
}: {
  suggestion: DailyFocusSuggestion;
  teamId: string;
}) {
  const todayStr = new Date().toISOString().split('T')[0];
  const dismissKey = `daily-focus-dismissed-${teamId}-${todayStr}`;

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(dismissKey) === '1';
  });

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(dismissKey, '1');
    setDismissed(true);
  }

  const firstName = suggestion.playerName.split(' ')[0];
  const skillLabel = suggestion.skillToFocus
    ? capitaliseCategory(suggestion.skillToFocus)
    : null;

  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20">
            <Target className="h-4 w-4 text-indigo-400" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Today&apos;s Focus
            </p>
            <p className="text-sm font-bold text-zinc-100 leading-snug">
              Give{' '}
              <span className="text-indigo-300">{firstName}</span>{' '}
              some feedback
              {skillLabel && (
                <> on <span className="text-indigo-300">{skillLabel}</span></>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={dismiss}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors touch-manipulation"
          aria-label="Dismiss today's focus"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      </div>

      <p className="text-xs text-zinc-400 leading-snug pl-10">
        {suggestion.reason}
      </p>

      <div className="pl-10">
        <Link href={suggestion.captureHref}>
          <Button
            size="sm"
            className="gap-1.5 touch-manipulation active:scale-[0.97]"
            aria-label={`Capture observation for ${firstName}`}
          >
            <Mic className="h-3.5 w-3.5" />
            Capture Observation
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Drill of the Day ─────────────────────────────────────────────────────────

function DrillOfDayCard({
  drill,
  category,
  teamId,
}: {
  drill: Drill;
  category: string;
  teamId: string;
}) {
  const dateKey = new Date().toISOString().split('T')[0];
  const dismissKey = buildDrillDismissKey(teamId, dateKey);

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(dismissKey) === '1';
  });

  if (dismissed) return null;

  const cues = getDrillCues(drill, 1);
  const duration = getDrillDurationLabel(drill.duration_minutes);
  const categoryLabel = getDrillCategoryLabel(category);
  const viewUrl = buildDrillViewUrl(category);

  return (
    <div className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
            <Dumbbell className="h-4 w-4 text-orange-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
                Drill of the Day
              </p>
              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-300">
                {categoryLabel}
              </span>
            </div>
            <p className="text-sm font-bold text-zinc-100 leading-snug mt-0.5 truncate">
              {drill.name}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            localStorage.setItem(dismissKey, '1');
            setDismissed(true);
          }}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors touch-manipulation"
          aria-label="Dismiss drill of the day"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      </div>

      {drill.description && (
        <p className="text-xs text-zinc-400 leading-relaxed pl-10 line-clamp-2">
          {drill.description}
        </p>
      )}

      {cues.length > 0 && (
        <div className="pl-10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
            Key coaching cue
          </p>
          <p className="text-xs text-zinc-300 italic">&ldquo;{cues[0]}&rdquo;</p>
        </div>
      )}

      <div className="flex items-center justify-between pl-10">
        <div className="flex items-center gap-3">
          {duration && (
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Timer className="h-3 w-3" />
              {duration}
            </span>
          )}
          {drill.player_count_min > 0 && (
            <span className="text-xs text-zinc-500">
              {getDrillPlayerCountLabel(drill.player_count_min, drill.player_count_max)}
            </span>
          )}
        </div>
        <Link href={viewUrl}>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 border-orange-500/30 text-orange-300 hover:bg-orange-500/10 text-xs touch-manipulation"
            aria-label={`View all ${categoryLabel} drills`}
          >
            <ArrowRight className="h-3 w-3" />
            See Drills
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Team Pulse ────────────────────────────────────────────────────────────────

interface PulseStats {
  obs14dCount: number;
  obs7dCount: number;
  thisWeekHealth: number | null;
  lastWeekHealth: number | null;
  healthTrend: 'up' | 'down' | 'stable';
  players: Array<{ id: string; name: string; jersey_number: number | null }>;
  unobservedPlayers: Array<{ id: string; name: string; jersey_number: number | null }>;
  totalPlayers: number;
  topFocusArea: { category: string; count: number } | null;
  skillTrends: { improving: SkillTrend[]; declining: SkillTrend[] } | null;
  dailyFocus: DailyFocusSuggestion | null;
}

function TeamPulseCard({ pulse }: { pulse: PulseStats }) {
  const TrendIcon =
    pulse.healthTrend === 'up'
      ? TrendingUp
      : pulse.healthTrend === 'down'
      ? TrendingDown
      : Minus;

  const trendColor =
    pulse.healthTrend === 'up'
      ? 'text-emerald-400'
      : pulse.healthTrend === 'down'
      ? 'text-red-400'
      : 'text-zinc-400';

  const trendBg =
    pulse.healthTrend === 'up'
      ? 'bg-emerald-500/10'
      : pulse.healthTrend === 'down'
      ? 'bg-red-500/10'
      : 'bg-zinc-800';

  const healthPct = pulse.thisWeekHealth ?? 0;
  const healthColor =
    healthPct >= 70 ? '#10b981' : healthPct >= 50 ? '#F97316' : '#ef4444';

  const observedPct = pulse.totalPlayers > 0
    ? Math.round(((pulse.totalPlayers - pulse.unobservedPlayers.length) / pulse.totalPlayers) * 100)
    : 0;

  // Large SVG progress ring
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - healthPct / 100);

  return (
    <Card className="overflow-hidden border-orange-500/20">
      {/* Header with gradient accent */}
      <div className="relative bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent px-5 pt-5 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20">
              <Zap className="h-4.5 w-4.5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-zinc-100">Team Pulse</h3>
              <p className="text-xs text-zinc-500">Last 14 days</p>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${trendBg} ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {pulse.healthTrend === 'stable' ? 'Stable' : pulse.healthTrend === 'up' ? 'Improving' : 'Declining'}
          </div>
        </div>
      </div>

      <CardContent className="space-y-5 px-5 pb-5 pt-2">
        {/* Main stats row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Health ring */}
          <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: 88, height: 88 }}>
              <svg width={88} height={88} className="-rotate-90">
                <circle cx={44} cy={44} r={r} fill="none" stroke="#27272a" strokeWidth={6} />
                <circle
                  cx={44} cy={44} r={r}
                  fill="none"
                  stroke={healthColor}
                  strokeWidth={6}
                  strokeDasharray={circ}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-zinc-100">{healthPct}%</span>
                <span className="text-[9px] text-zinc-500 uppercase tracking-wider">Health</span>
              </div>
            </div>
            {pulse.lastWeekHealth !== null && (
              <p className="text-[10px] text-zinc-500">vs {pulse.lastWeekHealth}% last week</p>
            )}
          </div>

          {/* Observations stat */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-800/50 p-3">
            <span className="text-2xl font-bold text-zinc-100">{pulse.obs7dCount}</span>
            <span className="text-[10px] text-zinc-500 text-center mt-0.5">this week</span>
            <span className="text-[10px] text-zinc-600 mt-1">{pulse.obs14dCount} in 14 days</span>
          </div>

          {/* Coverage stat */}
          <div className="flex flex-col items-center justify-center rounded-xl bg-zinc-800/50 p-3">
            <span className="text-2xl font-bold" style={{ color: observedPct >= 80 ? '#10b981' : observedPct >= 50 ? '#F97316' : '#ef4444' }}>
              {observedPct}%
            </span>
            <span className="text-[10px] text-zinc-500 text-center mt-0.5">coverage</span>
            <span className="text-[10px] text-zinc-600 mt-1">
              {pulse.totalPlayers - pulse.unobservedPlayers.length}/{pulse.totalPlayers} players
            </span>
          </div>
        </div>

        {/* Unobserved players */}
        {pulse.unobservedPlayers.length > 0 && (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
            <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-amber-400">
              <AlertTriangle className="h-4 w-4" />
              Needs attention — {pulse.unobservedPlayers.length} player{pulse.unobservedPlayers.length !== 1 ? 's' : ''} not observed
            </p>
            <div className="flex flex-wrap gap-2">
              {pulse.unobservedPlayers.slice(0, 8).map((p) => (
                <Link key={p.id} href={`/roster/${p.id}`}>
                  <span className="touch-manipulation inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition-all hover:bg-amber-500/20 hover:scale-105 active:scale-95">
                    {p.jersey_number != null && (
                      <span className="text-amber-500/70">#{p.jersey_number}</span>
                    )}
                    {p.name.split(' ')[0]}
                  </span>
                </Link>
              ))}
              {pulse.unobservedPlayers.length > 8 && (
                <span className="inline-flex items-center rounded-full bg-zinc-800 px-3 py-1.5 text-xs text-zinc-500">
                  +{pulse.unobservedPlayers.length - 8} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Top focus area — action card */}
        {pulse.topFocusArea && (
          <Link href="/plans" className="block">
            <div className="group flex items-center justify-between gap-3 rounded-xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-transparent p-4 transition-all hover:border-orange-500/40 hover:from-orange-500/15 active:scale-[0.98]">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/20">
                  <Target className="h-5 w-5 text-orange-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-200">
                    Top focus:{' '}
                    <span className="capitalize text-orange-400">{pulse.topFocusArea.category}</span>
                  </p>
                  <p className="text-xs text-zinc-500">
                    {pulse.topFocusArea.count} needs-work observation{pulse.topFocusArea.count !== 1 ? 's' : ''} — tap to plan
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-orange-500/50 transition-transform group-hover:translate-x-1 group-hover:text-orange-400" />
            </div>
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Parent Messages Card ─────────────────────────────────────────────────────

interface ParentReactionItem {
  id: string;
  reaction: string;
  message: string | null;
  parent_name: string | null;
  is_read: boolean;
  created_at: string;
  players: { name: string; nickname: string | null } | null;
}

function ParentMessagesCard({ teamId }: { teamId: string }) {
  const qc = useQueryClient();
  const [markingRead, setMarkingRead] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['parent-reactions', teamId],
    queryFn: async (): Promise<ParentReactionItem[]> => {
      const res = await fetch(`/api/parent-reactions?team_id=${teamId}`);
      if (!res.ok) return [];
      const json = await res.json();
      return json.reactions ?? [];
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading || !data || data.length === 0) return null;

  const unreadCount = data.filter((r) => !r.is_read).length;
  const recent = data.slice(0, 3);

  async function markAllRead() {
    setMarkingRead(true);
    try {
      await fetch(`/api/parent-reactions?team_id=${teamId}`, { method: 'PATCH' });
      qc.setQueryData(['parent-reactions', teamId], (prev: ParentReactionItem[] | undefined) =>
        (prev ?? []).map((r) => ({ ...r, is_read: true }))
      );
    } finally {
      setMarkingRead(false);
    }
  }

  function displayName(r: ParentReactionItem): string {
    if (r.parent_name?.trim()) return r.parent_name.trim();
    return 'A parent';
  }

  function playerName(r: ParentReactionItem): string {
    return r.players?.nickname || r.players?.name || 'your player';
  }

  function timeAgo(ts: string): string {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  return (
    <Card className="overflow-hidden border-pink-500/25">
      <div className="bg-gradient-to-r from-pink-500/10 via-rose-500/5 to-transparent px-5 pt-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-500/20">
              <span className="text-sm" aria-hidden="true">💌</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-zinc-100">Parent Messages</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-pink-500/20 text-pink-300 text-[10px] px-1.5 py-0 h-4 border-0">
                    {unreadCount} new
                  </Badge>
                )}
              </div>
              <p className="text-xs text-zinc-500">Parents are cheering you on</p>
            </div>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-zinc-400 hover:text-zinc-200 px-2"
              onClick={markAllRead}
              disabled={markingRead}
              aria-label="Mark all parent reactions as read"
            >
              {markingRead ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark read'}
            </Button>
          )}
        </div>
      </div>
      <CardContent className="px-5 pb-5 pt-3 space-y-3">
        {recent.map((r) => (
          <div
            key={r.id}
            className={`flex items-start gap-3 rounded-xl p-3 transition-colors ${
              !r.is_read ? 'bg-pink-500/8 border border-pink-500/20' : 'bg-zinc-900/50'
            }`}
          >
            <span className="text-xl shrink-0 mt-0.5" aria-hidden="true">{r.reaction}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-zinc-300">
                {displayName(r)}{' '}
                <span className="font-normal text-zinc-500">
                  about <span className="text-zinc-400">{playerName(r)}</span>
                </span>
              </p>
              {r.message && (
                <p className="mt-0.5 text-sm text-zinc-200 leading-snug">&ldquo;{r.message}&rdquo;</p>
              )}
              <p className="mt-1 text-[11px] text-zinc-600">{timeAgo(r.created_at)}</p>
            </div>
            {!r.is_read && (
              <div className="h-2 w-2 rounded-full bg-pink-500 shrink-0 mt-1.5" aria-hidden="true" />
            )}
          </div>
        ))}
        {data.length > 3 && (
          <p className="text-xs text-zinc-600 text-center">
            +{data.length - 3} more reaction{data.length - 3 !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Streak Card ──────────────────────────────────────────────────────────────

// ─── Birthday Card ────────────────────────────────────────────────────────────

function BirthdayCard({ teamId, teamName }: { teamId: string; teamName: string }) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return !!localStorage.getItem(getBirthdayDismissKey(teamId));
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: players = [] } = useQuery({
    queryKey: ['birthday-players', teamId],
    queryFn: async (): Promise<BirthdayPlayer[]> => {
      const result = await query<BirthdayPlayer[]>({
        table: 'players',
        select: 'id, name, date_of_birth, parent_name, parent_phone',
        filters: { team_id: teamId, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return result ?? [];
    },
    staleTime: 60 * 60 * 1000,
  });

  const today = new Date();
  const todayBirthdays = filterBirthdaysToday(players, today);
  const upcomingBirthdays = filterUpcomingBirthdays(players, 6, today);
  const allUpcoming = sortByUpcomingBirthday([...todayBirthdays, ...upcomingBirthdays], today);

  if (!hasUpcomingBirthdays(players, 6, today) || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(getBirthdayDismissKey(teamId), '1');
    setDismissed(true);
  };

  const handleShare = async (player: BirthdayPlayer) => {
    const age = player.date_of_birth ? getAgeThisBirthday(player.date_of_birth, today) : null;
    const message = buildBirthdayMessage(player.name, age, teamName);
    const waUrl = buildBirthdayWhatsAppUrl(player, teamName, today);

    if (navigator.share) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {}
    }

    if (waUrl && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
      window.open(waUrl, '_blank');
    } else {
      await navigator.clipboard.writeText(message).catch(() => {});
      setCopiedId(player.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5 overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20">
              <Cake className="h-4 w-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                {todayBirthdays.length > 0 ? '🎂 Birthday Today!' : 'Upcoming Birthdays'}
              </p>
              <p className="text-xs text-zinc-500">
                {todayBirthdays.length > 0
                  ? 'Send a birthday message to the family'
                  : 'Next 6 days'}
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            className="rounded-full p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
            aria-label="Dismiss birthday card"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5">
          {allUpcoming.map((player) => {
            const isToday = todayBirthdays.some((p) => p.id === player.id);
            const label = player.date_of_birth ? formatBirthdayLabel(player.date_of_birth, today) : '';
            const age = player.date_of_birth ? getAgeThisBirthday(player.date_of_birth, today) : null;
            const isCopied = copiedId === player.id;

            return (
              <div
                key={player.id}
                className={`flex items-center justify-between gap-3 rounded-xl p-3 ${
                  isToday ? 'bg-amber-500/15 border border-amber-500/20' : 'bg-zinc-900/50'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-sm font-bold text-amber-400">
                    {player.name[0]}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{player.name}</p>
                    <p className="text-xs text-zinc-500">
                      {isToday && age !== null ? `Turns ${age} today` : label}
                      {isToday && age === null ? 'Birthday today!' : ''}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleShare(player)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition-colors active:scale-95 touch-manipulation"
                  aria-label={`Send birthday message for ${player.name}`}
                >
                  {isCopied ? (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" />
                      {player.parent_phone ? 'Send' : 'Copy'}
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {todayBirthdays.length === 0 && (
          <p className="mt-2 text-xs text-zinc-600 text-center">
            Tip: Add birthdates in player profiles to get reminders
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function StreakCard({ teamId }: { teamId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['coaching-streak', teamId],
    queryFn: async (): Promise<StreakData> => {
      const res = await fetch(`/api/streak?team_id=${teamId}`);
      if (!res.ok) throw new Error('Failed to load streak');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-zinc-800">
        <CardContent className="p-4 flex items-center gap-4">
          <Skeleton className="h-14 w-14 rounded-2xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-3 w-40 rounded" />
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { currentStreak, longestStreak, todayHasActivity, atRisk } = data;
  const newRecord = isNewRecord(currentStreak, longestStreak);
  const nextMilestone = getNextMilestone(currentStreak);
  const daysToNext = getDaysToNextMilestone(currentStreak);
  const pct = streakPercentToNextMilestone(currentStreak);
  const earnedMilestones = getEarnedMilestones(currentStreak);
  const latestMilestone = earnedMilestones[earnedMilestones.length - 1];
  const message = getStreakMessage(currentStreak, atRisk);

  const flameColor = atRisk
    ? 'text-amber-500'
    : todayHasActivity
      ? 'text-orange-500'
      : currentStreak > 0
        ? 'text-orange-400'
        : 'text-zinc-600';

  const bgColor = atRisk
    ? 'bg-amber-500/15'
    : todayHasActivity
      ? 'bg-orange-500/15'
      : 'bg-zinc-800';

  const borderColor = atRisk
    ? 'border-amber-500/30'
    : todayHasActivity && currentStreak > 0
      ? 'border-orange-500/20'
      : 'border-zinc-800';

  return (
    <Card className={`overflow-hidden ${borderColor}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Flame + count */}
          <div className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl ${bgColor}`}>
            <Flame className={`h-6 w-6 ${flameColor}`} />
            <span className={`text-sm font-bold leading-none mt-0.5 ${flameColor}`}>
              {currentStreak}
            </span>
          </div>

          {/* Text + progress */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-zinc-200 leading-snug">
                {currentStreak === 0 ? 'Start Your Streak' : `${currentStreak}-Day Streak`}
              </p>
              {newRecord && currentStreak >= 3 && (
                <span className="rounded-full bg-orange-500/20 px-2 py-0.5 text-[10px] font-semibold text-orange-400 uppercase tracking-wide">
                  Best!
                </span>
              )}
              {latestMilestone && (
                <span className="text-sm">{latestMilestone.icon}</span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5 truncate">{message}</p>

            {/* Progress bar toward next milestone */}
            {nextMilestone && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-zinc-600">
                    {daysToNext === 1 ? '1 day to' : `${daysToNext} days to`} {nextMilestone.icon} {nextMilestone.label}
                  </span>
                  <span className="text-[10px] text-zinc-600">{pct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )}

            {/* All milestones earned */}
            {!nextMilestone && currentStreak > 0 && (
              <p className="text-[10px] text-orange-400 mt-1">All milestones earned — you&apos;re a legend!</p>
            )}
          </div>

          {/* Today activity dot */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div className={`h-3 w-3 rounded-full ${todayHasActivity ? 'bg-emerald-500' : atRisk ? 'bg-amber-500 animate-pulse' : 'bg-zinc-700'}`} />
            <span className="text-[9px] text-zinc-600">today</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Today's Session Card ─────────────────────────────────────────────────────

function TodaySessionCard({
  session,
  restrictedPlayers,
}: {
  session: Session;
  restrictedPlayers: Array<{ name: string; status: string }>;
}) {
  const TYPE_LABEL: Record<string, string> = {
    practice: 'Practice',
    game: 'Game',
    scrimmage: 'Scrimmage',
    tournament: 'Tournament',
    training: 'Training',
  };

  function fmtTime(t: string | null) {
    if (!t) return null;
    const parts = t.split(':').map(Number);
    const h = parts[0];
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  const label = TYPE_LABEL[session.type] ?? session.type;

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20">
            <CalendarClock className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Today</p>
            <p className="font-bold text-zinc-100">{label}</p>
            {session.start_time && (
              <p className="text-sm text-zinc-400">{fmtTime(session.start_time)}</p>
            )}
            {session.location && (
              <p className="text-xs text-zinc-500">{session.location}</p>
            )}
          </div>
        </div>
        {session.opponent && (
          <span className="shrink-0 rounded-full bg-zinc-800 px-3 py-1 text-sm font-medium text-zinc-300">
            vs {session.opponent}
          </span>
        )}
      </div>

      {restrictedPlayers.length > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-xs font-medium text-amber-300">
              {restrictedPlayers.length} player{restrictedPlayers.length > 1 ? 's' : ''} with availability concerns
            </p>
          </div>
          <p className="text-xs leading-relaxed text-zinc-400">
            {restrictedPlayers.slice(0, 3).map((p) => `${p.name} (${p.status})`).join(' · ')}
            {restrictedPlayers.length > 3 && ` +${restrictedPlayers.length - 3} more`}
          </p>
        </div>
      )}

      <div className="flex gap-2">
        <Link href={`/sessions/${session.id}`} className="flex-1">
          <Button size="sm" className="w-full">
            <ArrowRight className="h-4 w-4" />
            Open Session
          </Button>
        </Link>
        {session.type === 'practice' && (
          <Link href={`/sessions/${session.id}/timer`}>
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5">
              <Timer className="h-4 w-4" />
              Timer
            </Button>
          </Link>
        )}
        <Link href={`/capture?session=${session.id}`}>
          <Button size="sm" variant="outline" className="shrink-0" aria-label="Capture observation">
            <Mic className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Upcoming Sessions Card ───────────────────────────────────────────────────

function UpcomingSessionsCard({ sessions }: { sessions: Session[] }) {
  if (sessions.length === 0) return null;

  const TYPE_DOT: Record<string, string> = {
    practice: 'bg-emerald-400',
    game: 'bg-blue-400',
    scrimmage: 'bg-purple-400',
    tournament: 'bg-amber-400',
    training: 'bg-teal-400',
  };

  const TYPE_LABEL: Record<string, string> = {
    practice: 'Practice',
    game: 'Game',
    scrimmage: 'Scrimmage',
    tournament: 'Tournament',
    training: 'Training',
  };

  function formatDate(dateStr: string) {
    const d = new Date(dateStr + 'T12:00:00');
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtTime(t: string | null) {
    if (!t) return null;
    const parts = t.split(':').map(Number);
    const h = parts[0];
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
  }

  return (
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Upcoming This Week
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        {sessions.map((s) => {
          const time = fmtTime(s.start_time);
          return (
            <Link key={s.id} href={`/sessions/${s.id}`}>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-zinc-800/50 active:bg-zinc-800 transition-colors touch-manipulation">
                <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${TYPE_DOT[s.type] ?? 'bg-zinc-400'}`} />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-zinc-200">
                    {TYPE_LABEL[s.type] ?? s.type}
                  </span>
                  {s.opponent && (
                    <span className="text-sm text-zinc-400"> vs {s.opponent}</span>
                  )}
                </div>
                <span className="shrink-0 text-xs text-zinc-500">
                  {formatDate(s.date)}{time && ` · ${time}`}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
              </div>
            </Link>
          );
        })}
        <Link href="/sessions/new">
          <div className="flex items-center gap-2 px-3 py-2 text-xs text-zinc-600 hover:text-zinc-400 transition-colors touch-manipulation">
            <Plus className="h-3.5 w-3.5" />
            Schedule a session
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { activeTeam, teams, coach } = useActiveTeam();
  const [showInsights, setShowInsights] = useState(false);
  const [showDebrief, setShowDebrief] = useState(false);

  const practiceActive = useAppStore((s) => s.practiceActive);
  const setPracticeActive = useAppStore((s) => s.setPracticeActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);
  const setPracticeSessionId = useAppStore((s) => s.setPracticeSessionId);
  const setPracticeStartedAt = useAppStore((s) => s.setPracticeStartedAt);

  async function startPractice() {
    if (!activeTeam || !coach) return;
    try {
      const session = await mutate<{ id: string }>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          type: 'practice',
          date: new Date().toISOString().split('T')[0],
          notes: 'Auto-created practice session',
        },
        select: 'id',
      });
      const id = Array.isArray(session) ? (session as any)[0]?.id : session?.id;
      if (id) {
        setPracticeActive(true);
        setPracticeSessionId(id);
        setPracticeStartedAt(new Date().toISOString());
      }
    } catch (err) {
      console.warn('Failed to start practice session:', err);
    }
  }

  const { data: stats, isLoading: isLoadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['home-stats', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const [players, observations, sessions, recentObs] = await Promise.all([
        query<{ id: string }[]>({
          table: 'players',
          select: 'id',
          filters: { team_id: activeTeam.id, is_active: true },
        }),
        query<{ id: string }[]>({
          table: 'observations',
          select: 'id',
          filters: { team_id: activeTeam.id },
        }),
        query<{ id: string }[]>({
          table: 'sessions',
          select: 'id',
          filters: { team_id: activeTeam.id },
        }),
        query<{ created_at: string }[]>({
          table: 'observations',
          select: 'created_at',
          filters: { team_id: activeTeam.id },
          order: { column: 'created_at', ascending: false },
          limit: 1,
        }),
      ]);
      return {
        players: players.length,
        observations: observations.length,
        sessions: sessions.length,
        lastObsDate: recentObs?.[0]?.created_at ?? null,
      };
    },
    enabled: !!activeTeam,
  });

  const daysSinceLastObs = useMemo(() => {
    if (!stats?.lastObsDate) return 999;
    return Math.floor((Date.now() - new Date(stats.lastObsDate).getTime()) / 86_400_000);
  }, [stats?.lastObsDate]);

  const showStreak = !isLoadingStats && !!activeTeam && (stats?.observations ?? 0) > 0;

  // Team Pulse: 14-day observation analytics for coaching intelligence
  const { data: pulse, isLoading: isLoadingPulse, refetch: refetchPulse } = useQuery({
    queryKey: ['home-pulse', activeTeam?.id],
    queryFn: async (): Promise<PulseStats | null> => {
      if (!activeTeam) return null;

      const now = Date.now();
      const day = 86_400_000;
      const fourteenDaysAgo = new Date(now - 14 * day).toISOString();

      const [playersData, recentObs] = await Promise.all([
        query<{ id: string; name: string; jersey_number: number | null }[]>({
          table: 'players',
          select: 'id, name, jersey_number',
          filters: { team_id: activeTeam.id, is_active: true },
          order: { column: 'name', ascending: true },
        }),
        query<
          { player_id: string | null; sentiment: string; category: string; created_at: string }[]
        >({
          table: 'observations',
          select: 'player_id, sentiment, category, created_at',
          filters: {
            team_id: activeTeam.id,
            created_at: { op: 'gte', value: fourteenDaysAgo },
          },
          order: { column: 'created_at', ascending: false },
          limit: 500,
        }),
      ]);

      if (!playersData?.length || !recentObs?.length) return null;

      // Split into this-week (0–7d) and last-week (7–14d) buckets
      const obs7d = recentObs.filter((o) => now - new Date(o.created_at).getTime() < 7 * day);
      const obs7to14d = recentObs.filter(
        (o) => now - new Date(o.created_at).getTime() >= 7 * day
      );

      // Health score = positive / (positive + needs-work), ignoring neutral
      const calcHealth = (obs: typeof recentObs): number | null => {
        const scored = obs.filter((o) => o.sentiment !== 'neutral');
        if (!scored.length) return null;
        return Math.round(
          (obs.filter((o) => o.sentiment === 'positive').length / scored.length) * 100
        );
      };

      const thisWeekHealth = calcHealth(obs7d);
      const lastWeekHealth = calcHealth(obs7to14d);

      let healthTrend: 'up' | 'down' | 'stable' = 'stable';
      if (thisWeekHealth !== null && lastWeekHealth !== null) {
        const delta = thisWeekHealth - lastWeekHealth;
        if (delta >= 5) healthTrend = 'up';
        else if (delta <= -5) healthTrend = 'down';
      }

      // Players with no observations in the last 7 days
      const observedIds = new Set(
        obs7d.filter((o) => o.player_id).map((o) => o.player_id as string)
      );
      const unobservedPlayers = playersData.filter((p) => !observedIds.has(p.id));

      // Most common needs-work category in the 14-day window
      const needsWorkCounts = new Map<string, number>();
      recentObs
        .filter((o) => o.sentiment === 'needs-work' && o.category)
        .forEach((o) => {
          needsWorkCounts.set(o.category, (needsWorkCounts.get(o.category) ?? 0) + 1);
        });
      const topEntry = [...needsWorkCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      const topFocusArea = topEntry ? { category: topEntry[0], count: topEntry[1] } : null;

      // Skill trends — compare this week vs last week per category
      let skillTrends: PulseStats['skillTrends'] = null;
      if (hasEnoughDataForTrends(obs7d, obs7to14d, 5)) {
        const allTrends = buildSkillTrends(obs7d, obs7to14d);
        const improving = getTopImprovingSkills(allTrends, 3, 3);
        const declining = getTopDecliningSkills(allTrends, 3, 3);
        if (improving.length > 0 || declining.length > 0) {
          skillTrends = { improving, declining };
        }
      }

      // Daily focus suggestion — one actionable coaching task for today
      const decliningTrends = skillTrends?.declining ?? [];
      const dailyFocus = buildDailyFocusSuggestion(
        playersData,
        recentObs,
        decliningTrends,
        new Date()
      );

      return {
        obs14dCount: recentObs.length,
        obs7dCount: obs7d.length,
        thisWeekHealth,
        lastWeekHealth,
        healthTrend,
        players: playersData,
        unobservedPlayers,
        totalPlayers: playersData.length,
        topFocusArea,
        skillTrends,
        dailyFocus,
      };
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  // Drills for Drill of the Day — only fetched when there's a known skill gap
  const { data: drillsForGap = [] } = useQuery({
    queryKey: ['drills-for-gap', activeTeam?.sport_id],
    queryFn: async (): Promise<Drill[]> => {
      if (!activeTeam?.sport_id) return [];
      const result = await query<Drill[]>({
        table: 'drills',
        select: 'id, name, description, category, duration_minutes, player_count_min, player_count_max, teaching_cues, equipment, source',
        filters: { sport_id: activeTeam.sport_id },
        limit: 200,
      });
      return result ?? [];
    },
    enabled: !!activeTeam?.sport_id && !!pulse?.topFocusArea,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const drillOfDay = useMemo(() => {
    if (!pulse?.topFocusArea || !drillsForGap.length || !activeTeam) return null;
    return selectDrillOfDay(drillsForGap, pulse.topFocusArea.category, activeTeam.id, new Date());
  }, [pulse?.topFocusArea, drillsForGap, activeTeam]);

  // Today's and upcoming sessions — drives the session-awareness card on the home dashboard
  const { todayStr, tomorrowStr, in7DaysStr } = useMemo(() => {
    const now = Date.now();
    return {
      todayStr: new Date(now).toISOString().split('T')[0],
      tomorrowStr: new Date(now + 86_400_000).toISOString().split('T')[0],
      in7DaysStr: new Date(now + 7 * 86_400_000).toISOString().split('T')[0],
    };
  }, []);

  const { data: todaySessions = [] } = useQuery({
    queryKey: ['sessions-today', activeTeam?.id, todayStr],
    queryFn: async () => {
      if (!activeTeam) return [];
      return query<Session[]>({
        table: 'sessions',
        select: 'id, type, date, start_time, end_time, location, opponent, result',
        filters: { team_id: activeTeam.id, date: todayStr },
        order: { column: 'start_time', ascending: true },
      });
    },
    enabled: !!activeTeam,
    staleTime: 2 * 60 * 1000,
  });

  const { data: upcomingSessions = [] } = useQuery({
    queryKey: ['sessions-upcoming', activeTeam?.id, tomorrowStr],
    queryFn: async () => {
      if (!activeTeam) return [];
      const sessions = await query<Session[]>({
        table: 'sessions',
        select: 'id, type, date, start_time, location, opponent',
        filters: { team_id: activeTeam.id, date: { op: 'gte', value: tomorrowStr } },
        order: { column: 'date', ascending: true },
        limit: 5,
      });
      return (sessions ?? []).filter((s) => s.date <= in7DaysStr);
    },
    enabled: !!activeTeam,
    staleTime: 2 * 60 * 1000,
  });

  const { data: playerAvailability = {} } = useQuery({
    queryKey: ['player-availability-home', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return {};
      const res = await fetch(`/api/player-availability?team_id=${activeTeam.id}`);
      if (!res.ok) return {};
      const json = await res.json();
      return json.availability as Record<string, { status: string; reason: string | null }>;
    },
    enabled: !!activeTeam && todaySessions.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const restrictedPlayersToday = useMemo(() => {
    if (!pulse?.players || !playerAvailability) return [];
    return pulse.players
      .filter((p) => {
        const avail = playerAvailability[p.id];
        return avail && avail.status !== 'available';
      })
      .map((p) => ({ name: p.name, status: playerAvailability[p.id].status }));
  }, [pulse?.players, playerAvailability]);

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10 p-3">
          <Image src="/logo.svg" alt="SportsIQ" width={48} height={48} />
        </div>
        <h1 className="text-2xl font-bold">Welcome to SportsIQ</h1>
        <p className="mt-2 text-zinc-400 max-w-sm">
          Your AI-powered coaching assistant. Create your first team to start tracking players,
          capturing observations, and generating practice plans.
        </p>
        <Link href="/onboarding/team">
          <Button className="mt-6" size="lg">
            <Plus className="h-5 w-5" />
            Create Team
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <>
    <PullToRefresh onRefresh={async () => { await Promise.all([refetchStats(), refetchPulse()]); }}>
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">{activeTeam.name}</h1>
        <p className="text-zinc-400">
          Season {activeTeam.season || 'Not set'} &middot; Week {activeTeam.current_week}
        </p>
      </div>

      {/* Session CTA — End Practice (active) / Today's Session / Start Practice */}
      {practiceActive ? (
        <button
          onClick={() => setShowDebrief(true)}
          className="w-full rounded-2xl bg-gradient-to-r from-red-500 to-red-600 p-5 text-left text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all touch-manipulation"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20">
              <Square className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-bold">End Practice</p>
              <p className="text-sm text-red-100">Tap to wrap up and debrief</p>
            </div>
          </div>
        </button>
      ) : todaySessions.length > 0 ? (
        <TodaySessionCard
          session={todaySessions[0]}
          restrictedPlayers={restrictedPlayersToday}
        />
      ) : (
        <button
          onClick={startPractice}
          className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-600 p-5 text-left text-white shadow-lg shadow-emerald-500/20 active:scale-[0.98] transition-all touch-manipulation"
        >
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20">
              <Play className="h-7 w-7" />
            </div>
            <div>
              <p className="text-lg font-bold">Start Practice</p>
              <p className="text-sm text-emerald-100">Tap when you arrive at the gym</p>
            </div>
          </div>
        </button>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 lg:grid-cols-3">
        <Link href="/capture">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-3 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-orange-500/20">
                <Mic className="h-7 w-7 sm:h-6 sm:w-6 text-orange-500" />
              </div>
              <span className="text-sm font-medium">Capture</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/roster">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-3 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-blue-500/20">
                <Users className="h-7 w-7 sm:h-6 sm:w-6 text-blue-500" />
              </div>
              <span className="text-sm font-medium">Roster</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/plans">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-3 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <ClipboardList className="h-7 w-7 sm:h-6 sm:w-6 text-emerald-500" />
              </div>
              <span className="text-sm font-medium">Plans</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Getting Started checklist — shown until all 3 first actions are complete */}
      {!isLoadingStats && stats && coach && (
        <GettingStartedCard
          players={stats.players}
          sessions={stats.sessions}
          observations={stats.observations}
          teamId={activeTeam.id}
        />
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {isLoadingStats ? (
          <>
            {(['Players', 'Observations', 'Sessions'] as const).map((label) => (
              <Card key={label}>
                <CardContent className="p-3 sm:p-4 flex flex-col items-center gap-2">
                  <Skeleton className="h-8 w-10 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </CardContent>
              </Card>
            ))}
          </>
        ) : (
          <>
            <Card>
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-orange-500">
                  {stats?.players ?? 0}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Players</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-blue-500">
                  {stats?.observations ?? 0}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Observations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold text-emerald-500">
                  {stats?.sessions ?? 0}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Sessions</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* First Practice Launcher — shown until the coach runs their first session */}
      {!isLoadingStats && coach && stats?.sessions === 0 && (
        <FirstPracticeLauncher
          teamId={activeTeam.id}
          coachId={coach.id}
          sportId={activeTeam.sport_id || ''}
          ageGroup={activeTeam.age_group || ''}
        />
      )}

      {/* Daily Focus — ONE actionable coaching task for today */}
      {pulse?.dailyFocus && (
        <DailyFocusCard suggestion={pulse.dailyFocus} teamId={activeTeam.id} />
      )}

      {/* Drill of the Day — targeted drill for the team's top skill gap */}
      {drillOfDay && pulse?.topFocusArea && (
        <DrillOfDayCard
          drill={drillOfDay}
          category={pulse.topFocusArea.category}
          teamId={activeTeam.id}
        />
      )}

      {/* Coaching streak */}
      {showStreak && <StreakCard teamId={activeTeam.id} />}

      {/* Birthday Card — shown when players have birthdays today or in the next 6 days */}
      <BirthdayCard teamId={activeTeam.id} teamName={activeTeam.name} />

      {/* Upcoming sessions this week */}
      {upcomingSessions.length > 0 && <UpcomingSessionsCard sessions={upcomingSessions} />}

      {/* Nudge: no observations in 3+ days */}
      {!practiceActive && stats && stats.observations > 0 && daysSinceLastObs > 3 && (
        <Card className="border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center gap-3">
            <Bell className="h-5 w-5 text-amber-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-300">It&apos;s been {daysSinceLastObs} days</p>
              <p className="text-xs text-zinc-400">Your players are waiting for feedback</p>
            </div>
            <Button size="sm" onClick={startPractice}>Start Practice</Button>
          </div>
        </Card>
      )}

      {/* Seasonal promotion — shown in the first 3 weeks of Sept/Jan/Apr */}
      {!isLoadingStats && (
        <SeasonalPromo playerCount={stats?.players} />
      )}

      {/* Freemium upgrade nudge — shown for free-tier coaches once there's some data */}
      {!isLoadingStats && stats && (
        <FreemiumNudge
          playerCount={stats.players}
          observationCount={stats.observations}
        />
      )}

      {/* Team Pulse — coaching intelligence card, shown once there's observation data */}
      {isLoadingPulse ? (
        <Card className="overflow-hidden border-orange-500/20">
          <div className="px-5 pt-5 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
              </div>
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
          </div>
          <CardContent className="px-5 pb-5 pt-2">
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </div>
          </CardContent>
        </Card>
      ) : (
        pulse && <TeamPulseCard pulse={pulse} />
      )}

      {/* Skill Trends — improving vs declining skill categories, this week vs last week */}
      {pulse?.skillTrends && (
        <SkillTrendsCard
          improving={pulse.skillTrends.improving}
          declining={pulse.skillTrends.declining}
        />
      )}

      {/* Parent Messages — shown when parents have sent reactions from share portal */}
      {!isLoadingStats && stats && stats.players > 0 && (
        <ParentMessagesCard teamId={activeTeam.id} />
      )}

      {/* More Insights — collapsible on mobile, always visible on desktop */}
      {(() => {
        const hasTips = !isLoadingStats && stats && stats.observations >= 5;
        const hasWeeklyStar = !isLoadingStats && stats && stats.observations >= 5 && stats.players > 0;
        const hasWins = !isLoadingStats && stats && stats.players > 0;
        if (!hasTips && !hasWeeklyStar && !hasWins) return null;
        return (
          <>
            {/* Mobile: collapsible toggle */}
            <div className="sm:hidden">
              <button
                onClick={() => setShowInsights(!showInsights)}
                className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 w-full py-2"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showInsights ? 'rotate-180' : ''}`} />
                More Insights
              </button>
              {showInsights && (
                <div className="space-y-4 mt-2">
                  {hasTips && <CoachingTipsCard teamId={activeTeam.id} />}
                  {hasWeeklyStar && <WeeklyStarCard teamId={activeTeam.id} />}
                  {hasWins && <TeamWinsCard teamId={activeTeam.id} />}
                </div>
              )}
            </div>
            {/* Desktop: always visible */}
            <div className="hidden sm:block space-y-4">
              {hasTips && <CoachingTipsCard teamId={activeTeam.id} />}
              {hasWeeklyStar && <WeeklyStarCard teamId={activeTeam.id} />}
              {hasWins && <TeamWinsCard teamId={activeTeam.id} />}
            </div>
          </>
        );
      })()}

    </div>
    </PullToRefresh>

    {/* Testimonial prompt — shown after 10 observations */}
    {coach && !isLoadingStats && stats && (
      <TestimonialPrompt
        coachId={coach.id}
        observationCount={stats.observations}
      />
    )}

    {/* Post-practice debrief modal */}
    {showDebrief && practiceSessionId && (
      <PostPracticeDebrief
        sessionId={practiceSessionId}
        onClose={() => setShowDebrief(false)}
      />
    )}
    </>
  );
}
