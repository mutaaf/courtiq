'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
  Shield,
  Swords,
  Eye,
  MessageSquare,
  Zap,
  ChevronUp,
  BookmarkPlus,
  Check,
  Play,
  Timer,
  Plus,
  Radio,
  Target,
  BarChart2,
  Share2,
  PenLine,
} from 'lucide-react';
import { PullToRefresh } from '@/components/ui/pull-to-refresh';
import { PrintButton } from '@/components/ui/print-button';
import type { Plan, Player, PlanType, Session } from '@/types/database';
import type { ObservationInsights } from '@/app/api/ai/plan/route';
import { getCategoryLabel, getCategoryColor } from '@/lib/coach-reflection-utils';

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
  opponent_profile: { label: 'Scouting Profile', icon: Swords, color: 'text-red-400' },
  game_recap: { label: 'Game Recap', icon: Radio, color: 'text-rose-400' },
  weekly_star: { label: 'Weekly Star', icon: Star, color: 'text-amber-400' },
  season_summary: { label: 'Season Summary', icon: BarChart2, color: 'text-cyan-400' },
  coach_reflection: { label: 'Coach Reflection', icon: PenLine, color: 'text-purple-400' },
  player_messages: { label: 'Player Messages', icon: MessageSquare, color: 'text-teal-400' },
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
  const { activeTeam, coach } = useActiveTeam();
  const router = useRouter();
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

  // Game Day Prep state
  const [showGamedayForm, setShowGamedayForm] = useState(false);
  const [generatingGameday, setGeneratingGameday] = useState(false);
  const [gamedayOpponent, setGamedayOpponent] = useState('');
  const [gamedayStrengths, setGamedayStrengths] = useState('');
  const [gamedayWeaknesses, setGamedayWeaknesses] = useState('');
  const [gamedayKeyPlayers, setGamedayKeyPlayers] = useState('');
  const [gamedayNotes, setGamedayNotes] = useState('');

  // Opponent Scouting Library state
  const [savingOpponentProfile, setSavingOpponentProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [showProfilePicker, setShowProfilePicker] = useState(false);

  // Season Summary state
  const [generatingSeasonSummary, setGeneratingSeasonSummary] = useState(false);
  const [seasonSummaryStats, setSeasonSummaryStats] = useState<{ observationsAnalyzed: number; sessionsIncluded: number; playersObserved: number; weeksOfData: number; healthScore: number; dateRange: string } | null>(null);
  const [seasonSummaryCopied, setSeasonSummaryCopied] = useState(false);

  // Run Practice modal state
  const [showRunModal, setShowRunModal] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);

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

  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: todaySessions = [] } = useQuery({
    queryKey: ['sessions-today', activeTeam?.id, todayStr],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Session[]>({
        table: 'sessions',
        select: 'id, type, date, start_time, location',
        filters: { team_id: activeTeam.id, date: todayStr },
        order: { column: 'start_time', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam && showRunModal,
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

  const generateSeasonSummary = async () => {
    if (!activeTeam) return;
    setGeneratingSeasonSummary(true);
    setError(null);
    setSeasonSummaryStats(null);
    try {
      const res = await fetch('/api/ai/season-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate season summary');
      }
      const data = await res.json();
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setSelectedPlan(data.plan);
      if (data.stats) setSeasonSummaryStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Season summary generation failed');
    } finally {
      setGeneratingSeasonSummary(false);
    }
  };

  const generateGamedayPrep = async () => {
    if (!activeTeam || !gamedayOpponent.trim()) return;
    setGeneratingGameday(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          type: 'gameday',
          opponent: gamedayOpponent.trim(),
          opponentStrengths: splitLine(gamedayStrengths),
          opponentWeaknesses: splitLine(gamedayWeaknesses),
          keyOpponentPlayers: splitLine(gamedayKeyPlayers),
          gameNotes: gamedayNotes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate game day prep');
      }
      const data = await res.json();
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setSelectedPlan(data.plan);
      setShowGamedayForm(false);
      setGamedayOpponent('');
      setGamedayStrengths('');
      setGamedayWeaknesses('');
      setGamedayKeyPlayers('');
      setGamedayNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Game day prep generation failed');
    } finally {
      setGeneratingGameday(false);
    }
  };

  const splitLine = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const saveOpponentProfile = async () => {
    if (!activeTeam || !gamedayOpponent.trim()) return;
    setSavingOpponentProfile(true);
    try {
      // Check if a profile for this opponent already exists (case-insensitive)
      const existing = plans?.find(
        (p) => p.type === 'opponent_profile' && p.title?.toLowerCase() === gamedayOpponent.trim().toLowerCase()
      );
      if (existing) {
        // Update existing profile
        await mutate({
          table: 'plans',
          operation: 'update',
          filters: { id: existing.id },
          data: {
            content: `Scouting Profile: ${gamedayOpponent.trim()}`,
            content_structured: {
              name: gamedayOpponent.trim(),
              strengths: splitLine(gamedayStrengths),
              weaknesses: splitLine(gamedayWeaknesses),
              key_players: splitLine(gamedayKeyPlayers),
              notes: gamedayNotes.trim(),
            },
          },
        });
      } else {
        await mutate({
          table: 'plans',
          operation: 'insert',
          data: {
            team_id: activeTeam.id,
            type: 'opponent_profile' as PlanType,
            title: gamedayOpponent.trim(),
            content: `Scouting Profile: ${gamedayOpponent.trim()}`,
            content_structured: {
              name: gamedayOpponent.trim(),
              strengths: splitLine(gamedayStrengths),
              weaknesses: splitLine(gamedayWeaknesses),
              key_players: splitLine(gamedayKeyPlayers),
              notes: gamedayNotes.trim(),
            },
          },
        });
      }
      qc.invalidateQueries({ queryKey: queryKeys.plans.all(activeTeam.id) });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 3000);
    } finally {
      setSavingOpponentProfile(false);
    }
  };

  const loadOpponentProfile = (plan: Plan) => {
    const cs = plan.content_structured as any;
    if (!cs) return;
    setGamedayOpponent(cs.name || plan.title || '');
    setGamedayStrengths(Array.isArray(cs.strengths) ? cs.strengths.join(', ') : (cs.strengths || ''));
    setGamedayWeaknesses(Array.isArray(cs.weaknesses) ? cs.weaknesses.join(', ') : (cs.weaknesses || ''));
    setGamedayKeyPlayers(Array.isArray(cs.key_players) ? cs.key_players.join(', ') : (cs.key_players || ''));
    setGamedayNotes(cs.notes || '');
    setShowProfilePicker(false);
    setShowGamedayForm(true);
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

  async function handleRunWithSession(sessionId: string, planId: string) {
    router.push(`/sessions/${sessionId}/timer?planId=${planId}`);
    setShowRunModal(false);
  }

  async function handleCreateAndRun(planId: string) {
    if (!activeTeam || !coach) return;
    setCreatingSession(true);
    try {
      const newSession = await mutate({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          type: 'practice',
          date: new Date().toISOString().slice(0, 10),
        },
      });
      const sessionId = (newSession as any)?.[0]?.id || (newSession as any)?.id;
      if (sessionId) {
        router.push(`/sessions/${sessionId}/timer?planId=${planId}`);
        setShowRunModal(false);
      }
    } catch {
      // ignore — user can try again
    } finally {
      setCreatingSession(false);
    }
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

    // Game Day Sheet renderer
    if (structured.game_plan && (structured.opponent !== undefined || structured.pregame_message !== undefined || structured.scouting_report !== undefined)) {
      const gp = structured.game_plan;
      const sr = structured.scouting_report;
      const threatColor = (level: string) => {
        if (level === 'high') return 'text-red-400 bg-red-500/10 border-red-500/20';
        if (level === 'medium') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
        return 'text-zinc-400 bg-zinc-800 border-zinc-700';
      };
      return (
        <div className="space-y-5">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Trophy className="h-5 w-5 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-emerald-400">Game Day Prep</span>
            </div>
            {structured.title && <h2 className="text-xl font-bold text-zinc-100">{structured.title}</h2>}
            {structured.opponent && <p className="text-sm text-zinc-400">vs. {structured.opponent}</p>}
          </div>

          {/* Pregame Message */}
          {structured.pregame_message && (
            <div className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300">Pregame Message</p>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed italic">&ldquo;{structured.pregame_message}&rdquo;</p>
            </div>
          )}

          {/* Scouting Report */}
          {sr && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-semibold text-zinc-200">Scouting Report</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.isArray(sr.opponent_strengths) && sr.opponent_strengths.length > 0 && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Swords className="h-3.5 w-3.5 text-red-400" />
                      <p className="text-xs font-semibold text-red-300 uppercase tracking-wider">Their Strengths</p>
                    </div>
                    <ul className="space-y-1">
                      {sr.opponent_strengths.map((s: string, i: number) => (
                        <li key={i} className="text-xs text-zinc-400 flex gap-2 items-start"><span className="text-red-500 mt-0.5 shrink-0">!</span>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(sr.opponent_weaknesses) && sr.opponent_weaknesses.length > 0 && (
                  <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-emerald-400" />
                      <p className="text-xs font-semibold text-emerald-300 uppercase tracking-wider">Exploit</p>
                    </div>
                    <ul className="space-y-1">
                      {sr.opponent_weaknesses.map((w: string, i: number) => (
                        <li key={i} className="text-xs text-zinc-400 flex gap-2 items-start"><span className="text-emerald-500 mt-0.5 shrink-0">✓</span>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {Array.isArray(sr.key_players_to_watch) && sr.key_players_to_watch.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Eye className="h-3.5 w-3.5" />Key Players to Watch
                  </p>
                  <div className="space-y-2">
                    {sr.key_players_to_watch.map((kp: any, i: number) => (
                      <div key={i} className={`rounded-lg border px-3 py-2.5 ${threatColor(kp.threat_level)}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-semibold">{kp.name}</p>
                          {kp.threat_level && (
                            <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full border border-current">{kp.threat_level}</span>
                          )}
                        </div>
                        {kp.defensive_assignment && <p className="text-xs opacity-80">Assignment: {kp.defensive_assignment}</p>}
                        {kp.notes && <p className="text-xs opacity-70 mt-0.5">{kp.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Game Plan */}
          {gp && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.isArray(gp.offensive_focus) && gp.offensive_focus.length > 0 && (
                  <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Swords className="h-3.5 w-3.5 text-blue-400" />
                      <p className="text-xs font-semibold text-blue-300 uppercase tracking-wider">Offensive Focus</p>
                    </div>
                    <ul className="space-y-1.5">
                      {gp.offensive_focus.map((f: string, i: number) => (
                        <li key={i} className="text-xs text-zinc-300 flex gap-2 items-start"><span className="text-blue-500 shrink-0 mt-0.5">→</span>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(gp.defensive_focus) && gp.defensive_focus.length > 0 && (
                  <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Shield className="h-3.5 w-3.5 text-orange-400" />
                      <p className="text-xs font-semibold text-orange-300 uppercase tracking-wider">Defensive Focus</p>
                    </div>
                    <ul className="space-y-1.5">
                      {gp.defensive_focus.map((f: string, i: number) => (
                        <li key={i} className="text-xs text-zinc-300 flex gap-2 items-start"><span className="text-orange-500 shrink-0 mt-0.5">→</span>{f}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {Array.isArray(gp.key_matchups) && gp.key_matchups.length > 0 && (
                <div className="rounded-xl border border-zinc-700 bg-zinc-900/30 p-3 space-y-2">
                  <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Key Matchups</p>
                  <ul className="space-y-1">
                    {gp.key_matchups.map((m: string, i: number) => (
                      <li key={i} className="text-xs text-zinc-400 flex gap-2"><span className="text-zinc-600">⚡</span>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Array.isArray(gp.set_plays) && gp.set_plays.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-purple-300 uppercase tracking-wider">Set Plays</p>
                  <div className="space-y-2">
                    {gp.set_plays.map((play: any, i: number) => (
                      <div key={i} className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
                        <p className="text-sm font-semibold text-purple-300">{play.name}</p>
                        <p className="text-xs text-zinc-400 mt-1">{play.description}</p>
                        {play.use_when && <p className="text-xs text-purple-400/70 mt-1 italic">Use when: {play.use_when}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Lineup */}
          {Array.isArray(structured.lineup) && structured.lineup.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Suggested Lineup</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {structured.lineup.map((p: any, i: number) => (
                  <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-semibold text-zinc-100">{p.player_name}</p>
                      <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">{p.position}</span>
                    </div>
                    {Array.isArray(p.focus_areas) && p.focus_areas.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.focus_areas.map((fa: string, j: number) => (
                          <span key={j} className="text-xs text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">{fa}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Substitution Plan */}
          {structured.substitution_plan && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/30 p-4">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">Substitution Plan</p>
              <p className="text-sm text-zinc-300">{structured.substitution_plan}</p>
            </div>
          )}

          {/* Halftime Adjustments */}
          {Array.isArray(structured.halftime_adjustments) && structured.halftime_adjustments.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">Halftime Adjustments</p>
              <ul className="space-y-1.5">
                {structured.halftime_adjustments.map((a: string, i: number) => (
                  <li key={i} className="text-xs text-zinc-300 flex gap-2 items-start"><span className="text-amber-500 shrink-0 mt-0.5">→</span>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Coaching Reminders */}
          {Array.isArray(structured.coaching_reminders) && structured.coaching_reminders.length > 0 && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4 space-y-2">
              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Sideline Reminders</p>
              <div className="flex flex-wrap gap-2">
                {structured.coaching_reminders.map((r: string, i: number) => (
                  <span key={i} className="text-xs text-zinc-300 bg-zinc-800 border border-zinc-700 rounded-full px-3 py-1">{r}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      );
    }

    // Opponent Scouting Profile renderer
    if (structured.name && (structured.strengths !== undefined || structured.weaknesses !== undefined || structured.key_players !== undefined)) {
      return (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3 pb-3 border-b border-zinc-800">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/15">
              <Swords className="h-5 w-5 text-red-400" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-red-400">Scouting Profile</p>
              <h2 className="text-lg font-bold text-zinc-100">{structured.name}</h2>
            </div>
          </div>

          {/* Strengths */}
          {Array.isArray(structured.strengths) && structured.strengths.length > 0 && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Swords className="h-4 w-4 text-red-400" />
                <p className="text-sm font-semibold text-red-300">Their Strengths</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {structured.strengths.map((s: string, i: number) => (
                  <span key={i} className="text-xs bg-red-500/10 text-red-300 border border-red-500/20 rounded-full px-2.5 py-1">{s}</span>
                ))}
              </div>
            </div>
          )}

          {/* Weaknesses */}
          {Array.isArray(structured.weaknesses) && structured.weaknesses.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-semibold text-emerald-300">Their Weaknesses</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {structured.weaknesses.map((w: string, i: number) => (
                  <span key={i} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full px-2.5 py-1">{w}</span>
                ))}
              </div>
            </div>
          )}

          {/* Key Players */}
          {Array.isArray(structured.key_players) && structured.key_players.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Eye className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-semibold text-amber-300">Key Players to Watch</p>
              </div>
              <div className="space-y-1.5">
                {structured.key_players.map((kp: string, i: number) => (
                  <p key={i} className="text-sm text-zinc-300 flex gap-2"><span className="text-amber-500">•</span>{kp}</p>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          {structured.notes && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/40 p-4">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Scouting Notes</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{structured.notes}</p>
            </div>
          )}

          {/* Action: Load into Game Day form */}
          <button
            type="button"
            onClick={() => {
              if (selectedPlan) {
                loadOpponentProfile(selectedPlan);
                setSelectedPlan(null);
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors touch-manipulation active:scale-[0.98]"
          >
            <Zap className="h-4 w-4" />
            Load into Game Day Prep Form
          </button>
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

    // Game Recap renderer
    if (structured.result_headline || structured.key_moments) {
      const resultColor = (headline: string) => {
        const lower = (headline || '').toLowerCase();
        if (lower.includes('victor') || lower.includes('win') || lower.includes('triumph') || lower.includes('defeat') && !lower.includes('we')) return 'text-emerald-400';
        if (lower.includes('loss') || lower.includes('tough') || lower.includes('fell') || lower.includes('defeat')) return 'text-red-400';
        if (lower.includes('tie') || lower.includes('draw')) return 'text-zinc-400';
        return 'text-orange-400';
      };
      return (
        <div className="space-y-5">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Radio className="h-5 w-5 text-rose-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-rose-400">Game Recap</span>
            </div>
            {structured.title && <h2 className="text-xl font-bold text-zinc-100">{structured.title}</h2>}
            {structured.result_headline && (
              <p className={`text-base font-semibold ${resultColor(structured.result_headline)}`}>
                {structured.result_headline}
              </p>
            )}
          </div>

          {/* Intro narrative */}
          {structured.intro && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <p className="text-sm text-zinc-200 leading-relaxed">{structured.intro}</p>
            </div>
          )}

          {/* Key Moments */}
          {Array.isArray(structured.key_moments) && structured.key_moments.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-semibold text-zinc-200">Key Moments</p>
              </div>
              <div className="space-y-2">
                {structured.key_moments.map((moment: any, i: number) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100">{moment.headline}</p>
                      {moment.player_name && (
                        <span className="text-xs font-medium text-orange-400 shrink-0">{moment.player_name}</span>
                      )}
                    </div>
                    {moment.description && (
                      <p className="text-xs text-zinc-400 leading-relaxed">{moment.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player Highlights */}
          {Array.isArray(structured.player_highlights) && structured.player_highlights.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-400" />
                <p className="text-sm font-semibold text-zinc-200">Player Highlights</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {structured.player_highlights.map((ph: any, i: number) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5 space-y-1">
                    <p className="text-sm font-semibold text-orange-400">{ph.player_name}</p>
                    <p className="text-xs text-zinc-300 leading-relaxed">{ph.highlight}</p>
                    {ph.stat_line && (
                      <p className="text-xs font-medium text-zinc-500 mt-1">{ph.stat_line}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Performance */}
          {structured.team_performance && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                <p className="text-sm font-semibold text-zinc-200">Team Performance</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5 space-y-2.5">
                {structured.team_performance.offensive_note && (
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Offense</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{structured.team_performance.offensive_note}</p>
                  </div>
                )}
                {structured.team_performance.defensive_note && (
                  <div className="border-t border-blue-500/10 pt-2.5">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Defense</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{structured.team_performance.defensive_note}</p>
                  </div>
                )}
                {structured.team_performance.effort_note && (
                  <div className="border-t border-blue-500/10 pt-2.5">
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">Effort & Hustle</p>
                    <p className="text-sm text-zinc-300 leading-relaxed">{structured.team_performance.effort_note}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Coach Message */}
          {structured.coach_message && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-zinc-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">From the Coach</p>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed italic">&ldquo;{structured.coach_message}&rdquo;</p>
            </div>
          )}

          {/* Looking Ahead */}
          {structured.looking_ahead && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <TrendingUp className="h-4 w-4 text-orange-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">Looking Ahead</p>
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{structured.looking_ahead}</p>
            </div>
          )}
        </div>
      );
    }

    // Weekly Star renderer
    if (structured.headline && structured.achievement && structured.coach_shoutout) {
      return (
        <div className="space-y-5">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Star className="h-5 w-5 text-amber-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">Weekly Star</span>
            </div>
            {structured.week_label && (
              <p className="text-xs text-zinc-500">Week of {structured.week_label}</p>
            )}
            {structured.player_name && (
              <h2 className="text-xl font-bold text-amber-300">{structured.player_name}</h2>
            )}
            {structured.headline && (
              <p className="text-sm font-medium text-zinc-300">{structured.headline}</p>
            )}
          </div>

          {/* Achievement */}
          {structured.achievement && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
              <p className="text-sm text-zinc-200 leading-relaxed">{structured.achievement}</p>
            </div>
          )}

          {/* Growth Moment */}
          {structured.growth_moment && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-semibold text-zinc-200">Growth Moment</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3.5">
                <p className="text-sm text-zinc-300 leading-relaxed">{structured.growth_moment}</p>
              </div>
            </div>
          )}

          {/* Challenge Ahead */}
          {structured.challenge_ahead && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-blue-400" />
                <p className="text-sm font-semibold text-zinc-200">Keep Building</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3.5">
                <p className="text-sm text-zinc-300 leading-relaxed">{structured.challenge_ahead}</p>
              </div>
            </div>
          )}

          {/* Coach Shoutout */}
          {structured.coach_shoutout && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="h-4 w-4 text-zinc-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">From the Coach</p>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed italic">&ldquo;{structured.coach_shoutout}&rdquo;</p>
            </div>
          )}
        </div>
      );
    }

    // Season Summary renderer
    if (structured.headline && structured.overall_assessment && structured.next_season_priorities) {
      const skillStatusBadge = (status: string) => {
        switch (status) {
          case 'strength':      return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400';
          case 'most_improved': return 'border-blue-500/30 bg-blue-500/10 text-blue-400';
          case 'needs_work':    return 'border-red-500/30 bg-red-500/10 text-red-400';
          default:              return 'border-zinc-600/30 bg-zinc-800/30 text-zinc-400';
        }
      };
      const skillStatusLabel = (status: string) => {
        switch (status) {
          case 'strength':      return 'Strength';
          case 'most_improved': return 'Most Improved';
          case 'needs_work':    return 'Needs Work';
          default:              return 'Consistent';
        }
      };
      return (
        <div className="space-y-5">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <BarChart2 className="h-5 w-5 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Season Summary</span>
            </div>
            {structured.season_period && (
              <p className="text-xs text-zinc-500">{structured.season_period}</p>
            )}
            <h2 className="text-xl font-bold text-zinc-100">{structured.headline}</h2>
          </div>

          {/* Overall Assessment */}
          {structured.overall_assessment && (
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
              <p className="text-sm text-zinc-200 leading-relaxed">{structured.overall_assessment}</p>
            </div>
          )}

          {/* Team Highlights */}
          {Array.isArray(structured.team_highlights) && structured.team_highlights.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-400" />
                <p className="text-sm font-semibold text-zinc-200">Season Highlights</p>
              </div>
              <div className="space-y-2">
                {structured.team_highlights.map((h: any, i: number) => (
                  <div key={i} className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5 space-y-1">
                    <p className="text-sm font-semibold text-amber-300">{h.title}</p>
                    {h.description && (
                      <p className="text-xs text-zinc-400 leading-relaxed">{h.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skill Progress */}
          {Array.isArray(structured.skill_progress) && structured.skill_progress.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                <p className="text-sm font-semibold text-zinc-200">Skill Progress</p>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {structured.skill_progress.map((sp: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3.5">
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${skillStatusBadge(sp.status)}`}>
                      {skillStatusLabel(sp.status)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200">{sp.skill}</p>
                      {sp.description && (
                        <p className="text-xs text-zinc-500 leading-relaxed mt-0.5">{sp.description}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Player Breakthroughs */}
          {Array.isArray(structured.player_breakthroughs) && structured.player_breakthroughs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-400" />
                <p className="text-sm font-semibold text-zinc-200">Player Breakthroughs</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {structured.player_breakthroughs.map((pb: any, i: number) => (
                  <div key={i} className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-3.5 space-y-1">
                    <p className="text-sm font-semibold text-orange-400">{pb.player_name}</p>
                    <p className="text-xs text-zinc-300 leading-relaxed">{pb.achievement}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Team Challenges */}
          {Array.isArray(structured.team_challenges) && structured.team_challenges.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-red-400" />
                <p className="text-sm font-semibold text-zinc-200">Areas to Address</p>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3.5 space-y-1.5">
                {structured.team_challenges.map((c: string, i: number) => (
                  <p key={i} className="text-sm text-zinc-300 leading-relaxed">• {c}</p>
                ))}
              </div>
            </div>
          )}

          {/* Coaching Insights */}
          {structured.coaching_insights && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-zinc-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Coaching Insights</p>
              </div>
              <p className="text-sm text-zinc-200 leading-relaxed">{structured.coaching_insights}</p>
            </div>
          )}

          {/* Next Season Priorities */}
          {Array.isArray(structured.next_season_priorities) && structured.next_season_priorities.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <BookmarkPlus className="h-4 w-4 text-cyan-400" />
                <p className="text-sm font-semibold text-zinc-200">Next Season Priorities</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3.5 space-y-1.5">
                {structured.next_season_priorities.map((p: string, i: number) => (
                  <p key={i} className="text-sm text-zinc-300 leading-relaxed">→ {p}</p>
                ))}
              </div>
            </div>
          )}

          {/* Closing Message */}
          {structured.closing_message && (
            <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-transparent p-4">
              <p className="text-sm text-zinc-200 leading-relaxed italic text-center">&ldquo;{structured.closing_message}&rdquo;</p>
            </div>
          )}

          {/* Share button */}
          <button
            onClick={async () => {
              const teamName = activeTeam?.name || 'Team';
              const text = [
                `📊 ${teamName} — Season Summary`,
                structured.season_period || '',
                '',
                structured.headline,
                '',
                structured.overall_assessment,
                '',
                Array.isArray(structured.next_season_priorities) && structured.next_season_priorities.length > 0
                  ? '🎯 Next Season: ' + (structured.next_season_priorities as string[]).join(', ')
                  : '',
                '',
                'Generated with SportsIQ',
              ].filter(Boolean).join('\n');
              try {
                if (navigator.share) {
                  await navigator.share({ title: `${teamName} Season Summary`, text });
                } else {
                  await navigator.clipboard.writeText(text);
                  setSeasonSummaryCopied(true);
                  setTimeout(() => setSeasonSummaryCopied(false), 2000);
                }
              } catch { /* user cancelled */ }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 py-3 text-sm font-semibold text-cyan-300 transition-all hover:bg-cyan-500/15 active:scale-[0.98] touch-manipulation"
          >
            {seasonSummaryCopied ? (
              <>
                <Check className="h-4 w-4" />
                Copied to clipboard!
              </>
            ) : (
              <>
                <Share2 className="h-4 w-4" />
                Share Season Summary
              </>
            )}
          </button>
        </div>
      );
    }

    // Coach Reflection renderer
    if (structured.session_summary && Array.isArray(structured.questions)) {
      const answers: Record<string, string> = structured.answers || {};
      const answeredCount = structured.questions.filter(
        (q: any) => answers[q.id] && answers[q.id].trim().length > 0
      ).length;

      return (
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <PenLine className="h-5 w-5 text-purple-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-purple-400">Coach Reflection</span>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="text-xs text-zinc-500">
                {answeredCount}/{structured.questions.length} questions answered
              </span>
              {answeredCount === structured.questions.length && (
                <span className="text-xs text-emerald-400 font-medium">· Complete</span>
              )}
            </div>
          </div>

          {/* Session summary */}
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/8 p-4">
            <p className="text-xs font-medium text-purple-300 mb-1.5">Session Overview</p>
            <p className="text-sm text-zinc-300 leading-relaxed">{structured.session_summary}</p>
          </div>

          {/* Q&A */}
          <div className="space-y-5">
            {structured.questions.map((q: any, idx: number) => {
              const answer = answers[q.id];
              const hasAnswer = answer && answer.trim().length > 0;
              return (
                <div key={q.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-300 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 leading-snug">{q.question}</p>
                      <p className={`text-xs mt-0.5 ${getCategoryColor(q.category)}`}>
                        {getCategoryLabel(q.category)}
                        {q.context && ` · ${q.context}`}
                      </p>
                    </div>
                  </div>
                  <div className="ml-7">
                    {hasAnswer ? (
                      <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/60 p-3">
                        <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-600 italic">Not yet answered</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Growth focus */}
          {structured.growth_focus && (
            <div className="flex items-start gap-2 rounded-xl bg-orange-500/8 border border-orange-500/20 p-4">
              <Target className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-orange-300 mb-0.5">Growth Focus for Next Session</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{structured.growth_focus}</p>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Player Session Messages renderer
    if (Array.isArray(structured.messages) && structured.session_label !== undefined) {
      return (
        <div className="space-y-6">
          {/* Header */}
          <div className="text-center space-y-1 pb-4 border-b border-zinc-800">
            <div className="flex items-center justify-center gap-2 mb-2">
              <MessageSquare className="h-5 w-5 text-teal-400" />
              <span className="text-xs font-semibold uppercase tracking-widest text-teal-400">Player Messages</span>
            </div>
            <p className="text-sm text-zinc-400">{structured.session_label}</p>
            <Badge variant="secondary" className="text-xs">{structured.messages.length} players</Badge>
          </div>

          {/* Per-player messages */}
          <div className="space-y-4">
            {(structured.messages as any[]).map((msg: any, idx: number) => (
              <div key={idx} className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-teal-300">{msg.player_name}</p>
                </div>
                <p className="text-sm text-zinc-200 leading-relaxed">{msg.message}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-0.5">Highlight</p>
                    <p className="text-xs text-zinc-300">{msg.highlight}</p>
                  </div>
                  <div className="rounded-lg bg-orange-500/8 border border-orange-500/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400 mb-0.5">Next Focus</p>
                    <p className="text-xs text-zinc-300">{msg.next_focus}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Team note */}
          {structured.team_note && (
            <div className="flex items-start gap-2 rounded-xl bg-zinc-800/60 border border-zinc-700 p-4">
              <Users className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-zinc-400 mb-0.5">Team Note</p>
                <p className="text-sm text-zinc-300 leading-relaxed">{structured.team_note}</p>
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
          <div className="flex items-center gap-2">
            {selectedPlan.type === 'practice' && (
              <Button
                onClick={() => setShowRunModal(true)}
                className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 px-3 text-sm"
              >
                <Play className="h-4 w-4" />
                Run Practice
              </Button>
            )}
            <PrintButton label="Print / PDF" />
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
        </div>

        {/* Run Practice modal */}
        {showRunModal && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowRunModal(false); }}
            role="dialog"
            aria-modal="true"
            aria-label="Select session to run practice"
          >
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Timer className="h-5 w-5 text-orange-500" />
                  <h2 className="text-lg font-bold">Run Practice</h2>
                </div>
                <button
                  onClick={() => setShowRunModal(false)}
                  aria-label="Close modal"
                  className="text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-zinc-400">
                Choose a session to run this plan&apos;s drills as a timed practice.
              </p>

              {todaySessions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Today&apos;s sessions</p>
                  {todaySessions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => handleRunWithSession(s.id, selectedPlan.id)}
                      className="w-full flex items-center gap-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-4 py-3 text-left transition-colors"
                    >
                      <Radio className="h-4 w-4 text-orange-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-200 capitalize">{s.type || 'Practice'}</p>
                        {(s.start_time || s.location) && (
                          <p className="text-xs text-zinc-500 truncate">
                            {s.start_time ? s.start_time.slice(0, 5) : ''}{s.start_time && s.location ? ' · ' : ''}{s.location || ''}
                          </p>
                        )}
                      </div>
                      <Play className="h-4 w-4 text-zinc-500 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-zinc-800 pt-3">
                <button
                  onClick={() => handleCreateAndRun(selectedPlan.id)}
                  disabled={creatingSession}
                  className="w-full flex items-center gap-3 bg-orange-500/10 hover:bg-orange-500/20 border border-orange-500/30 rounded-xl px-4 py-3 text-left transition-colors disabled:opacity-50"
                >
                  {creatingSession ? (
                    <Loader2 className="h-4 w-4 text-orange-400 animate-spin shrink-0" />
                  ) : (
                    <Plus className="h-4 w-4 text-orange-400 shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm font-medium text-orange-300">
                      {creatingSession ? 'Creating…' : 'Create new session & start'}
                    </p>
                    <p className="text-xs text-zinc-500">Adds a practice session for today</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}

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
            aria-label="Dismiss error"
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

            {/* Season Summary — whole team */}
            <button
              onClick={generateSeasonSummary}
              disabled={generatingSeasonSummary || generating || !activeTeam}
              className="flex w-full items-center gap-2.5 rounded-xl border border-cyan-500/40 bg-gradient-to-r from-cyan-500/15 to-cyan-500/5 px-4 py-3 text-left transition-all hover:border-cyan-500/60 hover:from-cyan-500/20 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-500/25">
                {generatingSeasonSummary ? (
                  <Loader2 className="h-4 w-4 text-cyan-400 animate-spin" />
                ) : (
                  <BarChart2 className="h-4 w-4 text-cyan-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-cyan-300">Season Summary</p>
                <p className="text-xs text-zinc-500">AI-generated team season recap with highlights &amp; next-season priorities</p>
              </div>
              <Activity className="h-4 w-4 text-cyan-500/50 shrink-0" />
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

            {/* Game Day Prep — scouting-based */}
            <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-emerald-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowGamedayForm((v) => !v)}
                disabled={generatingGameday || generating || !activeTeam}
                className="flex w-full items-center gap-2.5 p-3 text-left transition-all hover:from-emerald-500/20 active:scale-[0.98] disabled:opacity-50 touch-manipulation"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/25">
                  {generatingGameday ? (
                    <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
                  ) : (
                    <Trophy className="h-4 w-4 text-emerald-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-emerald-300">Game Day Prep</p>
                  <p className="text-xs text-zinc-500">Scouting-based AI prep sheet with matchups &amp; strategy</p>
                </div>
                {showGamedayForm ? (
                  <ChevronUp className="h-4 w-4 text-emerald-500/60 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-emerald-500/60 shrink-0" />
                )}
              </button>

              {showGamedayForm && (
                <div className="border-t border-emerald-500/20 p-3 space-y-3">
                  {/* Scouting Library picker */}
                  {(() => {
                    const savedProfiles = plans?.filter((p) => p.type === 'opponent_profile') ?? [];
                    if (savedProfiles.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setShowProfilePicker((v) => !v)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800/50 transition-colors touch-manipulation"
                        >
                          <BookOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          <span className="text-xs font-medium text-zinc-300 flex-1">Scouting Library</span>
                          <span className="text-xs text-zinc-500 bg-zinc-800 rounded-full px-1.5 py-0.5">{savedProfiles.length}</span>
                          <ChevronDown className={`h-3 w-3 text-zinc-500 transition-transform ${showProfilePicker ? 'rotate-180' : ''}`} />
                        </button>
                        {showProfilePicker && (
                          <div className="border-t border-zinc-700/60 divide-y divide-zinc-800">
                            {savedProfiles.map((profile) => {
                              const cs = profile.content_structured as any;
                              return (
                                <button
                                  key={profile.id}
                                  type="button"
                                  onClick={() => loadOpponentProfile(profile)}
                                  className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-800/60 transition-colors touch-manipulation"
                                >
                                  <Swords className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-zinc-200 truncate">{profile.title}</p>
                                    {cs && Array.isArray(cs.strengths) && cs.strengths.length > 0 && (
                                      <p className="text-xs text-zinc-500 truncate mt-0.5">
                                        Strengths: {cs.strengths.slice(0, 2).join(', ')}{cs.strengths.length > 2 ? '…' : ''}
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-xs text-emerald-500 shrink-0 font-medium">Load →</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 block">Opponent Name <span className="text-red-400">*</span></label>
                    <input
                      type="text"
                      value={gamedayOpponent}
                      onChange={(e) => setGamedayOpponent(e.target.value)}
                      placeholder="e.g. Riverside Hawks"
                      disabled={generatingGameday}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
                      <Swords className="h-3 w-3 text-red-400" />
                      Their Strengths <span className="text-zinc-600">(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={gamedayStrengths}
                      onChange={(e) => setGamedayStrengths(e.target.value)}
                      placeholder="e.g. fast breaks, strong post play, press defense"
                      disabled={generatingGameday}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
                      <Shield className="h-3 w-3 text-emerald-400" />
                      Their Weaknesses <span className="text-zinc-600">(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={gamedayWeaknesses}
                      onChange={(e) => setGamedayWeaknesses(e.target.value)}
                      placeholder="e.g. weak perimeter shooting, poor ball handling under pressure"
                      disabled={generatingGameday}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
                      <Eye className="h-3 w-3 text-amber-400" />
                      Key Opponent Players <span className="text-zinc-600">(comma-separated)</span>
                    </label>
                    <input
                      type="text"
                      value={gamedayKeyPlayers}
                      onChange={(e) => setGamedayKeyPlayers(e.target.value)}
                      placeholder="e.g. #23 tall center, #5 fast point guard"
                      disabled={generatingGameday}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-400 mb-1 flex items-center gap-1.5">
                      <MessageSquare className="h-3 w-3 text-zinc-400" />
                      Additional Notes <span className="text-zinc-600">(optional)</span>
                    </label>
                    <textarea
                      value={gamedayNotes}
                      onChange={(e) => setGamedayNotes(e.target.value)}
                      placeholder="Any other scouting notes, game location, weather, etc."
                      disabled={generatingGameday}
                      rows={2}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50 disabled:opacity-50 resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={generateGamedayPrep}
                      disabled={!gamedayOpponent.trim() || generatingGameday || !activeTeam}
                      className="flex-1 h-10 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium disabled:opacity-30 touch-manipulation active:scale-[0.98]"
                    >
                      {generatingGameday ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating prep sheet...
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <Zap className="h-4 w-4" />
                          Generate Game Day Prep
                        </span>
                      )}
                    </Button>
                    <button
                      type="button"
                      onClick={saveOpponentProfile}
                      disabled={!gamedayOpponent.trim() || savingOpponentProfile || !activeTeam}
                      aria-label="Save opponent to scouting library"
                      title={profileSaved ? 'Saved to library!' : 'Save to Scouting Library'}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors touch-manipulation active:scale-[0.98] disabled:opacity-30 ${
                        profileSaved
                          ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                          : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-emerald-500/40 hover:text-emerald-400'
                      }`}
                    >
                      {savingOpponentProfile ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : profileSaved ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <BookmarkPlus className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {profileSaved && (
                    <p className="text-xs text-emerald-400 flex items-center gap-1.5 -mt-1">
                      <Check className="h-3 w-3" />
                      Saved to Scouting Library — load it next time from the library above
                    </p>
                  )}
                </div>
              )}
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

          {/* Season Summary generating indicator */}
          {generatingSeasonSummary && (
            <div className="flex items-center gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
              <Loader2 className="h-5 w-5 text-cyan-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-cyan-300">Writing season summary...</p>
                <p className="text-xs text-zinc-500">Analyzing all observations and crafting your team&apos;s season narrative</p>
              </div>
            </div>
          )}

          {/* Season Summary stats badge */}
          {!generatingSeasonSummary && seasonSummaryStats && (
            <div className="flex items-start gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
              <BarChart2 className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-cyan-300">Season Summary generated</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {seasonSummaryStats.dateRange} &middot; {seasonSummaryStats.observationsAnalyzed} obs &middot; {seasonSummaryStats.sessionsIncluded} sessions &middot; {seasonSummaryStats.healthScore}% health
                </p>
              </div>
              <button
                onClick={() => setSeasonSummaryStats(null)}
                className="text-zinc-600 hover:text-zinc-400 shrink-0"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
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

          {/* Game Day Prep generating indicator */}
          {generatingGameday && (
            <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
              <Loader2 className="h-5 w-5 text-emerald-400 animate-spin" />
              <div>
                <p className="text-sm font-medium text-emerald-300">Building game day prep sheet...</p>
                <p className="text-xs text-zinc-500">Analyzing scouting notes and generating matchup strategies</p>
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
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex items-start gap-3">
                <Activity className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-emerald-300">
                    Trend-driven plan generated
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Analyzed {lastInsights.totalObs} observation{lastInsights.totalObs !== 1 ? 's' : ''} across two 7-day windows
                    {lastInsights.trendData && (
                      <> · {lastInsights.trendData.totalRecentObs} recent vs {lastInsights.trendData.totalPriorObs} prior</>
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
              {lastInsights.trendData && (lastInsights.trendData.declining.length > 0 || lastInsights.trendData.persistent.length > 0 || lastInsights.trendData.improving.length > 0) && (
                <div className="space-y-1.5 pl-7">
                  {lastInsights.trendData.declining.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-red-400 shrink-0 mt-0.5">↑ Declining</span>
                      <div className="flex flex-wrap gap-1">
                        {lastInsights.trendData.declining.map((e) => (
                          <span key={e.category} className="text-xs bg-red-500/10 text-red-300 border border-red-500/20 rounded-full px-2 py-0.5">
                            {e.category}
                            {e.priorCount > 0 && <span className="text-red-500/60 ml-1">{e.priorCount}→{e.recentCount}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {lastInsights.trendData.persistent.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-amber-400 shrink-0 mt-0.5">! Persistent</span>
                      <div className="flex flex-wrap gap-1">
                        {lastInsights.trendData.persistent.map((cat) => (
                          <span key={cat} className="text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 rounded-full px-2 py-0.5">{cat}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {lastInsights.trendData.improving.length > 0 && (
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-semibold text-emerald-400 shrink-0 mt-0.5">↓ Improving</span>
                      <div className="flex flex-wrap gap-1">
                        {lastInsights.trendData.improving.map((e) => (
                          <span key={e.category} className="text-xs bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 rounded-full px-2 py-0.5">
                            {e.category}
                            {e.recentCount > 0 && <span className="text-emerald-600/70 ml-1">{e.priorCount}→{e.recentCount}</span>}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {(!lastInsights.trendData || (lastInsights.trendData.declining.length === 0 && lastInsights.trendData.persistent.length === 0 && lastInsights.trendData.improving.length === 0)) && lastInsights.topNeedsWork.length > 0 && (
                <p className="text-xs text-zinc-500 pl-7">
                  Targeting: <span className="text-zinc-400">{lastInsights.topNeedsWork.slice(0, 3).map((c) => c.category).join(', ')}</span>
                </p>
              )}
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
                          aria-label={`Delete ${plan.title || typeConfig.label}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setSelectedPlan(plan)}
                          aria-label={`View ${plan.title || typeConfig.label}`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-600 hover:text-zinc-300 transition-colors"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                          aria-label={isExpanded ? `Collapse ${plan.title || typeConfig.label}` : `Expand ${plan.title || typeConfig.label}`}
                          aria-expanded={isExpanded}
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
