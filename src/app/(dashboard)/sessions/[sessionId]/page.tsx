'use client';

import { useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  MapPin,
  Mic,
  Clock,
  Save,
  Loader2,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  ImagePlus,
  X,
  Sparkles,
  Star,
  Target,
  Lightbulb,
  Dumbbell,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ClipboardList,
  BarChart2,
  Play,
  Shuffle,
  Repeat2,
  Users,
  Zap,
  AlertTriangle,
  Trophy,
  ChevronDown,
  ChevronUp,
  Radio,
  Activity,
  Copy,
  Check,
  BookOpen,
  PenLine,
  Send,
  Share2,
  Plus,
  Eye,
} from 'lucide-react';
import Link from 'next/link';
import type { Session, Observation, Player, Media, SessionType, Sentiment } from '@/types/database';
import type { SessionDebriefResult } from '@/app/api/ai/session-debrief/route';
import type { SessionBriefingResult } from '@/app/api/ai/session-briefing/route';
import type { GameRecapResult } from '@/app/api/ai/game-recap/route';
import type { CoachReflectionResult } from '@/app/api/ai/coach-reflection/route';
import type { HalftimeAdjustments } from '@/app/api/ai/halftime-adjustments/route';
import { getCategoryLabel, getCategoryColor } from '@/lib/coach-reflection-utils';
import {
  getMomentumLabel,
  getMomentumColor,
  getMomentumBannerClasses,
  buildHalftimeShareText,
} from '@/lib/halftime-utils';
import { getRatingLabel, getRatingColor, isValidRating } from '@/lib/session-quality-utils';

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

const SENTIMENT_CONFIG: Record<Sentiment, { icon: typeof CheckCircle2; color: string }> = {
  positive: { icon: CheckCircle2, color: 'text-emerald-400' },
  'needs-work': { icon: AlertCircle, color: 'text-amber-400' },
  neutral: { icon: MinusCircle, color: 'text-zinc-400' },
};

const TONE_CONFIG: Record<
  SessionDebriefResult['overall_tone'],
  { label: string; color: string; bg: string; border: string }
