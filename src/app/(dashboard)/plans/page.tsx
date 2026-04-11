'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ClipboardList,
  ClipboardCheck,
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
  Activity,
  TrendingUp,
  Newspaper,
  Star,
  Home,
  Users,
  BookOpen,
} from 'lucide-react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import type { Plan, Player, PlanType } from '@/types/database';
import type { ObservationInsights } from '@/app/api/ai/plan/route';

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
  newsletter: { label: 'Parent Newsletter', icon: Newspaper, color: 'text-violet-400' },
  season_storyline: { label: 'Season Storyline', icon: BookOpen, color: 'text-indigo-400' },
  self_assessment: { label: 'Self-Assessment', icon: ClipboardCheck, color: 'text-teal-400' },
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
  const [generatedPreview, setGeneratedPreview] = useState<unknown>(null);
  const [lastInsights, setLastInsights] = useState<ObservationInsights | null>(null);
  const [generatingNewsletter, setGeneratingNewsletter] = useState(false);
  const [newsletterStats, setNewsletterStats] = useState<{ sessionsIncluded: number; observationsIncluded: number; playerSpotlightsCount: number; dateRange: string } | null>(null);
  const [generatingStoryline, setGeneratingStoryline] = useState(false);
  const [storylinePlayerId, setStorylinePlayerId] = useState<string>('');
  const [storylineStats, setStorylineStats] = useState<{ totalObservations: number; weeksOfData: number; firstObservationDate: string; latestObservationDate: string } | null>(null);

  const { data: plans, isLoading, refetch: refetchPlans } = useQuery({
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

  const { data: players } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id || ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Player[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: activeTeam.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
  });

  const deleteMutation = useMutation({
    mutationFn: async (planId: string) => {
      await mutate({
        table: 'plans',
        operation: 'delete',
        filters: { id: planId },
      });
    },
    onSuccess: () => {
      if (activeTeam) {
        qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      }
      setSelectedPlan(null);
    },
  });

  const generateFromPrompt = async (text: string, smartMode = false) => {
    if (!activeTeam || (!text.trim() && !smartMode)) return;
    setGenerating(true);
    setError(null);
    setGeneratedPreview(null);
    setLastInsights(null);

    // Determine type from prompt text
    const lowerText = text.toLowerCase();
    const isGameday = lowerText.includes('game day') || lowerText.includes('gameday') || lowerText.includes('game sheet');
    const type = isGameday ? 'gameday' : 'practice';

    // Extract explicit focus skills from the prompt (smart mode lets AI decide from data)
    const skillKeywords = ['ball handling', 'passing', 'shooting', 'defense', 'rebounding', 'footwork', 'teamwork', 'conditioning', 'dribbling'];
    const focusSkills = smartMode ? [] : skillKeywords.filter(skill => lowerText.includes(skill));

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
      if (data.observationInsights && data.observationInsights.totalObs > 0) {
        setLastInsights(data.observationInsights as ObservationInsights);
      }
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const generateNewsletter = async () => {
    if (!activeTeam) return;
    setGeneratingNewsletter(true);
    setError(null);
    setNewsletterStats(null);
    try {
      const res = await fetch('/api/ai/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate newsletter');
      }
      const data = await res.json();
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setSelectedPlan(data.plan);
      if (data.stats) setNewsletterStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Newsletter generation failed');
    } finally {
      setGeneratingNewsletter(false);
    }
  };

  const generateStoryline = async () => {
    if (!activeTeam || !storylinePlayerId) return;
    setGeneratingStoryline(true);
    setError(null);
    setStorylineStats(null);
    try {
      const res = await fetch('/api/ai/season-storyline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, playerId: storylinePlayerId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate season storyline');
      }
      const data = await res.json();
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setSelectedPlan(data.plan);
      if (data.stats) setStorylineStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Season storyline generation failed');
    } finally {
      setGeneratingStoryline(false);
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

  function renderObjectFields(obj: any) {
    if (!obj || typeof obj !== 'object') return String(obj ?? '');
    return (
      <div className="space-y-1">
        {Object.entries(obj).map(([k, v]) => (
          <div key={k}>
            <span className="font-medium text-zinc-400 text-xs uppercase tracking-wider">{k.replace(/_/g, ' ')}: </span>
            <span className="text-zinc-300 text-sm">
              {typeof v === 'string' ? v
                : Array.isArray(v) ? v.map((item, i) => (
                    <span key={i} className="block ml-2 text-zinc-300">- {typeof item === 'string' ? item : item?.name || item?.text || String(item)}</span>
                  ))
                : typeof v === 'object' && v !== null
                ? Object.entries(v).map(([ik, iv]) => (
                    <span key={ik} className="block ml-2 text-zinc-400">{ik.replace(/_/g, ' ')}: <span className="text-zinc-300">{String(iv)}</span></span>
                  ))
                : String(v)}
            </span>
          </div>
        ))}
      </div>
    );
  }

  function renderStructuredContent(plan: Plan) {
    let structured = plan.content_structured as any;

    // If no structured content, try to parse content as JSON
    if (!structured && plan.content) {
      try {
        structured = JSON.parse(plan.content);
      } catch {
        // Not JSON — render as plain text
        return (
          <div className="prose prose-invert prose-sm max-w-none whitespace-pre-wrap">
            {plan.content}
          </div>
        );
      }
    }

    if (!structured) return <p className="text-sm text-zinc-500">No content available</p>;

    // Newsletter renderer
    if (structured.player_spotlights || structured.week_summary) {
      return (
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Newspaper className="h-5 w-5 text-violet-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-violet-400">Parent Newsletter</span>
            </div>
            {structured.title && (
              <h2 className="text-xl font-bold text-zinc-100">{structured.title}</h2>
            )}
            {structured.date_range && (
              <p className="text-xs text-zinc-500">{structured.date_range}</p>
            )}
          </div>

          {/* Week Summary */}
          {structured.week_summary && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <p className="text-sm font-semibold text-zinc-300 mb-2">This Week</p>
              <p className="text-sm text-zinc-400 leading-relaxed">{structured.week_summary}</p>
            </div>
          )}

          {/* Team Highlight */}
          {structured.team_highlight && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300">Team Highlight</p>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{structured.team_highlight}</p>
            </div>
          )}

          {/* Player Spotlights */}
          {Array.isArray(structured.player_spotlights) && structured.player_spotlights.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-400" />
                <p className="text-sm font-semibold text-zinc-200">Player Spotlights</p>
                <span className="text-xs text-zinc-600">({structured.player_spotlights.length} players)</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {structured.player_spotlights.map((spotlight: any, i: number) => (
                  <div
                    key={i}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-2"
                  >
                    <p className="text-sm font-semibold text-zinc-100">{spotlight.player_name}</p>
                    <p className="text-xs text-zinc-400 leading-relaxed">{spotlight.highlight}</p>
                    {spotlight.home_challenge && (
                      <div className="flex items-start gap-2 rounded-lg bg-blue-500/10 border border-blue-500/20 p-2.5 mt-2">
                        <Home className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-300 leading-relaxed">{spotlight.home_challenge}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Focus */}
          {structured.upcoming_focus && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <p className="text-sm font-semibold text-orange-300 mb-2">Looking Ahead</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{structured.upcoming_focus}</p>
            </div>
          )}

          {/* Coaching Note */}
          {structured.coaching_note && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">From the Coach</p>
              <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{structured.coaching_note}&rdquo;</p>
            </div>
          )}
        </div>
      );
    }

    // Season Storyline renderer
    if (structured.chapters || structured.opening || structured.trajectory) {
      return (
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BookOpen className="h-5 w-5 text-indigo-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Season Storyline</span>
            </div>
            {structured.player_name && (
              <h2 className="text-xl font-bold text-zinc-100">{structured.player_name}</h2>
            )}
            {structured.season_label && (
              <p className="text-xs text-zinc-500">{structured.season_label}</p>
            )}
          </div>

          {/* Opening */}
          {structured.opening && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <p className="text-sm font-semibold text-indigo-300 mb-2">The Beginning</p>
              <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{structured.opening}&rdquo;</p>
            </div>
          )}

          {/* Chapters */}
          {Array.isArray(structured.chapters) && structured.chapters.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-200">Season Arc</p>
              {structured.chapters.map((chapter: any, i: number) => (
                <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-zinc-100">{chapter.phase}</p>
                    {chapter.weeks && (
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{chapter.weeks}</span>
                    )}
                  </div>
                  {chapter.narrative && (
                    <p className="text-sm text-zinc-400 leading-relaxed">{chapter.narrative}</p>
                  )}
                  {Array.isArray(chapter.highlights) && chapter.highlights.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Highlights</p>
                      {chapter.highlights.map((h: string, j: number) => (
                        <p key={j} className="text-xs text-zinc-400 flex gap-2"><span className="text-emerald-500">+</span>{h}</p>
                      ))}
                    </div>
                  )}
                  {Array.isArray(chapter.growth_moments) && chapter.growth_moments.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Growth Moments</p>
                      {chapter.growth_moments.map((g: string, j: number) => (
                        <p key={j} className="text-xs text-zinc-400 flex gap-2"><span className="text-amber-500">→</span>{g}</p>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Current Strengths */}
          {Array.isArray(structured.current_strengths) && structured.current_strengths.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Star className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300">Current Strengths</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {structured.current_strengths.map((s: string, i: number) => (
                  <span key={i} className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 rounded-full px-2.5 py-1">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Trajectory */}
          {structured.trajectory && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <p className="text-sm font-semibold text-orange-300">Where They&apos;re Headed</p>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{structured.trajectory}</p>
            </div>
          )}

          {/* Coach Reflection */}
          {structured.coach_reflection && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Coach&apos;s Reflection</p>
              <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{structured.coach_reflection}&rdquo;</p>
            </div>
          )}
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
                <p className="text-sm text-zinc-300">{typeof structured.warmup === 'string' ? structured.warmup : structured.warmup?.name || structured.warmup?.description || renderObjectFields(structured.warmup)}</p>
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
                <p className="text-sm text-zinc-300">{typeof structured.drills === 'string' ? structured.drills : renderObjectFields(structured.drills)}</p>
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
                <p className="text-sm text-zinc-300">{typeof structured.cooldown === 'string' ? structured.cooldown : structured.cooldown?.notes || structured.cooldown?.description || renderObjectFields(structured.cooldown)}</p>
              )}
            </div>
          )}

          {structured.notes && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Coach Notes
              </h3>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap">
                {typeof structured.notes === 'string'
                  ? structured.notes
                  : Array.isArray(structured.notes)
                  ? structured.notes.map((note: any, i: number) => (
                      <p key={i} className="mb-1">{typeof note === 'string' ? note : note.text || note.note || String(note)}</p>
                    ))
                  : typeof structured.notes === 'object' && structured.notes !== null
                  ? Object.entries(structured.notes).map(([k, v]) => (
                      <p key={k} className="mb-1"><span className="font-medium text-zinc-400">{k.replace(/_/g, ' ')}:</span> {String(v)}</p>
                    ))
                  : String(structured.notes)}
              </div>
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
                        {typeof item === 'string' ? item : renderObjectFields(item)}
                      </div>
                    ))
                  : typeof value === 'object' && value !== null
                  ? renderObjectFields(value as Record<string, unknown>)
                  : String(value)}
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
    <PullToRefresh onRefresh={async () => { await refetchPlans(); }}>
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

          {/* Smart Plan chip + suggestion chips */}
          <div className="space-y-2">
            {/* Smart Plan — data-driven, always first */}
            <button
              onClick={() => generateFromPrompt('', true)}
              disabled={generating || !activeTeam}
              className="flex w-full items-center gap-2.5 rounded-xl border border-orange-500/40 bg-gradient-to-r from-orange-500/15 to-orange-500/5 px-4 py-3 text-left transition-all hover:border-orange-500/60 hover:from-orange-500/20 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/25">
                <Activity className="h-4 w-4 text-orange-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-orange-300">AI-Tailored Plan</p>
                <p className="text-xs text-zinc-500">Auto-generated from your team&apos;s recent observation data</p>
              </div>
              <TrendingUp className="h-4 w-4 text-orange-500/50 shrink-0" />
            </button>

            {/* Weekly Parent Newsletter */}
            <button
              onClick={generateNewsletter}
              disabled={generatingNewsletter || generating || !activeTeam}
              className="flex w-full items-center gap-2.5 rounded-xl border border-violet-500/40 bg-gradient-to-r from-violet-500/15 to-violet-500/5 px-4 py-3 text-left transition-all hover:border-violet-500/60 hover:from-violet-500/20 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/25">
                {generatingNewsletter ? (
                  <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                ) : (
                  <Newspaper className="h-4 w-4 text-violet-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-violet-300">Weekly Parent Newsletter</p>
                <p className="text-xs text-zinc-500">AI-written summary of this week&apos;s sessions with player spotlights</p>
              </div>
              <Users className="h-4 w-4 text-violet-500/50 shrink-0" />
            </button>

            {/* Season Storyline — player-specific */}
            <div className="rounded-xl border border-indigo-500/40 bg-gradient-to-r from-indigo-500/15 to-indigo-500/5 p-3 space-y-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/25">
                  <BookOpen className="h-4 w-4 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-indigo-300">Season Storyline</p>
                  <p className="text-xs text-zinc-500">AI narrative arc of a player&apos;s season journey</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <select
                    value={storylinePlayerId}
                    onChange={(e) => setStorylinePlayerId(e.target.value)}
                    disabled={generatingStoryline || !activeTeam}
                    className="w-full appearance-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 pr-8 focus:outline-none focus:border-indigo-500/50 disabled:opacity-50"
                  >
                    <option value="">Select a player...</option>
                    {players?.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                </div>
                <Button
                  onClick={generateStoryline}
                  disabled={!storylinePlayerId || generatingStoryline || !activeTeam}
                  className="h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-30 shrink-0"
                >
                  {generatingStoryline ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Generate'
                  )}
                </Button>
              </div>
            </div>

            {/* Generic suggestion chips */}
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
          </div>

          {/* Generating indicator */}
          {generating && (
            <div className="flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
              <Loader2 className="h-5 w-5 text-orange-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-orange-300">Generating your plan...</p>
                <p className="text-xs text-zinc-500">Analyzing your team&apos;s recent observations and creating a tailored practice plan</p>
              </div>
            </div>
          )}

          {/* Newsletter generating indicator */}
          {generatingNewsletter && (
            <div className="flex items-center gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
              <Loader2 className="h-5 w-5 text-violet-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-violet-300">Writing parent newsletter...</p>
                <p className="text-xs text-zinc-500">Gathering this week&apos;s sessions and crafting player spotlights</p>
              </div>
            </div>
          )}

          {/* Storyline generating indicator */}
          {generatingStoryline && (
            <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
              <Loader2 className="h-5 w-5 text-indigo-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-indigo-300">Writing season storyline...</p>
                <p className="text-xs text-zinc-500">Analyzing the full season of observations and crafting the player&apos;s arc</p>
              </div>
            </div>
          )}

          {/* Storyline stats badge — shown after successful generation */}
          {!generatingStoryline && storylineStats && (
            <div className="flex items-start gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
              <BookOpen className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-indigo-300">Season Storyline generated</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {storylineStats.totalObservations} observations &middot; {storylineStats.weeksOfData} week{storylineStats.weeksOfData !== 1 ? 's' : ''} of data &middot; {storylineStats.firstObservationDate} – {storylineStats.latestObservationDate}
                </p>
              </div>
              <button
                onClick={() => setStorylineStats(null)}
                className="text-zinc-600 hover:text-zinc-400 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Newsletter stats badge — shown after successful generation */}
          {!generatingNewsletter && newsletterStats && (
            <div className="flex items-start gap-3 rounded-lg border border-violet-500/20 bg-violet-500/5 p-3">
              <Newspaper className="h-4 w-4 text-violet-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-violet-300">Newsletter generated</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {newsletterStats.dateRange} &middot; {newsletterStats.sessionsIncluded} session{newsletterStats.sessionsIncluded !== 1 ? 's' : ''} &middot; {newsletterStats.observationsIncluded} observations &middot; {newsletterStats.playerSpotlightsCount} player spotlight{newsletterStats.playerSpotlightsCount !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setNewsletterStats(null)}
                className="text-zinc-600 hover:text-zinc-400 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Data-driven badge — shown after successful generation */}
          {!generating && lastInsights && lastInsights.totalObs > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <Activity className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-emerald-300">
                  Data-driven plan generated
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Based on {lastInsights.totalObs} observation{lastInsights.totalObs !== 1 ? 's' : ''} from the last {lastInsights.daysOfData} days.
                  {lastInsights.topNeedsWork.length > 0 && (
                    <>
                      {' '}Targeting:{' '}
                      <span className="text-zinc-400">
                        {lastInsights.topNeedsWork.slice(0, 3).map((c) => c.category).join(', ')}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <button
                onClick={() => setLastInsights(null)}
                className="text-zinc-600 hover:text-zinc-400 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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
    </PullToRefresh>
  );
}
