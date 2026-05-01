'use client';

import { use, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useActiveTeam } from '@/hooks/use-active-team';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SkillProgressBar } from '@/components/roster/skill-progress-bar';
import {
  ArrowLeft,
  BarChart3,
  Eye,
  FileText,
  Flag,
  Image as ImageIcon,
  Share2,
  MessageSquare,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Zap,
  Clock,
  Sparkles,
  Trophy,
  BookOpen,
  TrendingUp,
  Star,
  ClipboardCheck,
  ChevronDown,
  ChevronUp,
  CalendarCheck,
  Target,
  StickyNote,
  Camera,
  QrCode,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { PrintButton } from '@/components/ui/print-button';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { PlayerFocusEntry } from '@/components/observations/PlayerFocusEntry';
import { useAppStore } from '@/lib/store';
import { AchievementBadgesPanel } from '@/components/player/achievement-badges';
import { PlayerGoalsPanel } from '@/components/player/player-goals-panel';
import { PlayerNotesPanel } from '@/components/player/player-notes-panel';
import { countHighlighted } from '@/lib/observation-highlights';
import type { Player, Observation, PlayerSkillProficiency, Plan, Sentiment, ParentShare } from '@/types/database';
import type { PlayerAttendanceStat } from '@/app/api/attendance-stats/route';
import {
  getMomentumBadgeClasses,
  getMomentumColor,
  getMomentumLabel,
  formatMomentumScore,
  isHotStreak,
  type PlayerMomentum,
} from '@/lib/momentum-utils';

type Tab = 'overview' | 'observations' | 'report-card' | 'media' | 'share' | 'challenges' | 'storyline' | 'self-assessment' | 'goals' | 'notes';

const sentimentVariant: Record<Sentiment, 'success' | 'destructive' | 'secondary'> = {
  positive: 'success',
  'needs-work': 'destructive',
  neutral: 'secondary',
};

const sentimentLabel: Record<Sentiment, string> = {
  positive: 'Positive',
  'needs-work': 'Needs Work',
  neutral: 'Neutral',
};

// ─── MomentumCard ─────────────────────────────────────────────────────────────

function MomentumCard({ playerId, teamId }: { playerId: string; teamId: string }) {
  const { data, isLoading } = useQuery<PlayerMomentum | null>({
    queryKey: ['player-momentum', playerId, teamId],
    queryFn: async () => {
      const res = await fetch(`/api/team-momentum?team_id=${teamId}`);
      if (!res.ok) return null;
      const json = await res.json();
      return (json.players as PlayerMomentum[]).find((p) => p.player_id === playerId) ?? null;
    },
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            Momentum Score
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const tierColor = getMomentumColor(data.tier);
  const badgeClasses = getMomentumBadgeClasses(data.tier);
  const score = formatMomentumScore(data.score);
  const hot = isHotStreak(data.score);

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          Momentum Score
          {hot && (
            <span className="rounded-full bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold text-orange-400">
              🔥 Hot Streak
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score + tier */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center justify-center h-20 w-20 shrink-0 rounded-full border-4 border-zinc-800"
            style={{ borderColor: data.tier === 'rising' ? 'rgb(16 185 129 / 0.4)' : data.tier === 'needs_attention' ? 'rgb(251 191 36 / 0.4)' : 'rgb(96 165 250 / 0.4)' }}
          >
            <span className={`text-2xl font-bold tabular-nums ${tierColor}`}>{score}</span>
            <span className="text-[10px] text-zinc-500 mt-0.5">/ 100</span>
          </div>
          <div className="space-y-1">
            <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClasses}`}>
              {data.tier === 'rising' ? '↑' : data.tier === 'needs_attention' ? '↓' : '→'}{' '}
              {getMomentumLabel(data.tier)}
            </span>
            <p className="text-xs text-zinc-500">Based on last 14 days of activity</p>
          </div>
        </div>

        {/* Factor breakdown */}
        {data.factors.length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.factors.map((factor) => (
              <div key={factor.name} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-zinc-400">{factor.name}</p>
                  <span className={`text-sm font-bold tabular-nums ${
                    factor.score >= 18 ? 'text-emerald-400' :
                    factor.score >= 10 ? 'text-blue-400' :
                    'text-amber-400'
                  }`}>{factor.score}<span className="text-zinc-600 text-[10px]">/25</span></span>
                </div>
                {/* Mini bar */}
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      factor.score >= 18 ? 'bg-emerald-500' :
                      factor.score >= 10 ? 'bg-blue-500' :
                      'bg-amber-500'
                    }`}
                    style={{ width: `${(factor.score / 25) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-zinc-600 leading-tight">{factor.detail}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PlayerDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = use(params);
  const { activeTeam, coach } = useActiveTeam();
  const { practiceActive, practiceSessionId } = useAppStore((s) => ({
    practiceActive: s.practiceActive,
    practiceSessionId: s.practiceSessionId,
  }));
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showQuickEntry, setShowQuickEntry] = useState(false);

  // Report card state
  const [reportCardLoading, setReportCardLoading] = useState(false);
  const [reportCardError, setReportCardError] = useState<string | null>(null);
  const [reportCardData, setReportCardData] = useState<any>(null);

  // Share link state
  const [shareLinkLoading, setShareLinkLoading] = useState(false);
  const [shareLinkError, setShareLinkError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareSent, setShareSent] = useState(false);
  const [showQR, setShowQR] = useState(false);

  // Skill challenge state
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeData, setChallengeData] = useState<any>(null);
  const [challengeTextCopied, setChallengeTextCopied] = useState(false);

  // Season storyline state
  const [storylineLoading, setStorylineLoading] = useState(false);
  const [storylineError, setStorylineError] = useState<string | null>(null);
  const [storylineData, setStorylineData] = useState<any>(null);

  // Self-assessment state
  const [selfRatings, setSelfRatings] = useState<Record<string, number>>({});
  const [selfNotes, setSelfNotes] = useState('');
  const [selfOverall, setSelfOverall] = useState(3);
  const [selfSaving, setSelfSaving] = useState(false);
  const [selfError, setSelfError] = useState<string | null>(null);
  const [selfSuccess, setSelfSuccess] = useState(false);
  const [expandedAssessment, setExpandedAssessment] = useState<string | null>(null);

  // Development Card state
  const [devCardLoading, setDevCardLoading] = useState(false);
  const [devCardError, setDevCardError] = useState<string | null>(null);
  const [devCardData, setDevCardData] = useState<any>(null);

  // Observation highlights filter
  const [obsHighlightsOnly, setObsHighlightsOnly] = useState(false);

  const { data: player, isLoading: playerLoading } = useQuery({
    queryKey: queryKeys.players.detail(playerId),
    queryFn: async () => {
      const data = await query<Player>({
        table: 'players',
        select: '*',
        filters: { id: playerId },
        single: true,
      });
      return data;
    },
    ...CACHE_PROFILES.roster,
  });

  const { data: observations = [] } = useQuery({
    queryKey: queryKeys.observations.player(playerId),
    queryFn: async () => {
      const data = await query<Observation[]>({
        table: 'observations',
        select: '*',
        filters: { player_id: playerId },
        order: { column: 'created_at', ascending: false },
        limit: 50,
      });
      return data || [];
    },
    ...CACHE_PROFILES.observations,
  });

  const { data: proficiencies = [] } = useQuery({
    queryKey: queryKeys.players.proficiency(playerId),
    queryFn: async () => {
      const data = await query<(PlayerSkillProficiency & {
        curriculum_skills: { name: string; category: string } | null;
      })[]>({
        table: 'player_skill_proficiency',
        select: '*, curriculum_skills(name, category)',
        filters: { player_id: playerId },
        order: { column: 'computed_at', ascending: false },
      });
      return data || [];
    },
    ...CACHE_PROFILES.proficiency,
  });

  const { data: selfAssessments = [] } = useQuery({
    queryKey: queryKeys.selfAssessments.player(playerId),
    queryFn: async () => {
      const data = await query<Plan[]>({
        table: 'plans',
        select: '*',
        filters: { player_id: playerId, type: 'self_assessment' },
        order: { column: 'created_at', ascending: false },
        limit: 10,
      });
      return data || [];
    },
    enabled: activeTab === 'self-assessment',
    ...CACHE_PROFILES.roster,
  });

  // Existing share token — auto-loads so the coach never loses their share link
  const { data: existingShare } = useQuery<ParentShare | null>({
    queryKey: ['player-share-existing', playerId],
    queryFn: async () => {
      const shares = await query<ParentShare[]>({
        table: 'parent_shares',
        select: 'id, share_token, view_count, last_viewed_at, expires_at, created_at',
        filters: { player_id: playerId, is_active: true },
        order: { column: 'created_at', ascending: false },
        limit: 1,
      });
      const share = shares?.[0] ?? null;
      if (share?.expires_at && new Date(share.expires_at) < new Date()) return null;
      return share;
    },
    enabled: !!playerId && activeTab === 'share',
    staleTime: 60 * 1000,
  });

  useEffect(() => {
    if (existingShare && !shareUrl) {
      setShareUrl(`${window.location.origin}/share/${existingShare.share_token}`);
    }
  }, [existingShare, shareUrl]);

  // Attendance stats for this player
  const { data: attendanceStat } = useQuery<PlayerAttendanceStat>({
    queryKey: ['attendance-stats-player', playerId],
    queryFn: async () => {
      const res = await fetch(`/api/attendance-stats?player_id=${playerId}`);
      if (!res.ok) throw new Error('Failed to load attendance stats');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    enabled: activeTab === 'overview',
  });

  // Category breakdown
  const categoryBreakdown = observations.reduce<Record<string, number>>((acc, obs) => {
    acc[obs.category] = (acc[obs.category] || 0) + 1;
    return acc;
  }, {});

  const sortedCategories = Object.entries(categoryBreakdown)
    .sort(([, a], [, b]) => b - a);

  const maxCategoryCount = sortedCategories.length > 0 ? sortedCategories[0][1] : 0;

  // Toggle highlight on a player observation with optimistic update
  async function handleTogglePlayerObsHighlight(obsId: string, next: boolean) {
    const cacheKey = queryKeys.observations.player(playerId);
    qc.setQueryData<Observation[]>(cacheKey, (prev) =>
      prev ? prev.map((o) => o.id === obsId ? { ...o, is_highlighted: next } : o) : prev,
    );
    try {
      await mutate({ table: 'observations', operation: 'update', data: { is_highlighted: next }, filters: { id: obsId } });
    } catch {
      qc.setQueryData<Observation[]>(cacheKey, (prev) =>
        prev ? prev.map((o) => o.id === obsId ? { ...o, is_highlighted: !next } : o) : prev,
      );
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'observations', label: 'Observations', icon: <Eye className="h-4 w-4" /> },
    { id: 'goals', label: 'Goals', icon: <Flag className="h-4 w-4" /> },
    { id: 'notes', label: 'Notes', icon: <StickyNote className="h-4 w-4" /> },
    { id: 'challenges', label: 'Challenges', icon: <Target className="h-4 w-4" /> },
    { id: 'storyline', label: 'Storyline', icon: <BookOpen className="h-4 w-4" /> },
    { id: 'self-assessment', label: 'Self-Rate', icon: <ClipboardCheck className="h-4 w-4" /> },
    { id: 'media', label: 'Media', icon: <Camera className="h-4 w-4" /> },
    { id: 'report-card', label: 'Report Card', icon: <FileText className="h-4 w-4" /> },
    { id: 'share', label: 'Share', icon: <Share2 className="h-4 w-4" /> },
  ];

  async function handleGenerateReportCard() {
    if (!activeTeam || !player) return;
    setReportCardLoading(true);
    setReportCardError(null);
    try {
      const res = await fetch('/api/ai/report-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, playerId: player.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate report card');
      }
      const data = await res.json();
      setReportCardData(data.content);
    } catch (err) {
      setReportCardError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setReportCardLoading(false);
    }
  }

  async function handleGenerateChallenges() {
    if (!activeTeam || !player) return;
    setChallengeLoading(true);
    setChallengeError(null);
    try {
      const res = await fetch('/api/ai/skill-challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, playerId: player.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate challenges');
      }
      const data = await res.json();
      setChallengeData(data.content);
    } catch (err) {
      setChallengeError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setChallengeLoading(false);
    }
  }

  async function copyChallengeText() {
    if (!challengeData) return;
    const challenges = Array.isArray(challengeData.challenges) ? challengeData.challenges : [];
    const lines = [
      `🏀 ${challengeData.week_label ?? 'Weekly'} Skill Challenges for ${player?.name ?? 'your player'}`,
      '',
      ...challenges.flatMap((c: any, i: number) => [
        `Challenge ${i + 1}: ${c.title} (${c.skill_area})`,
        `⏱ ${c.minutes_per_day} min/day  •  ${c.difficulty}`,
        c.description,
        ...((c.steps ?? []) as string[]).map((s: string, si: number) => `  ${si + 1}. ${s}`),
        `✅ Success: ${c.success_criteria}`,
        `💬 ${c.encouragement}`,
        '',
      ]),
      challengeData.parent_note ? `Note for parents: ${challengeData.parent_note}` : '',
    ].filter((l) => l !== undefined);
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setChallengeTextCopied(true);
      setTimeout(() => setChallengeTextCopied(false), 2000);
    } catch {
      // clipboard not available
    }
  }

  async function handleGenerateDevCard() {
    if (!activeTeam || !player) return;
    setDevCardLoading(true);
    setDevCardError(null);
    try {
      const res = await fetch('/api/ai/development-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, playerId: player.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate development card');
      }
      const data = await res.json();
      setDevCardData(data.content);
    } catch (err) {
      setDevCardError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setDevCardLoading(false);
    }
  }

  async function handleGenerateStoryline() {
    if (!activeTeam || !player) return;
    setStorylineLoading(true);
    setStorylineError(null);
    try {
      const res = await fetch('/api/ai/season-storyline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: activeTeam.id, playerId: player.id }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to generate season storyline');
      }
      const data = await res.json();
      setStorylineData(data.content);
    } catch (err) {
      setStorylineError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setStorylineLoading(false);
    }
  }

  async function handleSaveSelfAssessment() {
    if (!activeTeam || !player || !coach) return;
    setSelfSaving(true);
    setSelfError(null);
    setSelfSuccess(false);

    const skillRatings = proficiencies
      .filter((prof) => selfRatings[prof.skill_id] && selfRatings[prof.skill_id] > 0)
      .map((prof) => ({
        skill_id: prof.skill_id,
        skill_name: prof.curriculum_skills?.name || prof.skill_id,
        category: prof.curriculum_skills?.category || '',
        self_rating: selfRatings[prof.skill_id],
        coach_level: prof.proficiency_level,
      }));

    if (skillRatings.length === 0) {
      setSelfError('Please rate at least one skill before saving.');
      setSelfSaving(false);
      return;
    }

    try {
      await mutate({
        table: 'plans',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          player_id: playerId,
          type: 'self_assessment',
          title: `Self-Assessment — ${player.name} — ${new Date().toLocaleDateString()}`,
          content: JSON.stringify({ skill_ratings: skillRatings, overall_confidence: selfOverall, player_notes: selfNotes }),
          content_structured: {
            submitted_at: new Date().toISOString(),
            skill_ratings: skillRatings,
            overall_confidence: selfOverall,
            player_notes: selfNotes || null,
          },
          skills_targeted: proficiencies.map((p) => p.skill_id),
        },
      });
      setSelfSuccess(true);
      setSelfRatings({});
      setSelfNotes('');
      setSelfOverall(3);
      qc.invalidateQueries({ queryKey: queryKeys.selfAssessments.player(playerId) });
      setTimeout(() => setSelfSuccess(false), 4000);
    } catch (err) {
      setSelfError(err instanceof Error ? err.message : 'Failed to save self-assessment');
    } finally {
      setSelfSaving(false);
    }
  }

  async function handleCreateShareLink() {
    if (!activeTeam || !player) return;
    setShareLinkLoading(true);
    setShareLinkError(null);
    try {
      const res = await fetch('/api/share/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          playerId: player.id,
          expirationDays: 30,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create share link');
      }
      const data = await res.json();
      const fullUrl = `${window.location.origin}${data.shareUrl}`;
      setShareUrl(fullUrl);
      qc.invalidateQueries({ queryKey: ['player-share-existing', playerId] });
    } catch (err) {
      setShareLinkError(err instanceof Error ? err.message : 'Failed to create share link');
    } finally {
      setShareLinkLoading(false);
    }
  }

  async function handleWebShare() {
    if (!shareUrl || !player) return;
    const text = `Here's ${player.name}'s progress report from ${activeTeam?.name ?? 'the team'}:`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: `${player.name}'s Progress Report`, text, url: shareUrl });
      } else {
        window.open(
          `https://api.whatsapp.com/send?text=${encodeURIComponent(`${text}\n${shareUrl}`)}`,
          '_blank',
        );
      }
      setShareSent(true);
      setTimeout(() => setShareSent(false), 2000);
    } catch {
      // User cancelled — no action needed
    }
  }

  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      // Fallback
    }
  }

  if (playerLoading) {
    return (
      <div className="space-y-6 p-4 lg:p-8 pb-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-300">Player not found</h2>
        <Link href="/roster">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Roster
          </Button>
        </Link>
      </div>
    );
  }


  function renderReportCardContent(rc: any) {
    if (!rc) return null;

    return (
      <div className="space-y-6">
        {rc.summary && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-2">Summary</h3>
            <p className="text-sm text-zinc-300">{rc.summary}</p>
          </div>
        )}

        {rc.strengths && rc.strengths.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400 mb-2">Strengths</h3>
            <ul className="space-y-1.5">
              {rc.strengths.map((s: any, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-500 shrink-0" />
                  {typeof s === 'string' ? s : s.skill || s.description || s.name || s.text || (typeof s === 'object' ? Object.values(s).filter(v => typeof v === 'string').join(' — ') : String(s))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rc.areas_for_improvement && rc.areas_for_improvement.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400 mb-2">Areas for Improvement</h3>
            <ul className="space-y-1.5">
              {rc.areas_for_improvement.map((a: any, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                  {typeof a === 'string' ? a : a.skill || a.description || a.name || a.text || (typeof a === 'object' ? Object.values(a).filter(v => typeof v === 'string').join(' — ') : String(a))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {rc.grades && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-2">Grades</h3>
            <div className="grid grid-cols-2 gap-2">
              {(Array.isArray(rc.grades) ? rc.grades : Object.entries(rc.grades).map(([k, v]) => ({ skill: k, grade: v }))).map(
                (g: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/30 p-2">
                    <span className="text-sm text-zinc-300">{g.skill || g.category}</span>
                    <Badge variant="secondary">{g.grade || g.level || g.score}</Badge>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {rc.recommendations && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400 mb-2">Recommendations</h3>
            <ul className="space-y-1.5">
              {(Array.isArray(rc.recommendations) ? rc.recommendations : [rc.recommendations]).map(
                (r: any, i: number) => (
                  <li key={i} className="text-sm text-zinc-300">
                    - {typeof r === 'string' ? r : r.description || r.text || r.name || String(r)}
                  </li>
                )
              )}
            </ul>
          </div>
        )}

        {/* Skills with proficiency */}
        {rc.skills && Array.isArray(rc.skills) && rc.skills.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-400 mb-3">Skills</h3>
            <div className="space-y-2">
              {rc.skills.map((s: any, i: number) => (
                <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-zinc-200">{s.skill_name || s.name || s.skill || `Skill ${i + 1}`}</span>
                    {(s.proficiency_level || s.level || s.grade) && (
                      <Badge variant="secondary">{s.proficiency_level || s.level || s.grade}</Badge>
                    )}
                  </div>
                  {s.narrative && <p className="text-xs text-zinc-400 leading-relaxed">{s.narrative}</p>}
                  {s.description && !s.narrative && <p className="text-xs text-zinc-400 leading-relaxed">{s.description}</p>}
                  {s.trend && <p className="text-xs text-zinc-500 mt-1">Trend: <span className={s.trend === 'improving' || s.trend === 'positive' ? 'text-emerald-400' : 'text-zinc-400'}>{s.trend}</span></p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Growth areas */}
        {rc.growth_areas && Array.isArray(rc.growth_areas) && rc.growth_areas.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-orange-400 mb-2">Growth Areas</h3>
            <ul className="space-y-1.5">
              {rc.growth_areas.map((g: any, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-zinc-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 text-orange-500 shrink-0" />
                  {typeof g === 'string' ? g : g.description || g.text || g.name || (typeof g === 'object' ? Object.values(g).filter(v => typeof v === 'string').join(' — ') : String(g))}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Coach note */}
        {(rc.coach_note || rc.coach_message) && (
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-purple-400 mb-2">Coach&apos;s Note</h3>
            <p className="text-sm text-zinc-300 italic leading-relaxed">{rc.coach_note || rc.coach_message}</p>
          </div>
        )}

        {/* Home practice suggestion */}
        {rc.home_practice_suggestion && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-400 mb-2">Home Practice</h3>
            <p className="text-sm text-zinc-300 leading-relaxed">{rc.home_practice_suggestion}</p>
          </div>
        )}

        {/* Fallback: render any other top-level keys */}
        {Object.entries(rc)
          .filter(([key]) => !['summary', 'skills', 'strengths', 'growth_areas', 'areas_for_improvement', 'grades', 'recommendations', 'coach_note', 'coach_message', 'home_practice_suggestion', 'season_summary', 'title', 'player_name'].includes(key))
          .map(([key, value]) => (
            <div key={key}>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                {key.replace(/_/g, ' ')}
              </h3>
              <div className="text-sm text-zinc-300 whitespace-pre-wrap">
                {typeof value === 'string'
                  ? value
                  : Array.isArray(value)
                  ? (value as any[]).map((item: any, i: number) => (
                      <p key={i} className="mb-1">
                        - {typeof item === 'string' ? item : item?.name || item?.text || item?.description || item?.narrative || item?.skill_name || (typeof item === 'object' ? Object.values(item).filter((v: unknown) => typeof v === 'string').join(' — ') : String(item))}
                      </p>
                    ))
                  : typeof value === 'object' && value !== null
                  ? Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                      <p key={k} className="mb-1">
                        <span className="font-medium text-zinc-400">{k.replace(/_/g, ' ')}:</span> {String(v)}
                      </p>
                    ))
                  : String(value)}
              </div>
            </div>
          ))}
      </div>
    );
  }

  return (
    <>
    <div className="space-y-6 p-4 lg:p-8 pb-8 overflow-x-hidden">
      {/* Back link */}
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Roster
      </Link>

      {/* Player Header */}
      <Card>
        <CardContent className="flex items-center gap-5 p-6">
          <PlayerAvatar photoUrl={player.photo_url} name={player.name} size={80} />
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-100">{player.name}</h1>
              {player.jersey_number !== null && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-orange-400">
                  #{player.jersey_number}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge>{player.position}</Badge>
              {player.age_group && (
                <span className="text-sm text-zinc-400">{player.age_group}</span>
              )}
            </div>
            {player.nickname && (
              <p className="mt-1 text-sm text-zinc-500">
                &ldquo;{player.nickname}&rdquo;
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={showQuickEntry ? 'secondary' : 'default'}
                onClick={() => setShowQuickEntry((v) => !v)}
                aria-pressed={showQuickEntry}
              >
                <Zap className="h-3.5 w-3.5" />
                {showQuickEntry ? 'Done' : 'Quick observation'}
              </Button>
              <Link href={`/roster/${playerId}/edit`}>
                <Button size="sm" variant="outline">Edit</Button>
              </Link>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-2xl font-bold text-orange-500">{observations.length}</p>
              <p className="text-xs text-zinc-500">observations</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Inline rapid-entry panel */}
      {showQuickEntry && activeTeam && coach && (
        <PlayerFocusEntry
          player={{
            id: player.id,
            name: player.name,
            jersey_number: player.jersey_number ?? null,
            photo_url: player.photo_url ?? null,
          }}
          teamId={activeTeam.id}
          coachId={coach.id}
          sessionId={practiceActive && practiceSessionId ? practiceSessionId : undefined}
          compact
          autoFocusInput
          onClose={() => setShowQuickEntry(false)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-1 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-2 text-sm font-medium transition-colors sm:px-3 ${
              activeTab === tab.id
                ? 'bg-orange-500/20 text-orange-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Category Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedCategories.length === 0 ? (
                <p className="text-sm text-zinc-500">No observations recorded yet.</p>
              ) : (
                sortedCategories.map(([category, count]) => (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300">{category}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all"
                        style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Skill Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skill Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {proficiencies.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Skill proficiencies will appear here once enough observations have been recorded.
                </p>
              ) : (
                <>
                  {/* Skills at a Glance summary strip */}
                  {(() => {
                    const improving = proficiencies.filter((p) => p.trend === 'improving');
                    const regressing = proficiencies.filter((p) => p.trend === 'regressing');
                    if (improving.length === 0 && regressing.length === 0) return null;
                    return (
                      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Skills at a Glance</p>
                        <div className="flex flex-wrap gap-1.5">
                          {improving.slice(0, 3).map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
                              ↑ {p.curriculum_skills?.name || p.skill_id}
                            </span>
                          ))}
                          {regressing.slice(0, 3).map((p) => (
                            <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400 border border-red-500/20">
                              ↓ {p.curriculum_skills?.name || p.skill_id}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  {proficiencies.slice(0, 8).map((prof) => (
                    <SkillProgressBar
                      key={prof.id}
                      skillName={prof.curriculum_skills?.name || prof.skill_id}
                      level={prof.proficiency_level}
                      successRate={prof.success_rate}
                      trend={prof.trend}
                    />
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {/* Attendance Summary */}
          {attendanceStat && attendanceStat.totalSessions > 0 && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarCheck className="h-4 w-4 text-orange-400" />
                  Attendance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  {/* Big % */}
                  <div className="flex flex-col items-center justify-center shrink-0 h-20 w-20 rounded-full border-4 border-zinc-800 bg-zinc-900 mx-auto sm:mx-0"
                    style={{
                      borderColor: attendanceStat.pct >= 80 ? 'rgb(16 185 129 / 0.5)' : attendanceStat.pct >= 60 ? 'rgb(251 191 36 / 0.5)' : 'rgb(239 68 68 / 0.5)',
                    }}
                  >
                    <span className={`text-2xl font-bold tabular-nums ${attendanceStat.pct >= 80 ? 'text-emerald-400' : attendanceStat.pct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                      {attendanceStat.pct}%
                    </span>
                    <span className="text-[10px] text-zinc-500 mt-0.5">present</span>
                  </div>

                  {/* Stats + dots */}
                  <div className="flex-1 space-y-3">
                    {/* Session counts */}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-1.5 text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {attendanceStat.present} present
                      </span>
                      {attendanceStat.excused > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-400">
                          <Clock className="h-3.5 w-3.5" />
                          {attendanceStat.excused} excused
                        </span>
                      )}
                      {attendanceStat.absent > 0 && (
                        <span className="text-red-400">{attendanceStat.absent} absent</span>
                      )}
                    </div>

                    {/* Recent session dots */}
                    {attendanceStat.recentSessions.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-zinc-500">Last {attendanceStat.recentSessions.length} sessions</p>
                        <div className="flex items-center gap-1.5" aria-label="Recent session attendance">
                          {attendanceStat.recentSessions.map((s, i) => (
                            <span
                              key={i}
                              title={`${s.date}: ${s.status}`}
                              className={`h-3 w-3 rounded-full shrink-0 ${
                                s.status === 'present'
                                  ? 'bg-emerald-500'
                                  : s.status === 'excused'
                                    ? 'bg-amber-400'
                                    : 'bg-red-500'
                              }`}
                            />
                          ))}
                          <span className="text-xs text-zinc-600 ml-1">← newest</span>
                        </div>
                      </div>
                    )}

                    {/* Bar */}
                    <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          attendanceStat.pct >= 80 ? 'bg-emerald-500' : attendanceStat.pct >= 60 ? 'bg-amber-400' : 'bg-red-500'
                        }`}
                        style={{ width: `${attendanceStat.pct}%` }}
                      />
                    </div>
                    <p className="text-xs text-zinc-500">{attendanceStat.totalSessions} session{attendanceStat.totalSessions !== 1 ? 's' : ''} tracked this season</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Momentum Score */}
          {activeTeam && (
            <MomentumCard playerId={playerId} teamId={activeTeam.id} />
          )}

          {/* Achievement Badges */}
          {coach && (
            <div className="lg:col-span-2">
              <AchievementBadgesPanel
                playerId={playerId}
                coachId={coach.id}
                playerName={player?.name}
                parentPhone={player?.parent_phone}
                coachName={coach.full_name}
              />
            </div>
          )}

          {/* Development Card */}
          <Card className="lg:col-span-2 border-indigo-500/20">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-indigo-400" />
                <CardTitle className="text-base">Development Card</CardTitle>
              </div>
              {devCardData && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerateDevCard}
                  disabled={devCardLoading}
                  className="h-8 px-2 text-xs text-zinc-400 hover:text-zinc-200"
                  aria-label="Regenerate development card"
                >
                  {devCardLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {devCardError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400 mb-4">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{devCardError}</span>
                </div>
              )}

              {!devCardData && !devCardLoading && (
                <div className="flex flex-col items-center py-6 text-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
                    <TrendingUp className="h-6 w-6 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-200">AI Development Card</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Get a personalised strengths analysis, development goals, and drill recommendations for {player?.name ?? 'this player'}.</p>
                  </div>
                  <Button size="sm" onClick={handleGenerateDevCard} disabled={devCardLoading} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Generate Development Card
                  </Button>
                </div>
              )}

              {devCardLoading && !devCardData && (
                <div className="flex flex-col items-center py-8 gap-3 text-zinc-500">
                  <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                  <p className="text-sm">Analysing {player?.name}&rsquo;s data&hellip;</p>
                </div>
              )}

              {devCardData && (
                <div className="space-y-4">
                  {/* Strengths & Growth Areas */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    {Array.isArray(devCardData.strengths) && devCardData.strengths.length > 0 && (
                      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">Strengths</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(devCardData.strengths as string[]).map((s: string, i: number) => (
                            <span key={i} className="inline-flex items-center rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                              ✓ {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {Array.isArray(devCardData.growth_areas) && devCardData.growth_areas.length > 0 && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">Growth Areas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(devCardData.growth_areas as string[]).map((g: string, i: number) => (
                            <span key={i} className="inline-flex items-center rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                              → {g}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Goals */}
                  {Array.isArray(devCardData.goals) && devCardData.goals.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Development Goals</p>
                      {devCardData.goals.map((goal: any, i: number) => (
                        <div key={i} className="rounded-xl border border-zinc-700/50 bg-zinc-900/60 p-3 space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-[10px] font-bold text-indigo-300">{i + 1}</div>
                              <p className="text-sm font-semibold text-zinc-100">{goal.skill}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0 text-[11px] text-zinc-500">
                              <span className="rounded-full bg-zinc-800 px-2 py-0.5">{goal.current_level}</span>
                              <span>→</span>
                              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-indigo-300">{goal.target_level}</span>
                            </div>
                          </div>
                          {Array.isArray(goal.action_steps) && goal.action_steps.length > 0 && (
                            <ul className="space-y-1 pl-7">
                              {goal.action_steps.map((step: string, si: number) => (
                                <li key={si} className="flex items-start gap-1.5 text-xs text-zinc-400">
                                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-zinc-600" />
                                  {step}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommended Drills */}
                  {Array.isArray(devCardData.recommended_drills) && devCardData.recommended_drills.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Recommended Drills</p>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {devCardData.recommended_drills.map((d: any, i: number) => (
                          <div key={i} className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-3 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Sparkles className="h-3 w-3 text-indigo-400 shrink-0" />
                              <p className="text-xs font-medium text-zinc-200 leading-tight">{d.name}</p>
                            </div>
                            <p className="text-xs text-zinc-500 leading-relaxed">{d.description}</p>
                            {d.focus && (
                              <span className="inline-block rounded-full bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 text-[10px] text-indigo-300">
                                {d.focus}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Coach Note */}
                  {devCardData.coach_note && (
                    <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/40 p-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Coach Note</p>
                      <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{devCardData.coach_note}&rdquo;</p>
                    </div>
                  )}

                  <Link href="/plans" className="inline-flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
                    <ExternalLink className="h-3 w-3" />
                    View in Plans
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Observations */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Observations</CardTitle>
              <button
                type="button"
                onClick={() => setActiveTab('observations')}
                className="text-sm text-orange-500 hover:text-orange-400"
              >
                View all
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {observations.length === 0 ? (
                <p className="text-sm text-zinc-500">No observations yet.</p>
              ) : (
                observations.slice(0, 5).map((obs) => (
                  <div
                    key={obs.id}
                    className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                  >
                    <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-600" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={sentimentVariant[obs.sentiment]}>
                          {sentimentLabel[obs.sentiment]}
                        </Badge>
                        <span className="text-xs text-zinc-500">{obs.category}</span>
                        <span className="text-xs text-zinc-600">
                          {formatDate(obs.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-300">{obs.text}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>
      )}

      {activeTab === 'observations' && (
        <div className="space-y-3">
          {/* Highlights filter toggle */}
          {observations.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setObsHighlightsOnly((v) => !v)}
                aria-pressed={obsHighlightsOnly}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors touch-manipulation ${
                  obsHighlightsOnly
                    ? 'bg-amber-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                }`}
              >
                <Star className={`h-3.5 w-3.5 ${obsHighlightsOnly ? 'fill-white' : ''}`} />
                Highlights only
                {!obsHighlightsOnly && countHighlighted(observations) > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-1.5 text-amber-400 text-[10px]">
                    {countHighlighted(observations)}
                  </span>
                )}
              </button>
            </div>
          )}

          {(() => {
            const displayed = obsHighlightsOnly
              ? observations.filter((o) => o.is_highlighted)
              : observations;

            if (displayed.length === 0) {
              return (
                <Card>
                  <CardContent className="flex flex-col items-center p-8 text-center">
                    {obsHighlightsOnly ? (
                      <>
                        <Star className="mb-3 h-10 w-10 text-zinc-700" />
                        <p className="text-zinc-400">No highlights yet. Tap ★ on any observation to star it.</p>
                        <button
                          onClick={() => setObsHighlightsOnly(false)}
                          className="mt-3 text-sm text-orange-400 hover:text-orange-300 transition-colors"
                        >
                          Show all observations
                        </button>
                      </>
                    ) : (
                      <>
                        <Eye className="mb-3 h-10 w-10 text-zinc-700" />
                        <p className="text-zinc-400">No observations recorded for this player yet.</p>
                        <Link href="/capture">
                          <Button className="mt-4" size="sm">Start Capturing</Button>
                        </Link>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            }

            return displayed.map((obs) => (
              <Card
                key={obs.id}
                className={obs.is_highlighted ? 'border-amber-500/40 bg-amber-500/5' : ''}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant={sentimentVariant[obs.sentiment]}>
                      {sentimentLabel[obs.sentiment]}
                    </Badge>
                    <Badge variant="outline">{obs.category}</Badge>
                    <Badge variant="secondary">{obs.source}</Badge>
                    <span className="ml-auto text-xs text-zinc-500">
                      {formatDate(obs.created_at)}
                    </span>
                    {/* Star / highlight button */}
                    <button
                      onClick={() => handleTogglePlayerObsHighlight(obs.id, !obs.is_highlighted)}
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors touch-manipulation active:scale-95 ${
                        obs.is_highlighted
                          ? 'text-amber-400 hover:text-amber-300'
                          : 'text-zinc-600 hover:text-zinc-400'
                      }`}
                      aria-label={obs.is_highlighted ? 'Remove from highlights' : 'Add to highlights'}
                      aria-pressed={obs.is_highlighted}
                    >
                      <Star className={`h-4 w-4 ${obs.is_highlighted ? 'fill-amber-400' : ''}`} />
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{obs.text}</p>
                  {obs.raw_text && obs.raw_text !== obs.text && (
                    <p className="mt-1 text-xs italic text-zinc-600">
                      Original: &ldquo;{obs.raw_text}&rdquo;
                    </p>
                  )}
                </CardContent>
              </Card>
            ));
          })()}
        </div>
      )}

      {activeTab === 'report-card' && (
        <UpgradeGate feature="report_cards" featureLabel="Report Cards">
        <div className="space-y-4">
          {reportCardError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{reportCardError}</span>
            </div>
          )}

          {reportCardData ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-base">
                  Report Card — {player.name}
                </CardTitle>
                <PrintButton label="Print / PDF" />
              </CardHeader>
              <CardContent>
                {renderReportCardContent(reportCardData)}
                <div className="mt-6 pt-4 border-t border-zinc-800">
                  <Button
                    onClick={handleGenerateReportCard}
                    disabled={reportCardLoading}
                    variant="outline"
                    size="sm"
                  >
                    {reportCardLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      'Regenerate Report Card'
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center p-8 text-center">
                <FileText className="mb-3 h-10 w-10 text-zinc-700" />
                <h3 className="font-semibold text-zinc-300">Report Card</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Generate a comprehensive report card summarizing {player.name}&apos;s progress.
                </p>
                <Button
                  className="mt-4"
                  onClick={handleGenerateReportCard}
                  disabled={reportCardLoading || !activeTeam}
                >
                  {reportCardLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    'Generate Report Card'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        </UpgradeGate>
      )}

      {activeTab === 'goals' && activeTeam && (
        <PlayerGoalsPanel playerId={playerId} teamId={activeTeam.id} />
      )}

      {activeTab === 'notes' && activeTeam && (
        <PlayerNotesPanel playerId={playerId} teamId={activeTeam.id} />
      )}

      {activeTab === 'challenges' && (
        <div className="space-y-4">
          {challengeError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{challengeError}</span>
            </div>
          )}

          {challengeData ? (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-amber-400" />
                    <h2 className="text-lg font-bold text-zinc-100">
                      {challengeData.week_label ?? 'This Week\'s Challenges'}
                    </h2>
                  </div>
                  <p className="mt-0.5 text-sm text-zinc-500">{player.name}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyChallengeText}
                  >
                    {challengeTextCopied ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1.5 text-emerald-500" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-1.5" />
                        Copy for parents
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleGenerateChallenges}
                    disabled={challengeLoading}
                  >
                    {challengeLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Challenge Cards */}
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-3">
                {(Array.isArray(challengeData.challenges) ? challengeData.challenges : []).map((c: any, i: number) => {
                  const diffColor =
                    c.difficulty === 'advanced'
                      ? 'text-red-400 bg-red-500/10 border-red-500/20'
                      : c.difficulty === 'intermediate'
                      ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
                      : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20';
                  const cardAccent =
                    i === 0
                      ? 'border-orange-500/30 from-orange-500/5'
                      : i === 1
                      ? 'border-blue-500/30 from-blue-500/5'
                      : 'border-purple-500/30 from-purple-500/5';
                  return (
                    <Card
                      key={i}
                      className={`bg-gradient-to-b ${cardAccent} to-zinc-900/50 border`}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-300">
                              {i + 1}
                            </div>
                            <CardTitle className="text-base leading-tight">{c.title}</CardTitle>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-300">
                            {c.skill_area}
                          </span>
                          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${diffColor}`}>
                            {c.difficulty}
                          </span>
                          {c.minutes_per_day && (
                            <span className="flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs text-zinc-400">
                              <Clock className="h-3 w-3" />
                              {c.minutes_per_day} min/day
                            </span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-0">
                        {c.description && (
                          <p className="text-sm text-zinc-400 leading-relaxed">{c.description}</p>
                        )}

                        {Array.isArray(c.steps) && c.steps.length > 0 && (
                          <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Steps</p>
                            <ol className="space-y-1.5">
                              {(c.steps as string[]).map((step, si) => (
                                <li key={si} className="flex items-start gap-2 text-sm text-zinc-300">
                                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                                    {si + 1}
                                  </span>
                                  {step}
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}

                        {c.success_criteria && (
                          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <Trophy className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-0.5">Success Goal</p>
                              <p className="text-sm text-zinc-300">{c.success_criteria}</p>
                            </div>
                          </div>
                        )}

                        {c.encouragement && (
                          <p className="text-xs text-zinc-500 italic leading-relaxed">
                            &ldquo;{c.encouragement}&rdquo;
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* Parent Note */}
              {challengeData.parent_note && (
                <Card className="border-zinc-700/50 bg-zinc-900/30">
                  <CardContent className="flex items-start gap-3 p-4">
                    <MessageSquare className="h-4 w-4 shrink-0 text-zinc-500 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Note for Parents</p>
                      <p className="text-sm text-zinc-400 leading-relaxed">{challengeData.parent_note}</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center p-8 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                  <Zap className="h-8 w-8 text-amber-400" />
                </div>
                <h3 className="font-semibold text-zinc-200">Weekly Skill Challenges</h3>
                <p className="mt-2 max-w-sm text-sm text-zinc-500 leading-relaxed">
                  AI analyzes {player.name}&apos;s recent coaching observations and generates
                  personalized at-home challenges to accelerate their growth.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs text-zinc-600">
                  <span className="flex items-center gap-1 rounded-full bg-zinc-800/60 px-2.5 py-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Personalized per player
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-zinc-800/60 px-2.5 py-1">
                    <Copy className="h-3 w-3 text-blue-400" /> Shareable with parents
                  </span>
                  <span className="flex items-center gap-1 rounded-full bg-zinc-800/60 px-2.5 py-1">
                    <Clock className="h-3 w-3 text-amber-400" /> 5-15 min/day
                  </span>
                </div>
                <Button
                  className="mt-6"
                  onClick={handleGenerateChallenges}
                  disabled={challengeLoading || !activeTeam}
                >
                  {challengeLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating challenges...
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4 mr-2" />
                      Generate This Week&apos;s Challenges
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === 'storyline' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-5 w-5 text-indigo-400" />
                Season Storyline
              </CardTitle>
              <p className="text-sm text-zinc-500">
                AI-generated narrative arc of {player?.name}&apos;s season journey — from their first observations to where they are today.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {storylineError && (
                <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{storylineError}</span>
                </div>
              )}
              {!storylineData && !storylineLoading && (
                <Button
                  onClick={handleGenerateStoryline}
                  disabled={storylineLoading}
                  className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium touch-manipulation active:scale-[0.98]"
                >
                  <BookOpen className="h-4 w-4 mr-2" />
                  Generate Season Storyline
                </Button>
              )}
              {storylineLoading && (
                <div className="flex items-center gap-3 rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-4">
                  <Loader2 className="h-5 w-5 text-indigo-400 animate-spin shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-indigo-300">Writing season storyline...</p>
                    <p className="text-xs text-zinc-500">Analyzing all observations and crafting the narrative arc</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {storylineData && (
            <div className="space-y-4">
              {/* Header */}
              <div className="rounded-xl border border-indigo-500/30 bg-gradient-to-b from-indigo-500/10 to-transparent p-5 text-center space-y-1">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <BookOpen className="h-5 w-5 text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Season Storyline</span>
                </div>
                <h2 className="text-xl font-bold text-zinc-100">{storylineData.player_name}</h2>
                {storylineData.season_label && (
                  <p className="text-xs text-zinc-500">{storylineData.season_label}</p>
                )}
              </div>

              {/* Opening */}
              {storylineData.opening && (
                <Card className="border-indigo-500/20">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400 mb-2">The Beginning</p>
                    <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{storylineData.opening}&rdquo;</p>
                  </CardContent>
                </Card>
              )}

              {/* Chapters */}
              {Array.isArray(storylineData.chapters) && storylineData.chapters.length > 0 && (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-zinc-300 px-1">Season Arc</p>
                  {storylineData.chapters.map((chapter: any, i: number) => (
                    <Card key={i} className="border-zinc-800">
                      <CardContent className="p-4 space-y-3">
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
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Current Strengths */}
              {Array.isArray(storylineData.current_strengths) && storylineData.current_strengths.length > 0 && (
                <Card className="border-emerald-500/20 bg-emerald-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Star className="h-4 w-4 text-emerald-400" />
                      <p className="text-sm font-semibold text-emerald-300">Current Strengths</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {storylineData.current_strengths.map((s: string, i: number) => (
                        <span key={i} className="text-xs bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 rounded-full px-2.5 py-1">{s}</span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Trajectory */}
              {storylineData.trajectory && (
                <Card className="border-orange-500/20 bg-orange-500/5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-orange-400" />
                      <p className="text-sm font-semibold text-orange-300">Where They&apos;re Headed</p>
                    </div>
                    <p className="text-sm text-zinc-300 leading-relaxed">{storylineData.trajectory}</p>
                  </CardContent>
                </Card>
              )}

              {/* Coach Reflection */}
              {storylineData.coach_reflection && (
                <Card className="border-zinc-700">
                  <CardContent className="p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Coach&apos;s Reflection</p>
                    <p className="text-sm text-zinc-300 leading-relaxed italic">&ldquo;{storylineData.coach_reflection}&rdquo;</p>
                  </CardContent>
                </Card>
              )}

              <Button
                variant="outline"
                onClick={() => { setStorylineData(null); setStorylineError(null); }}
                className="w-full"
              >
                Generate New Storyline
              </Button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'self-assessment' && (
        <div className="space-y-5">
          {/* Intro Card */}
          <Card className="border-teal-500/20 bg-gradient-to-b from-teal-500/10 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-500/15">
                  <ClipboardCheck className="h-5 w-5 text-teal-400" />
                </div>
                <div>
                  <h2 className="font-semibold text-zinc-100">Player Self-Assessment</h2>
                  <p className="text-xs text-teal-400">Ages 13+ · Coaching conversation tool</p>
                </div>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Have {player.name} rate their own skills (1–5 stars) during a 1-on-1 conversation.
                Compare their self-perception with your coaching assessment to spark meaningful discussions.
              </p>
            </CardContent>
          </Card>

          {/* Error / Success */}
          {selfError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{selfError}</span>
            </div>
          )}
          {selfSuccess && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Self-assessment saved! Great coaching conversation.</span>
            </div>
          )}

          {/* Skill Rating Form */}
          {proficiencies.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center p-8 text-center">
                <ClipboardCheck className="mb-3 h-10 w-10 text-zinc-700" />
                <h3 className="font-semibold text-zinc-300">No skills to assess yet</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Record some observations for {player.name} first so skills appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Rate Each Skill</CardTitle>
                <p className="text-xs text-zinc-500">
                  Ask {player.name} to rate themselves honestly — 1 = just starting, 5 = game-ready
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {proficiencies.slice(0, 12).map((prof) => {
                  const skillName = prof.curriculum_skills?.name || prof.skill_id;
                  const category = prof.curriculum_skills?.category || '';
                  const coachLevelLabel: Record<string, string> = {
                    insufficient_data: 'Not enough data',
                    exploring: 'Exploring',
                    practicing: 'Practicing',
                    got_it: 'Got It',
                    game_ready: 'Game Ready',
                  };
                  const coachLevelColor: Record<string, string> = {
                    insufficient_data: 'text-zinc-500',
                    exploring: 'text-blue-400',
                    practicing: 'text-amber-400',
                    got_it: 'text-emerald-400',
                    game_ready: 'text-orange-400',
                  };
                  const currentRating = selfRatings[prof.skill_id] || 0;
                  return (
                    <div key={prof.skill_id} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-zinc-200">{skillName}</p>
                          {category && <p className="text-xs text-zinc-500">{category}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-zinc-500">Coach says</p>
                          <p className={`text-xs font-semibold ${coachLevelColor[prof.proficiency_level] || 'text-zinc-400'}`}>
                            {coachLevelLabel[prof.proficiency_level] || prof.proficiency_level}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() =>
                              setSelfRatings((prev) => ({
                                ...prev,
                                [prof.skill_id]: prev[prof.skill_id] === star ? 0 : star,
                              }))
                            }
                            className="touch-manipulation p-1 transition-transform active:scale-90"
                            aria-label={`Rate ${skillName} ${star} stars`}
                          >
                            <Star
                              className={`h-7 w-7 transition-colors ${
                                star <= currentRating
                                  ? 'fill-teal-400 text-teal-400'
                                  : 'text-zinc-700 hover:text-zinc-500'
                              }`}
                            />
                          </button>
                        ))}
                        {currentRating > 0 && (
                          <span className="ml-2 text-xs text-teal-400 font-medium">
                            {currentRating === 1 ? 'Just starting' : currentRating === 2 ? 'Getting there' : currentRating === 3 ? 'Making progress' : currentRating === 4 ? 'Feeling confident' : 'I\'ve got this!'}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Overall confidence */}
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-zinc-200">Overall Confidence</p>
                  <p className="text-xs text-zinc-500">How confident does {player.name} feel about their game overall?</p>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setSelfOverall(star)}
                        className="touch-manipulation p-1 transition-transform active:scale-90"
                        aria-label={`Overall confidence ${star} stars`}
                      >
                        <Star
                          className={`h-7 w-7 transition-colors ${
                            star <= selfOverall
                              ? 'fill-orange-400 text-orange-400'
                              : 'text-zinc-700 hover:text-zinc-500'
                          }`}
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-xs text-orange-400 font-medium">
                      {selfOverall}/5
                    </span>
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2 block">
                    Player Notes (optional)
                  </label>
                  <textarea
                    value={selfNotes}
                    onChange={(e) => setSelfNotes(e.target.value)}
                    placeholder={`What does ${player.name} want to work on? What are they proud of?`}
                    rows={3}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-teal-500/50 focus:ring-1 focus:ring-teal-500/20 resize-none"
                  />
                </div>

                <Button
                  onClick={handleSaveSelfAssessment}
                  disabled={selfSaving || !activeTeam || !coach}
                  className="w-full h-12 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-medium touch-manipulation active:scale-[0.98]"
                >
                  {selfSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      Save Self-Assessment
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Past Assessments */}
          {selfAssessments.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-zinc-300 px-1">Previous Assessments</p>
              {selfAssessments.map((assessment) => {
                const structured = assessment.content_structured as any;
                const ratings = structured?.skill_ratings || [];
                const isExpanded = expandedAssessment === assessment.id;
                return (
                  <Card key={assessment.id} className="border-zinc-800">
                    <CardContent className="p-4">
                      <button
                        type="button"
                        onClick={() => setExpandedAssessment(isExpanded ? null : assessment.id)}
                        className="flex items-center justify-between w-full text-left touch-manipulation"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-200">
                            {assessment.title?.replace('Self-Assessment — ', '') || formatDate(assessment.created_at)}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {ratings.length} skill{ratings.length !== 1 ? 's' : ''} rated
                            {structured?.overall_confidence ? ` · Overall: ${structured.overall_confidence}/5` : ''}
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
                        )}
                      </button>

                      {isExpanded && (
                        <div className="mt-4 space-y-3">
                          {ratings.map((r: any, i: number) => {
                            const coachLevelMap: Record<string, number> = {
                              exploring: 1,
                              practicing: 3,
                              got_it: 4,
                              game_ready: 5,
                            };
                            const coachNumeric = coachLevelMap[r.coach_level] || 0;
                            const diff = r.self_rating - coachNumeric;
                            return (
                              <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <div>
                                    <p className="text-sm font-medium text-zinc-200">{r.skill_name}</p>
                                    {r.category && <p className="text-xs text-zinc-500">{r.category}</p>}
                                  </div>
                                  {coachNumeric > 0 && (
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diff > 0 ? 'bg-amber-500/15 text-amber-400' : diff < 0 ? 'bg-blue-500/15 text-blue-400' : 'bg-zinc-700/50 text-zinc-400'}`}>
                                      {diff > 0 ? `+${diff} vs coach` : diff < 0 ? `${diff} vs coach` : 'Aligned'}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3">
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <Star key={s} className={`h-4 w-4 ${s <= r.self_rating ? 'fill-teal-400 text-teal-400' : 'text-zinc-700'}`} />
                                    ))}
                                  </div>
                                  <span className="text-xs text-zinc-500">Player self-rating</span>
                                </div>
                              </div>
                            );
                          })}
                          {structured?.player_notes && (
                            <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1">Player Notes</p>
                              <p className="text-sm text-zinc-300 italic leading-relaxed">&ldquo;{structured.player_notes}&rdquo;</p>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {activeTab === 'media' && (
        <UpgradeGate feature="media_upload" featureLabel="Photo Capture">
        <div className="space-y-4">
          {/* Snap Observation CTA */}
          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/20">
                  <Camera className="h-6 w-6 text-amber-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-zinc-200">Snap Observation</h3>
                  <p className="mt-1 text-sm text-zinc-400">
                    Take or upload a practice photo. AI analyzes player positioning, footwork,
                    and technique — then generates coaching observations you can save instantly.
                  </p>
                  <Link
                    href={`/capture/photo?playerId=${playerId}`}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500/20 border border-amber-500/30 px-4 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/30 touch-manipulation"
                  >
                    <Camera className="h-4 w-4" />
                    Snap a Photo for {player.name}
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Hint about where saved observations appear */}
          <div className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
            <ImageIcon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
            <p className="text-xs text-zinc-500">
              Observations generated from photos are saved to the{' '}
              <button
                onClick={() => setActiveTab('observations')}
                className="font-medium text-zinc-400 underline decoration-dotted hover:text-zinc-300"
              >
                Observations tab
              </button>
              {' '}and tagged with the photo source.
            </p>
          </div>
        </div>
        </UpgradeGate>
      )}

      {activeTab === 'share' && (
        <UpgradeGate feature="parent_sharing" featureLabel="Parent Sharing">
        <div className="space-y-4">
          {shareLinkError && (
            <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{shareLinkError}</span>
            </div>
          )}

          {shareUrl ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-zinc-200">Ready to share with parents</h3>
                    <p className="text-sm text-zinc-500">
                      {existingShare?.view_count
                        ? `Viewed ${existingShare.view_count} time${existingShare.view_count !== 1 ? 's' : ''}${existingShare.last_viewed_at ? ` · last opened ${new Date(existingShare.last_viewed_at).toLocaleDateString()}` : ''}`
                        : `${player.name}’s progress report · expires in 30 days`}
                    </p>
                  </div>
                </div>

                {/* Primary CTA — native share on mobile, WhatsApp on desktop */}
                <Button
                  className="w-full gap-2"
                  onClick={handleWebShare}
                >
                  <Share2 className="h-4 w-4" />
                  {shareSent ? 'Sent!' : 'Send to Parent'}
                </Button>

                {/* QR Code — show to parent in-person after practice */}
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => setShowQR(true)}
                >
                  <QrCode className="h-4 w-4" />
                  Show QR Code
                </Button>

                {/* Link row with copy + preview */}
                <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 min-w-0 bg-transparent text-xs text-zinc-400 outline-none truncate"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={copyShareLink}
                    aria-label="Copy link"
                  >
                    {shareCopied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="ghost" aria-label="Preview report">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </a>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCreateShareLink}
                  disabled={shareLinkLoading}
                >
                  {shareLinkLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create New Link'
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center p-8 text-center">
                <Share2 className="mb-3 h-10 w-10 text-zinc-700" />
                <h3 className="font-semibold text-zinc-300">Share with Parents</h3>
                <p className="mt-1 text-sm text-zinc-500">
                  Create a shareable link for {player.name}&apos;s parents to view progress.
                </p>
                <Button
                  className="mt-4"
                  onClick={handleCreateShareLink}
                  disabled={shareLinkLoading || !activeTeam}
                >
                  {shareLinkLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Share Link'
                  )}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        </UpgradeGate>
      )}
    </div>

    {/* QR Code overlay — fullscreen so parents can scan in-person after practice */}
    {showQR && shareUrl && player && (
      <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col items-center justify-center p-6">
        <div className="flex flex-col items-center gap-6 max-w-xs w-full">
          <div className="text-center">
            <p className="text-sm text-zinc-500">{activeTeam?.name}</p>
            <h2 className="text-2xl font-bold text-white mt-0.5">{player.name}</h2>
            <p className="text-sm text-zinc-500 mt-0.5">Progress Report</p>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(shareUrl)}&color=09090b&bgcolor=ffffff&margin=0`}
              alt={`QR code for ${player.name}'s progress report`}
              width={240}
              height={240}
              className="block rounded"
            />
          </div>

          <p className="text-center text-sm text-zinc-400 leading-relaxed">
            Ask the parent to point their camera here —<br />
            they&apos;ll open {player.name}&apos;s report instantly
          </p>

          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={() => setShowQR(false)}
          >
            <X className="h-4 w-4" />
            Done
          </Button>
        </div>
      </div>
    )}
    </>
  );
}