> = {
  great: {
    label: 'Great Session',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  good: {
    label: 'Good Session',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  developing: {
    label: 'Developing',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  struggling: {
    label: 'Needs Focus',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
};

const PLAYER_WATCH_CONFIG: Record<
  SessionBriefingResult['players_to_watch'][number]['type'],
  { label: string; color: string; icon: typeof AlertCircle }
> = {
  needs_attention: { label: 'Needs attention', color: 'text-amber-400', icon: AlertCircle },
  on_a_roll:       { label: 'On a roll',       color: 'text-emerald-400', icon: Trophy },
  returning:       { label: 'Returning',        color: 'text-blue-400',   icon: Users },
  goal_deadline:   { label: 'Goal deadline',    color: 'text-purple-400', icon: Target },
};

const PRIORITY_CONFIG: Record<
  SessionBriefingResult['focus_areas'][number]['priority'],
  { label: string; color: string; bg: string }
> = {
  high:   { label: 'High',   color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
  medium: { label: 'Medium', color: 'text-amber-400',  bg: 'bg-amber-500/10 border-amber-500/20' },
  low:    { label: 'Low',    color: 'text-zinc-400',   bg: 'bg-zinc-700/30 border-zinc-700/50' },
};

// ─── Session Coverage Tracker ─────────────────────────────────────────────────

function SessionCoverageTracker({
  rosterPlayers,
  observations,
  sessionId,
}: {
  rosterPlayers: Player[];
  observations: any[];
  sessionId: string;
}) {
  const [showObserved, setShowObserved] = useState(false);
  const observedIds = new Set(
    observations.filter((o) => o.player_id).map((o) => o.player_id)
  );
  const unobserved = rosterPlayers.filter((p) => !observedIds.has(p.id));
  const observed = rosterPlayers.filter((p) => observedIds.has(p.id));
  const allCovered = unobserved.length === 0;

  return (
    <Card className="border-zinc-800">
      <CardContent className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-400" />
            <span className="text-sm font-medium">Coverage</span>
            <Badge
              className={
                allCovered
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-orange-500/20 text-orange-400 border-orange-500/30'
              }
            >
              {observed.length}/{rosterPlayers.length}
            </Badge>
          </div>
          {observed.length > 0 && (
            <button
              onClick={() => setShowObserved(!showObserved)}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {showObserved ? 'Hide observed' : `Show observed (${observed.length})`}
            </button>
          )}
        </div>

        {allCovered ? (
          <div className="flex items-center gap-1.5 text-emerald-400 text-xs">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Every player observed this session</span>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-zinc-500">Tap a player to add an observation:</p>
            <div className="flex flex-wrap gap-1.5">
              {unobserved.map((player) => (
                <Link
                  key={player.id}
                  href={`/capture?sessionId=${sessionId}&playerId=${player.id}`}
                >
                  <span className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium border border-orange-500/50 text-orange-300 bg-orange-500/10 hover:bg-orange-500/20 active:scale-95 transition-all touch-manipulation">
                    <Plus className="h-3 w-3" />
                    {player.name}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {showObserved && observed.length > 0 && (
          <div className="mt-2 pt-2 border-t border-zinc-800">
            <div className="flex flex-wrap gap-1.5">
              {observed.map((player) => (
                <span
                  key={player.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400"
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {player.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GameRecapCard({
  sessionId,
  teamId,
}: {
  sessionId: string;
  teamId: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recap, setRecap] = useState<GameRecapResult | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/game-recap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate recap');
      }
      const data = await res.json();
      setRecap(data.recap);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!recap) return;
    const lines = [
      recap.title,
      recap.result_headline,
      '',
      recap.intro,
      '',
      '⚡ Key Moments',
      ...(recap.key_moments || []).map((m) => `• ${m.headline}: ${m.description}`),
      '',
      '⭐ Player Highlights',
      ...(recap.player_highlights || []).map((p) => `• ${p.player_name}: ${p.highlight}${p.stat_line ? ` (${p.stat_line})` : ''}`),
      '',
      `💬 "${recap.coach_message}"`,
      '',
      recap.looking_ahead,
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const resultColor = (headline: string) => {
    const lower = (headline || '').toLowerCase();
    if (lower.includes('victor') || lower.includes('win') || lower.includes('triumph')) return 'text-emerald-400';
    if (lower.includes('loss') || lower.includes('tough') || lower.includes('fell')) return 'text-red-400';
    if (lower.includes('tie') || lower.includes('draw')) return 'text-zinc-400';
    return 'text-orange-400';
  };

  return (
    <Card className={recap ? 'border-rose-500/20' : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-5 w-5 text-rose-400" />
            Game Recap
          </CardTitle>
          <div className="flex items-center gap-2">
            {recap && (
              <>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  aria-label="Copy recap to clipboard"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-40"
                  aria-label="Regenerate recap"
                >
                  {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  aria-label={expanded ? 'Collapse recap' : 'Expand recap'}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!recap && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-500/10">
              <Radio className="h-7 w-7 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Generate a shareable game recap</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                AI writes a narrative summary of the game with key moments, player highlights, and a coach&apos;s message — perfect for sharing with parents.
              </p>
            </div>
            <Button
              onClick={handleGenerate}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              <Radio className="h-4 w-4" />
              Generate Recap
            </Button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}

        {isGenerating && !recap && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-rose-400" />
            <p className="text-sm text-zinc-400">Writing game recap...</p>
          </div>
        )}

        {recap && expanded && (
          <div className="space-y-4">
            {/* Result headline */}
            {recap.result_headline && (
              <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                <p className={`text-base font-bold ${resultColor(recap.result_headline)}`}>
                  {recap.result_headline}
                </p>
                {recap.intro && (
                  <p className="text-sm text-zinc-300 leading-relaxed mt-1.5">{recap.intro}</p>
                )}
              </div>
            )}

            {/* Key Moments */}
            {recap.key_moments && recap.key_moments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5 text-amber-400" />
                  Key Moments
                </p>
                <div className="space-y-2">
                  {recap.key_moments.map((moment, i) => (
                    <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-zinc-100">{moment.headline}</p>
                        {moment.player_name && (
                          <span className="text-xs text-orange-400 shrink-0">{moment.player_name}</span>
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
            {recap.player_highlights && recap.player_highlights.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-yellow-400" />
                  Player Highlights
                </p>
                <div className="space-y-1.5">
                  {recap.player_highlights.map((ph, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="text-sm font-semibold text-orange-400 shrink-0 min-w-[80px]">{ph.player_name}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-zinc-300 leading-relaxed">{ph.highlight}</p>
                        {ph.stat_line && <p className="text-xs text-zinc-500 mt-0.5">{ph.stat_line}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Team Performance */}
            {recap.team_performance && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-blue-400" />
                  Team Performance
                </p>
                <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 space-y-2">
                  {recap.team_performance.offensive_note && (
                    <p className="text-xs text-zinc-300"><span className="font-semibold text-zinc-500">Offense: </span>{recap.team_performance.offensive_note}</p>
                  )}
                  {recap.team_performance.defensive_note && (
                    <p className="text-xs text-zinc-300"><span className="font-semibold text-zinc-500">Defense: </span>{recap.team_performance.defensive_note}</p>
                  )}
                  {recap.team_performance.effort_note && (
                    <p className="text-xs text-zinc-300"><span className="font-semibold text-zinc-500">Effort: </span>{recap.team_performance.effort_note}</p>
                  )}
                </div>
              </div>
            )}

            {/* Coach Message */}
            {recap.coach_message && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">From the Coach</p>
                <p className="text-sm text-zinc-200 italic">&ldquo;{recap.coach_message}&rdquo;</p>
              </div>
            )}

            {/* Looking ahead */}
            {recap.looking_ahead && (
              <div className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
                <p className="text-xs text-zinc-400 italic leading-relaxed">{recap.looking_ahead}</p>
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function CoachReflectionCard({
  sessionId,
  teamId,
}: {
  sessionId: string;
  teamId: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflection, setReflection] = useState<CoachReflectionResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [planId, setPlanId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(true);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/ai/coach-reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate reflection');
      }
      const data = await res.json();
      setReflection(data.reflection);
      setPlanId(data.plan?.id ?? null);
      setAnswers({});
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleSave() {
    if (!planId || !reflection) return;
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/coach-reflection', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, answers }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save reflection');
      }
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSaving(false);
    }
  }

  const answeredCount = Object.values(answers).filter((a) => a.trim().length > 0).length;
  const totalQuestions = reflection?.questions.length ?? 0;

  return (
    <Card className={reflection ? 'border-purple-500/20' : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-purple-400" />
            Coach Reflection
          </CardTitle>
          <div className="flex items-center gap-2">
            {reflection && (
              <>
                <span className="text-xs text-zinc-500">
                  {answeredCount}/{totalQuestions} answered
                </span>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-40"
                  aria-label="Regenerate reflection prompts"
                >
                  {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  aria-label={expanded ? 'Collapse reflection' : 'Expand reflection'}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!reflection && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
              <PenLine className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Reflect on this session</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                AI analyzes your observations and generates personalized reflection questions to help you grow as a coach.
              </p>
            </div>
            <button
              onClick={handleGenerate}
              className="flex items-center gap-2 rounded-full bg-purple-500/15 px-5 py-2.5 text-sm font-medium text-purple-300 hover:bg-purple-500/25 transition-colors touch-manipulation active:scale-[0.98]"
              aria-label="Generate reflection prompts"
            >
              <Sparkles className="h-4 w-4" />
              Generate Reflection Prompts
            </button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center justify-center py-8 gap-3 text-purple-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-sm font-medium">Generating reflection prompts…</p>
          </div>
        )}

        {reflection && expanded && (
          <div className="space-y-5">
            {/* Session summary */}
            <div className="rounded-xl bg-purple-500/8 border border-purple-500/20 p-4">
              <p className="text-xs font-medium text-purple-300 mb-1.5">Session Overview</p>
              <p className="text-sm text-zinc-300 leading-relaxed">{reflection.session_summary}</p>
            </div>

            {/* Reflection questions */}
            <div className="space-y-4">
              {reflection.questions.map((q, idx) => (
                <div key={q.id} className="space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-[10px] font-bold text-purple-300 mt-0.5">
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-zinc-100 leading-snug">{q.question}</p>
                      <p className={`text-xs mt-0.5 ${getCategoryColor(q.category)}`}>
                        {getCategoryLabel(q.category)} · {q.context}
                      </p>
                    </div>
                  </div>
                  <Textarea
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your thoughts…"
                    rows={3}
                    className="text-sm resize-none bg-zinc-900 border-zinc-700 focus:border-purple-500 focus:ring-purple-500/20 ml-7"
                    aria-label={`Answer for: ${q.question}`}
                  />
                </div>
              ))}
            </div>

            {/* Growth focus */}
            <div className="flex items-start gap-2 rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-3">
              <Target className="h-4 w-4 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-medium text-orange-300 mb-0.5">Growth Focus for Next Session</p>
                <p className="text-sm text-zinc-300">{reflection.growth_focus}</p>
              </div>
            </div>

            {/* Save button */}
            <div className="flex items-center justify-between pt-1">
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="ml-auto">
                {saved ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                    <Check className="h-3.5 w-3.5" />
                    Reflection saved
                  </span>
                ) : (
                  <button
                    onClick={handleSave}
                    disabled={isSaving || answeredCount === 0}
                    className="flex items-center gap-2 rounded-full bg-purple-500/15 px-4 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/25 transition-colors disabled:opacity-40 touch-manipulation"
                    aria-label="Save reflection answers"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Save Reflection
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function HalftimeAdjustmentsCard({
  sessionId,
  teamId,
  opponent,
}: {
  sessionId: string;
  teamId: string;
  opponent?: string | null;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<HalftimeAdjustments | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/halftime-adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate adjustments');
      }
      const data = await res.json();
      setAdjustments(data.adjustments);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy() {
    if (!adjustments) return;
    await navigator.clipboard.writeText(buildHalftimeShareText(adjustments, opponent));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const momentum = adjustments?.momentum;
  const momentumColor = momentum ? getMomentumColor(momentum) : 'text-purple-400';
  const momentumBanner = momentum ? getMomentumBannerClasses(momentum) : 'border-purple-500/20 bg-purple-500/5';

  return (
    <Card className={adjustments ? momentumBanner : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Shuffle className="h-5 w-5 text-purple-400" />
            Half-Time Adjustments
          </CardTitle>
          <div className="flex items-center gap-2">
            {adjustments && (
              <>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  aria-label="Copy adjustments to clipboard"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-40"
                  aria-label="Regenerate adjustments"
                >
                  {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  aria-label={expanded ? 'Collapse adjustments' : 'Expand adjustments'}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!adjustments && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-500/10">
              <Shuffle className="h-7 w-7 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">AI Half-Time Adjustments</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                Capture at least 3 observations, then generate tactical adjustments for the second half — what&apos;s working, what to fix, and player spotlights.
              </p>
            </div>
            <Button
              onClick={handleGenerate}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              <Shuffle className="h-4 w-4" />
              Generate Adjustments
            </Button>
            {error && <p className="text-xs text-red-400">{error}</p>}
          </div>
        )}

        {isGenerating && !adjustments && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
            <p className="text-sm text-zinc-400">Analyzing first half...</p>
          </div>
        )}

        {adjustments && expanded && (
          <div className="space-y-4">
            {/* Momentum banner */}
            <div className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${momentumBanner}`}>
              <Activity className={`h-4 w-4 shrink-0 ${momentumColor}`} />
              <span className={`text-sm font-semibold ${momentumColor}`}>
                {getMomentumLabel(adjustments.momentum)}
              </span>
            </div>

            {/* What's working */}
            {adjustments.whats_working.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  What&apos;s Working
                </p>
                <ul className="space-y-1">
                  {adjustments.whats_working.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-emerald-400 shrink-0 mt-0.5">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* What needs fixing */}
            {adjustments.what_needs_fixing.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
                  Needs Fixing
                </p>
                <ul className="space-y-1">
                  {adjustments.what_needs_fixing.map((item, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                      <span className="text-amber-400 shrink-0 mt-0.5">⚠</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tactical adjustments */}
            {adjustments.adjustments.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-purple-400" />
                  Tactical Adjustments
                </p>
                <div className="space-y-2">
                  {adjustments.adjustments.map((adj, i) => (
                    <div
                      key={i}
                      className={`rounded-lg border p-3 ${
                        adj.priority === 'immediate'
                          ? 'border-purple-500/30 bg-purple-500/5'
                          : 'border-zinc-700/50 bg-zinc-900/30'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className="text-sm font-semibold text-zinc-100">{adj.focus}</span>
                        {adj.priority === 'immediate' && (
                          <span className="text-[10px] font-medium text-purple-400 bg-purple-500/10 rounded-full px-2 py-0.5">
                            Now
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{adj.action}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Player spotlight */}
            {adjustments.player_spotlight && (
              <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5 text-orange-400" />
                  Feature in Second Half
                </p>
                <p className="text-sm font-semibold text-orange-400">{adjustments.player_spotlight.name}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{adjustments.player_spotlight.note}</p>
              </div>
            )}

            {/* Halftime message */}
            {adjustments.halftime_message && (
              <div className="rounded-lg border border-zinc-700 bg-zinc-900/60 p-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1 flex items-center gap-1.5">
                  <Send className="h-3.5 w-3.5 text-zinc-500" />
                  Halftime Message
                </p>
                <p className="text-sm text-zinc-200 italic">&ldquo;{adjustments.halftime_message}&rdquo;</p>
              </div>
            )}

            {error && <p className="text-xs text-red-400 mt-2">{error}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Player Session Messages ──────────────────────────────────────────────────

interface PlayerMessageEntry {
  player_name: string;
  message: string;
  highlight: string;
  next_focus: string;
}

interface PlayerSessionMessagesResult {
  session_label: string;
  messages: PlayerMessageEntry[];
  team_note: string;
}

function PlayerSessionMessagesCard({
  sessionId,
  teamId,
  observationCount,
}: {
  sessionId: string;
  teamId: string;
  observationCount: number;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<PlayerSessionMessagesResult | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [sharedIdx, setSharedIdx] = useState<number | null>(null);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/player-session-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate messages');
      }
      const data = await res.json();
      setMessages(data.messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopy(msg: PlayerMessageEntry, idx: number) {
    const text = `Hi! A quick note on ${msg.player_name} from today's session:\n\n${msg.message}\n\nHighlight: ${msg.highlight}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleCopyAll() {
    if (!messages) return;
    const text = messages.messages
      .map((m) => `--- ${m.player_name} ---\n${m.message}\nHighlight: ${m.highlight}\nWork on: ${m.next_focus}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(-1);
      setTimeout(() => setCopiedIdx(null), 2000);
    } catch {
      // ignore clipboard errors
    }
  }

  async function handleShare(msg: PlayerMessageEntry, idx: number) {
    const text = `Hi! A quick note on ${msg.player_name} from today:\n\n${msg.message}\n\n⭐ Highlight: ${msg.highlight}\n🎯 Next focus: ${msg.next_focus}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: `Message for ${msg.player_name}`, text });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      }
      setSharedIdx(idx);
      setTimeout(() => setSharedIdx(null), 2000);
    } catch {
      // user cancelled share — ignore
    }
  }

  const canGenerate = observationCount > 0;

  return (
    <Card className={messages ? 'border-teal-500/20' : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/15">
              <Send className="h-4 w-4 text-teal-400" />
            </div>
            Player Messages
          </CardTitle>
          <div className="flex items-center gap-2">
            {messages && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyAll}
                className="h-8 gap-1.5 text-xs"
              >
                {copiedIdx === -1 ? (
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy All
              </Button>
            )}
            <Button
              variant={messages ? 'ghost' : 'outline'}
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating || !canGenerate}
              className="h-8 gap-1.5 text-xs"
              aria-label="Generate player messages"
            >
              {isGenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-teal-400" />
              )}
              {messages ? 'Regenerate' : 'Generate'}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!canGenerate && !messages && (
          <p className="text-sm text-zinc-500 text-center py-4">
            Add player observations first to generate messages.
          </p>
        )}

        {canGenerate && !messages && !isGenerating && (
          <p className="text-sm text-zinc-500 py-1">
            Generate send-ready message snippets for each player — perfect for texting players or parents after the session.
          </p>
        )}

        {isGenerating && (
          <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin text-teal-400" />
            Writing messages…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {messages && !isGenerating && (
          <div className="space-y-4">
            {messages.messages.map((msg, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-teal-300">{msg.player_name}</p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 shrink-0"
                      onClick={() => handleShare(msg, idx)}
                      aria-label={`Share message for ${msg.player_name} via WhatsApp or SMS`}
                    >
                      {sharedIdx === idx ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5" />
                      )}
                      <span>{sharedIdx === idx ? 'Sent!' : 'Send'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => handleCopy(msg, idx)}
                      aria-label={`Copy message for ${msg.player_name}`}
                    >
                      {copiedIdx === idx ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5 text-zinc-400" />
                      )}
                    </Button>
                  </div>
                </div>

                <p className="text-sm text-zinc-200 leading-relaxed">{msg.message}</p>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-emerald-500/8 border border-emerald-500/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 mb-0.5">
                      Highlight
                    </p>
                    <p className="text-xs text-zinc-300">{msg.highlight}</p>
                  </div>
                  <div className="rounded-lg bg-orange-500/8 border border-orange-500/20 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-orange-400 mb-0.5">
                      Next Focus
                    </p>
                    <p className="text-xs text-zinc-300">{msg.next_focus}</p>
                  </div>
                </div>
              </div>
            ))}

            {messages.team_note && (
              <div className="flex items-start gap-2 rounded-xl bg-zinc-800/60 border border-zinc-700 px-4 py-3 mt-1">
                <Users className="h-4 w-4 text-zinc-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-0.5">
                    Team Note
                  </p>
                  <p className="text-sm text-zinc-400 leading-relaxed">{messages.team_note}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Team Group Chat Message ──────────────────────────────────────────────────

interface TeamGroupMessageResult {
  message: string;
  session_label: string;
  team_highlight: string;
  coaching_focus: string[];
  encouragement: string;
  next_session_note?: string;
}

function TeamGroupMessageCard({
  sessionId,
  teamId,
  observationCount,
}: {
  sessionId: string;
  teamId: string;
  observationCount: number;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TeamGroupMessageResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [editedMessage, setEditedMessage] = useState('');

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/team-group-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate message');
      }
      const data = await res.json();
      setResult(data.groupMessage);
      setEditedMessage(data.groupMessage.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  function buildFullText(msg: TeamGroupMessageResult): string {
    return [
      `🏀 ${msg.session_label}`,
      '',
      editedMessage || msg.message,
      msg.coaching_focus?.length ? `\nToday we focused on: ${msg.coaching_focus.join(', ')}` : '',
      msg.encouragement ? `\n${msg.encouragement}` : '',
      msg.next_session_note ? `\n📅 ${msg.next_session_note}` : '',
    ].filter(Boolean).join('\n').trim();
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildFullText(result));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  async function handleShare() {
    if (!result) return;
    const text = buildFullText(result);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Team Update', text });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      }
      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch { /* user cancelled */ }
  }

  const canGenerate = observationCount >= 1;

  return (
    <Card className="border-zinc-800">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
              <Users className="h-4 w-4 text-emerald-400" />
            </div>
            Team Group Message
          </CardTitle>
          <div className="flex items-center gap-2">
            {result && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating}
                aria-label="Regenerate team group message"
                className="h-8 w-8 p-0"
              >
                {isGenerating
                  ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  : <RefreshCw className="h-4 w-4 text-zinc-400" />}
              </Button>
            )}
            {!result && (
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={isGenerating || !canGenerate}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {isGenerating
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
                  : <><Sparkles className="h-4 w-4" /> Generate</>}
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          One-tap WhatsApp/SMS message for your team parent group
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {!canGenerate && !result && (
          <p className="text-sm text-zinc-500 italic">
            Record at least one observation to generate a team message.
          </p>
        )}

        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Editable message */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-2">
                Your Message (tap to edit)
              </p>
              <textarea
                value={editedMessage}
                onChange={(e) => setEditedMessage(e.target.value)}
                rows={4}
                className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-3 text-sm text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500/50 placeholder:text-zinc-600"
                aria-label="Editable team group message"
              />
            </div>

            {/* Team highlight */}
            {result.team_highlight && (
              <div className="flex items-start gap-2 rounded-xl bg-amber-500/8 border border-amber-500/20 px-3 py-2.5">
                <Star className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400 mb-0.5">Team Highlight</p>
                  <p className="text-xs text-zinc-300">{result.team_highlight}</p>
                </div>
              </div>
            )}

            {/* Skills covered */}
            {result.coaching_focus && result.coaching_focus.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Skills Covered</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.coaching_focus.map((focus, i) => (
                    <span key={i} className="text-xs bg-emerald-500/12 text-emerald-300 border border-emerald-500/20 rounded-full px-2.5 py-0.5">
                      {focus}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleShare}
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                aria-label="Share team group message via WhatsApp or SMS"
              >
                {shared
                  ? <><Check className="h-4 w-4" /> Sent!</>
                  : <><Share2 className="h-4 w-4" /> Send to WhatsApp Group</>}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-1.5 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                aria-label="Copy team group message to clipboard"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Pre-Session Briefing ─────────────────────────────────────────────────────

function PreSessionBriefingCard({
  sessionId,
  teamId,
}: {
  sessionId: string;
  teamId: string;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [briefing, setBriefing] = useState<SessionBriefingResult | null>(null);
  const [expanded, setExpanded] = useState(true);

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai/session-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate briefing');
      }
      const data = await res.json();
      setBriefing(data.briefing);
      setExpanded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <Card className={briefing ? 'border-blue-500/20' : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-400" />
            Pre-Session Briefing
          </CardTitle>
          <div className="flex items-center gap-2">
            {briefing && (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-40"
                  aria-label="Regenerate briefing"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Refresh
                </button>
                <button
                  onClick={() => setExpanded((v) => !v)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
                  aria-label={expanded ? 'Collapse briefing' : 'Expand briefing'}
                  aria-expanded={expanded}
                >
                  {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!briefing && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10">
              <Zap className="h-7 w-7 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Get your pre-session briefing</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs mx-auto">
                AI analyzes recent observations, player goals, and team trends to give you a personalized coaching plan for today.
              </p>
            </div>
            <Button
              onClick={handleGenerate}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Zap className="h-4 w-4" />
              Get Briefing
            </Button>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
          </div>
        )}

        {isGenerating && !briefing && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
            <p className="text-sm text-zinc-400">Analyzing team data...</p>
          </div>
        )}

        {briefing && expanded && (
          <div className="space-y-4">
            {/* Unavailable players warning */}
            {briefing.unavailable_players.length > 0 && (
              <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-amber-300">Players unavailable today</p>
                  <p className="text-xs text-amber-400/80 mt-0.5">
                    {briefing.unavailable_players.join(', ')}
                  </p>
                </div>
              </div>
            )}

            {/* Session goal */}
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-blue-400 mb-1">
                Session Goal
              </p>
              <p className="text-sm font-medium text-zinc-100 leading-snug">{briefing.session_goal}</p>
            </div>

            {/* Energy note */}
            {briefing.energy_note && (
              <div className="flex items-start gap-2">
                <TrendingUp className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
                <p className="text-xs text-zinc-400 italic leading-relaxed">{briefing.energy_note}</p>
              </div>
            )}

            {/* Focus areas */}
            {briefing.focus_areas.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Focus Areas
                </p>
                <div className="space-y-2">
                  {briefing.focus_areas.map((area, i) => {
                    const cfg = PRIORITY_CONFIG[area.priority];
                    return (
                      <div key={i} className={`rounded-lg border ${cfg.bg} p-2.5`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-zinc-200">{area.skill}</span>
                          <span className={`text-[10px] font-semibold uppercase tracking-wider ${cfg.color}`}>
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400 leading-relaxed">{area.reason}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Players to watch */}
            {briefing.players_to_watch.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Players to Watch
                </p>
                <div className="space-y-2">
                  {briefing.players_to_watch.map((player, i) => {
                    const cfg = PLAYER_WATCH_CONFIG[player.type];
                    const Icon = cfg.icon;
                    return (
                      <div key={i} className="flex items-start gap-2.5">
                        <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-zinc-200">{player.name}</span>
                            <span className={`text-[10px] font-medium ${cfg.color}`}>· {cfg.label}</span>
                          </div>
                          <p className="text-xs text-zinc-400 leading-relaxed">{player.note}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Coaching tips */}
            {briefing.coaching_tips.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Coaching Tips for Today
                </p>
                <div className="space-y-1.5">
                  {briefing.coaching_tips.map((tip, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-zinc-300 leading-relaxed">{tip}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {briefing && !expanded && (
          <p className="text-xs text-zinc-500 text-center py-1">
            {briefing.focus_areas.length} focus area{briefing.focus_areas.length !== 1 ? 's' : ''} ·{' '}
            {briefing.players_to_watch.length} player{briefing.players_to_watch.length !== 1 ? 's' : ''} to watch
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AIDebriefCard({
  sessionId,
  teamId,
  observationCount,
  savedDebrief,
  onDebriefSaved,
}: {
  sessionId: string;
  teamId: string;
  observationCount: number;
  savedDebrief: SessionDebriefResult | null;
  onDebriefSaved: () => void;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localDebrief, setLocalDebrief] = useState<SessionDebriefResult | null>(savedDebrief);

  // Practice plan creation state
  const [isPlanGenerating, setIsPlanGenerating] = useState(false);
  const [planCreated, setPlanCreated] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);

  const debrief = localDebrief || savedDebrief;

  async function handleGenerate() {
    setIsGenerating(true);
    setError(null);
    // Reset plan state when regenerating
    setPlanCreated(false);
    setPlanError(null);
    try {
      const res = await fetch('/api/ai/session-debrief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, teamId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate analysis');
      }
      const data = await res.json();
      setLocalDebrief(data.debrief);
      onDebriefSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCreatePlan() {
    if (!debrief || debrief.next_practice_focus.length === 0) return;
    setIsPlanGenerating(true);
    setPlanError(null);

    const focusSkills = debrief.next_practice_focus.map((f) => f.focus);
    try {
      const res = await fetch('/api/ai/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, type: 'practice', focusSkills }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create practice plan');
      }
      setPlanCreated(true);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsPlanGenerating(false);
    }
  }

  const toneConfig = debrief ? TONE_CONFIG[debrief.overall_tone] : null;

  return (
    <Card className={debrief ? `border-orange-500/20` : 'border-zinc-800'}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-400" />
            AI Post-Session Analysis
          </CardTitle>
          {debrief && (
            <button
              onClick={handleGenerate}
              disabled={isGenerating || observationCount === 0}
              className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              Regenerate
            </button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!debrief && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-6 text-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10">
              <Sparkles className="h-7 w-7 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Analyze this session with AI</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-xs">
                Get player highlights, areas to improve, and next-practice suggestions based on your{' '}
                {observationCount} observation{observationCount !== 1 ? 's' : ''}.
              </p>
            </div>
            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2 max-w-sm">
                {error}
              </p>
            )}
            <Button
              onClick={handleGenerate}
              disabled={observationCount === 0}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Sparkles className="h-4 w-4" />
              Generate Analysis
            </Button>
            {observationCount === 0 && (
              <p className="text-xs text-zinc-600">Add observations to this session first</p>
            )}
          </div>
        )}

        {isGenerating && !debrief && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-orange-400" />
            <p className="text-sm text-zinc-400">Analyzing session data...</p>
          </div>
        )}

        {debrief && (
          <div className="space-y-5">
            {/* Tone badge + summary */}
            {toneConfig && (
              <div
                className={`flex items-start gap-3 rounded-xl border p-3 ${toneConfig.bg} ${toneConfig.border}`}
              >
                <TrendingUp className={`h-5 w-5 mt-0.5 shrink-0 ${toneConfig.color}`} />
                <div>
                  <p className={`text-sm font-semibold ${toneConfig.color}`}>{toneConfig.label}</p>
                  <p className="text-sm text-zinc-300 mt-1 leading-relaxed">{debrief.session_summary}</p>
                </div>
              </div>
            )}

            {/* Trend note vs prior sessions */}
            {debrief.trend_note && (
              <div className="flex items-start gap-2.5 rounded-lg bg-purple-500/5 border border-purple-500/20 px-3 py-2.5">
                <TrendingDown className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-400/70 mb-0.5">
                    Trend vs Recent Sessions
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{debrief.trend_note}</p>
                </div>
              </div>
            )}

            {/* Player Highlights */}
            {debrief.player_highlights.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <Star className="h-3.5 w-3.5" />
                  Player Highlights
                </h4>
                <div className="space-y-2">
                  {debrief.player_highlights.map((h, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-xs font-semibold text-emerald-400">{h.player_name}</span>
                        <p className="text-xs text-zinc-300 mt-0.5">{h.highlight}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Areas to Improve */}
            {debrief.areas_to_improve.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5" />
                  Areas to Improve
                </h4>
                <div className="space-y-2">
                  {debrief.areas_to_improve.map((area, i) => (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 rounded-lg p-3 ${
                        area.is_recurring
                          ? 'bg-red-500/5 border border-red-500/20'
                          : 'bg-amber-500/5 border border-amber-500/15'
                      }`}
                    >
                      <AlertCircle className={`h-4 w-4 shrink-0 mt-0.5 ${area.is_recurring ? 'text-red-400' : 'text-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-semibold capitalize ${area.is_recurring ? 'text-red-400' : 'text-amber-400'}`}>
                            {area.skill_area}
                          </span>
                          {area.is_recurring && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 border border-red-500/25 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                              <Repeat2 className="h-2.5 w-2.5" />
                              Recurring
                            </span>
                          )}
                          {area.player_count > 0 && (
                            <span className="text-[10px] text-zinc-600">
                              {area.player_count} player{area.player_count !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-300 mt-0.5">{area.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Next Practice Focus */}
            {debrief.next_practice_focus.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                  <Dumbbell className="h-3.5 w-3.5" />
                  Next Practice Focus
                </h4>
                <div className="space-y-2">
                  {debrief.next_practice_focus.map((item, i) => (
                    <div
                      key={i}
                      className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-500/20 text-[10px] font-bold text-blue-400 shrink-0">
                          {i + 1}
                        </span>
                        <span className="text-xs font-semibold text-blue-300">{item.focus}</span>
                      </div>
                      <p className="text-xs text-zinc-400 pl-7">{item.rationale}</p>
                      <div className="flex items-center gap-1.5 pl-7">
                        <Dumbbell className="h-3 w-3 text-zinc-600 shrink-0" />
                        <p className="text-[11px] text-zinc-500 italic">{item.suggested_drill}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recurring focus areas summary */}
            {debrief.recurring_focus_areas && debrief.recurring_focus_areas.length > 0 && (
              <div className="rounded-lg bg-red-500/5 border border-red-500/20 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Repeat2 className="h-3.5 w-3.5 text-red-400" />
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                    Persistent Focus Areas
                  </p>
                </div>
                <p className="text-xs text-zinc-400">
                  These areas have appeared across multiple recent sessions — consider dedicating extra drill time:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {debrief.recurring_focus_areas.map((area, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full border border-red-500/25 bg-red-500/10 px-2.5 py-0.5 text-[11px] font-medium text-red-400 capitalize"
                    >
                      {area}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Coaching Tip */}
            {debrief.coaching_tip && (
              <div className="flex items-start gap-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 p-3">
                <Lightbulb className="h-4 w-4 text-yellow-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-yellow-400/70 mb-1">
                    Coach Tip
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">{debrief.coaching_tip}</p>
                </div>
              </div>
            )}

            {/* ── Create Practice Plan CTA ─────────────────────────────────── */}
            {debrief.next_practice_focus.length > 0 && (
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <ClipboardList className="h-5 w-5 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-blue-300">Ready for next practice?</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Build a full AI practice plan targeting the{' '}
                      {debrief.next_practice_focus.length} focus area
                      {debrief.next_practice_focus.length !== 1 ? 's' : ''} above.
                    </p>
                  </div>
                </div>

                {/* Focus skill chips */}
                <div className="flex flex-wrap gap-1.5">
                  {debrief.next_practice_focus.map((item, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-medium text-blue-400"
                    >
                      {item.focus}
                    </span>
                  ))}
                </div>

                {planCreated ? (
                  <div className="flex items-center gap-2.5">
                    <div className="flex flex-1 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span className="text-sm font-medium text-emerald-400">
                        Practice plan created!
                      </span>
                    </div>
                    <Link href="/plans" className="shrink-0">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white min-h-[44px] px-4">
                        View Plan
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <>
                    {planError && (
                      <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                        {planError}
                      </p>
                    )}
                    <Button
                      onClick={handleCreatePlan}
                      disabled={isPlanGenerating}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white min-h-[44px]"
                      size="sm"
                    >
                      {isPlanGenerating ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Creating practice plan…
                        </>
                      ) : (
                        <>
                          <ClipboardList className="h-4 w-4" />
                          Create Practice Plan from Debrief
                        </>
                      )}
                    </Button>
                  </>
                )}
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [debrief, setDebrief] = useState('');
  const [debriefInitialized, setDebriefInitialized] = useState(false);
  const [mediaUploading, setMediaUploading] = useState(false);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const [observerLinkGenerating, setObserverLinkGenerating] = useState(false);
  const [observerLinkCopied, setObserverLinkCopied] = useState(false);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const data = await query<Session>({
        table: 'sessions',
        select: '*',
        filters: { id: sessionId },
        single: true,
      });
      if (!debriefInitialized && data) {
        setDebrief(data.coach_debrief_text || '');
        setDebriefInitialized(true);
      }
      return data;
    },
    ...CACHE_PROFILES.sessions,
  });

  const { data: observations, isLoading: obsLoading } = useQuery({
    queryKey: queryKeys.observations.session(sessionId),
    queryFn: async () => {
      const data = await query<any[]>({
        table: 'observations',
        select: '*, players:player_id(name)',
        filters: { session_id: sessionId },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    ...CACHE_PROFILES.observations,
  });

  const { data: sessionMedia = [] } = useQuery({
    queryKey: ['session-media', sessionId],
    queryFn: async () => {
      const data = await query<Media[]>({
        table: 'media',
        select: '*',
        filters: { session_id: sessionId },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    enabled: !!sessionId,
  });

  const { data: rosterPlayers = [] } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      const data = await query<Player[]>({
        table: 'players',
        select: 'id, name, jersey_number',
        filters: { team_id: activeTeam!.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
  });

  const handleObserverLink = async () => {
    setObserverLinkGenerating(true);
    try {
      const res = await fetch('/api/observer-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) return;
      const { url } = await res.json();
      await navigator.clipboard.writeText(url);
      setObserverLinkCopied(true);
      setTimeout(() => setObserverLinkCopied(false), 3000);
    } catch {
      // clipboard write failed — silently skip
    } finally {
      setObserverLinkGenerating(false);
    }
  };

  const handleMediaUpload = async (files: FileList) => {
    if (!activeTeam || !session) return;
    setMediaUploading(true);

    try {
      for (const file of Array.from(files)) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('sessionId', sessionId);
        formData.append('teamId', activeTeam.id);
        if (selectedPlayerIds.length > 0) {
          formData.append('playerIds', selectedPlayerIds.join(','));
        }

        await fetch('/api/media/upload', {
          method: 'POST',
          body: formData,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['session-media', sessionId] });
      setSelectedPlayerIds([]);
    } catch (err) {
      console.error('Media upload failed:', err);
    } finally {
      setMediaUploading(false);
    }
  };

  const togglePlayerTag = (playerId: string) => {
    setSelectedPlayerIds((prev) =>
      prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]
    );
  };

  const debriefMutation = useMutation({
    mutationFn: async (text: string) => {
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { coach_debrief_text: text },
        filters: { id: sessionId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  const qualityMutation = useMutation({
    mutationFn: async (rating: number) => {
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { quality_rating: rating },
        filters: { id: sessionId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(time: string | null) {
    if (!time) return null;
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  }

  const isLoading = sessionLoading || obsLoading;

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-zinc-400">Session not found</p>
        <Link href="/sessions" className="mt-4">
          <Button variant="outline">Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  const savedDebrief = session.coach_debrief_extracts as SessionDebriefResult | null;

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              {SESSION_TYPE_LABELS[session.type]}
            </h1>
            {session.opponent && (
              <span className="text-lg text-zinc-400">vs {session.opponent}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {(session.type === 'game' || session.type === 'scrimmage' || session.type === 'tournament') && (
            <>
              <Link href={`/sessions/${sessionId}/subs`}>
                <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
                  <Shuffle className="h-4 w-4" />
                  <span className="hidden sm:inline">Subs</span>
                </Button>
              </Link>
              <Link href={`/sessions/${sessionId}/game-tracker`}>
                <Button variant="outline" size="sm" className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10">
                  <BarChart2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Game Stats</span>
                </Button>
              </Link>
            </>
          )}
          {(session.type === 'practice' || session.type === 'training' || session.type === 'scrimmage') && (
            <Link href={`/sessions/${sessionId}/timer`}>
              <Button variant="outline" size="sm" className="hidden sm:flex">
                <Dumbbell className="h-4 w-4" />
                Timer
              </Button>
            </Link>
          )}
          <Link href={`/sessions/${sessionId}/attendance`}>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Attendance</span>
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleObserverLink}
            disabled={observerLinkGenerating}
            title="Share observer link — let a parent volunteer capture observations"
            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-emerald-400 hover:border-emerald-700"
          >
            {observerLinkGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : observerLinkCopied ? (
              <Check className="h-4 w-4 text-emerald-400" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {observerLinkCopied ? 'Copied!' : 'Observer'}
            </span>
          </Button>
          <Link href={`/sessions/${sessionId}/replay`}>
            <Button variant="outline" size="sm" className="border-zinc-700 text-zinc-400 hover:bg-zinc-800">
              <Play className="h-4 w-4" />
              <span className="hidden sm:inline">Replay</span>
            </Button>
          </Link>
          <Link href={`/capture?sessionId=${sessionId}`}>
            <Button>
              <Mic className="h-4 w-4" />
              Capture
            </Button>
          </Link>
        </div>
      </div>

      {/* Session info card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(session.date)}
            </span>
            {session.start_time && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatTime(session.start_time)}
                {session.end_time && ` - ${formatTime(session.end_time)}`}
              </span>
            )}
            {session.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {session.location}
              </span>
            )}
          </div>
          {session.curriculum_week && (
            <Badge variant="secondary">Curriculum Week {session.curriculum_week}</Badge>
          )}
          {session.result && (
            <p className="text-sm text-zinc-300">Result: {session.result}</p>
          )}
        </CardContent>
      </Card>

      {/* Pre-Session AI Briefing */}
      {activeTeam && (
        <PreSessionBriefingCard
          sessionId={sessionId}
          teamId={activeTeam.id}
        />
      )}

      {/* Observations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" />
            Observations
            <Badge variant="secondary">{observations?.length || 0}</Badge>
          </h2>
        </div>

        {/* Coverage Tracker — who have I observed this session? */}
        {rosterPlayers.length > 0 && !obsLoading && (
          <SessionCoverageTracker
            rosterPlayers={rosterPlayers}
            observations={observations || []}
            sessionId={sessionId}
          />
        )}

        {observations?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <MessageSquare className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No observations yet</p>
              <Link href={`/capture?sessionId=${sessionId}`} className="mt-3">
                <Button variant="outline" size="sm">
                  <Mic className="h-4 w-4" />
                  Start capturing
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {observations?.map((obs: any) => {
              const sentimentConfig = SENTIMENT_CONFIG[obs.sentiment as Sentiment];
              const SentimentIcon = sentimentConfig?.icon || MinusCircle;

              return (
                <Card key={obs.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <SentimentIcon
                        className={`h-5 w-5 mt-0.5 shrink-0 ${sentimentConfig?.color || 'text-zinc-400'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {obs.players?.name && (
                            <span className="text-sm font-medium text-orange-400">
                              {obs.players.name}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {obs.category}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {obs.source}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-300">{obs.text}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Post-Session Analysis */}
      {activeTeam && (
        <AIDebriefCard
          sessionId={sessionId}
          teamId={activeTeam.id}
          observationCount={observations?.length || 0}
          savedDebrief={savedDebrief}
          onDebriefSaved={() =>
            queryClient.invalidateQueries({ queryKey: ['session', sessionId] })
          }
        />
      )}

      {/* Half-Time Adjustments — game/scrimmage/tournament only */}
      {activeTeam && (session.type === 'game' || session.type === 'scrimmage' || session.type === 'tournament') && (
        <HalftimeAdjustmentsCard
          sessionId={sessionId}
          teamId={activeTeam.id}
          opponent={session.opponent}
        />
      )}

      {/* Game Recap — game/scrimmage/tournament only */}
      {activeTeam && (session.type === 'game' || session.type === 'scrimmage' || session.type === 'tournament') && (
        <GameRecapCard
          sessionId={sessionId}
          teamId={activeTeam.id}
        />
      )}

      {/* Coach Reflection Journal — all session types */}
      {activeTeam && (
        <CoachReflectionCard
          sessionId={sessionId}
          teamId={activeTeam.id}
        />
      )}

      {/* Player Session Messages — quick send-ready notes for players/parents */}
      {activeTeam && (
        <PlayerSessionMessagesCard
          sessionId={sessionId}
          teamId={activeTeam.id}
          observationCount={observations?.length || 0}
        />
      )}

      {/* Team Group Message — one-tap WhatsApp/SMS for the parent group chat */}
      {activeTeam && (
        <TeamGroupMessageCard
          sessionId={sessionId}
          teamId={activeTeam.id}
          observationCount={observations?.length || 0}
        />
      )}

      {/* Media Upload Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <ImagePlus className="h-5 w-5 text-orange-500" />
              Photos & Videos
              {sessionMedia.length > 0 && (
                <Badge variant="secondary">{sessionMedia.length}</Badge>
              )}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => mediaInputRef.current?.click()}
              disabled={mediaUploading}
            >
              {mediaUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" />
                  Add Photos/Videos
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <input
            ref={mediaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleMediaUpload(e.target.files);
              }
              e.target.value = '';
            }}
          />

          {/* Player tag selector */}
          {rosterPlayers.length > 0 && (
            <div>
              <p className="text-xs text-zinc-500 mb-2">Tag players (optional):</p>
              <div className="flex flex-wrap gap-1.5">
                {rosterPlayers.map((player: Player) => (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayerTag(player.id)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedPlayerIds.includes(player.id)
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50'
                        : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    {player.jersey_number ? `#${player.jersey_number} ` : ''}
                    {player.name}
                    {selectedPlayerIds.includes(player.id) && (
                      <X className="inline h-3 w-3 ml-1" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Media Grid */}
          {sessionMedia.length > 0 ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {sessionMedia.map((media: Media) => (
                <div
                  key={media.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900"
                >
                  {media.type === 'video' ? (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      <div className="text-center">
                        <div className="mx-auto mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800">
                          <svg className="h-4 w-4 text-zinc-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </div>
                        <p className="text-[10px] text-zinc-500">Video</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900">
                      <ImagePlus className="h-6 w-6 text-zinc-700" />
                    </div>
                  )}
                  {media.caption && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[10px] text-zinc-300 line-clamp-2">{media.caption}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <ImagePlus className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-sm text-zinc-500">No media uploaded yet</p>
              <p className="text-xs text-zinc-600 mt-1">Tap the button above to add photos or videos</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session Quality Rating */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-400" />
            Rate This Session
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              {([1, 2, 3, 4, 5] as const).map((n) => {
                const current = session?.quality_rating ?? 0;
                const filled = n <= current;
                return (
                  <button
                    key={n}
                    aria-label={`Rate session ${n} star${n !== 1 ? 's' : ''}`}
                    onClick={() => qualityMutation.mutate(n)}
                    disabled={qualityMutation.isPending}
                    className="h-11 w-11 flex items-center justify-center rounded-lg transition-colors touch-manipulation active:scale-95 hover:bg-zinc-800"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        filled ? 'fill-amber-400 text-amber-400' : 'text-zinc-600'
                      }`}
                    />
                  </button>
                );
              })}
              {qualityMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500 ml-1" />
              )}
            </div>
            {isValidRating(session?.quality_rating) && (
              <p className={`text-sm font-medium ${getRatingColor(session!.quality_rating!)}`}>
                {getRatingLabel(session!.quality_rating! as 1 | 2 | 3 | 4 | 5)}
                {qualityMutation.isSuccess && (
                  <span className="ml-2 text-xs text-zinc-500 font-normal">Saved</span>
                )}
              </p>
            )}
            {!session?.quality_rating && (
              <p className="text-xs text-zinc-500">Tap a star to rate this session&apos;s quality.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Coach Debrief */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coach Notes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Post-session notes: what went well, what to work on, player highlights..."
            value={debrief}
            onChange={(e) => setDebrief(e.target.value)}
            rows={5}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {debriefMutation.isSuccess && 'Saved'}
              {debriefMutation.isError && 'Failed to save'}
            </p>
            <Button
              size="sm"
              onClick={() => debriefMutation.mutate(debrief)}
              disabled={debriefMutation.isPending}
            >
              {debriefMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Notes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
