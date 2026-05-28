'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { resolveInsertedId, buildQuickGamePayload, quickGameDestination, type QuickGameType } from '@/lib/quick-game-utils';
import { useElapsedTime } from '@/hooks/use-elapsed-time';
import { shouldShowWrapUpNudge } from '@/lib/elapsed-time-utils';
import { formatSkillLabel } from '@/lib/skill-trend-utils';
import { getSportEmoji } from '@/lib/sport-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Mic,
  Users,
  ClipboardList,
  CalendarClock,
  Plus,
  Sparkles,
  ArrowRight,
  AlertTriangle,
  ChevronRight,
  Play,
  Square,
  Timer,
  History,
  Star,
  Share2,
  Trophy,
  CheckCircle2,
  X,
  Loader2,
  BarChart2,
} from 'lucide-react';
import type { Session, Plan } from '@/types/database';
import { useAppStore } from '@/lib/store';
import { PostPracticeDebrief } from '@/components/capture/post-practice-debrief';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { GettingStartedCard } from '@/components/home/getting-started-card';
import { FirstArtifactCard } from '@/components/home/first-artifact-card';
import { FirstPracticeLauncher } from '@/components/home/first-practice-launcher';
import { StreakCard } from '@/components/home/streak-card';
import { TeamWinsCard } from '@/components/home/team-wins-card';
import { ParentReactionsCard } from '@/components/home/parent-reactions-card';
import { DailyFocusCard } from '@/components/home/daily-focus-card';
import { BirthdayCard } from '@/components/home/birthday-card';
import { DrillOfDayCard } from '@/components/home/drill-of-day-card';
import { AICoachingTipsCard } from '@/components/home/ai-coaching-tips-card';
import { TeamSkillTrendsCard } from '@/components/home/team-skill-trends-card';
import { WeeklyFocusCard } from '@/components/home/weekly-focus-card';
import { FreemiumNudge } from '@/components/ui/freemium-nudge';
import { SeasonalPromo } from '@/components/onboarding/seasonal-promo';
import { PlayerBreakthroughCard } from '@/components/home/player-breakthrough-card';
import { PlayerOnARollCard } from '@/components/home/player-on-a-roll-card';
import { StrugglingPlayerCard } from '@/components/home/struggling-player-card';
import { PrePracticeSnapshotCard } from '@/components/home/pre-practice-snapshot-card';
import { ContinueArcCard } from '@/components/home/continue-arc-card';
import { WeeklyDigestSection } from '@/components/home/weekly-digest-card';
import { SeasonMomentumSection } from '@/components/home/season-momentum-card';
import { SeasonWrapSection } from '@/components/home/season-wrap-card';
import { ArcCompleteCard } from '@/components/home/arc-complete-card';
import { WeeklyWrapCard } from '@/components/home/weekly-wrap-card';
import { InviteCoachCard } from '@/components/home/invite-coach-card';
import { ReferralCelebrationCard } from '@/components/home/referral-celebration-card';
import { PlanClonesCard } from '@/components/home/plan-clones-card';
import { PendingCloneConsumer } from '@/components/home/pending-clone-consumer';
import { GameDayCard } from '@/components/home/game-day-card';
import { GoalDeadlineCard } from '@/components/home/goal-deadline-card';
import { QuickWinsCard } from '@/components/home/quick-wins-card';
import { HomeQuickObserveSheet } from '@/components/home/home-quick-observe-sheet';
import { SidelineCheatSheetCard } from '@/components/home/sideline-cheat-sheet-card';

// ─── Live capture feed helper ──────────────────────────────────────────────────

function formatLiveTimeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins === 1) return '1m ago';
  return `${mins}m ago`;
}

// ─── Shared reminder helpers ──────────────────────────────────────────────────────

const SESSION_REMINDER_EMOJI: Record<string, string> = {
  practice: '🏃',
  game: '🏆',
  scrimmage: '⚡',
  tournament: '🏅',
  training: '💪',
};

function buildReminderMsg(
  session: Pick<Session, 'type' | 'date' | 'start_time' | 'location' | 'opponent'>,
  coachName?: string | null,
  teamName?: string | null,
): string {
  function fmtT(t: string | null) {
    if (!t) return '';
    const [h, m] = t.split(':').map(Number);
    return ` ${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  }
  const LABEL: Record<string, string> = {
    practice: 'Practice', game: 'Game', scrimmage: 'Scrimmage',
    tournament: 'Tournament', training: 'Training',
  };
  const emoji = SESSION_REMINDER_EMOJI[session.type] ?? '📋';
  const today = new Date().toISOString().split('T')[0];
  const d = new Date((session.date ?? today) + 'T12:00:00');
  const dayLabel = session.date === today
    ? 'today'
    : d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  let msg = `${emoji} ${LABEL[session.type] ?? session.type} ${dayLabel}${fmtT(session.start_time)}`;
  if (session.opponent) msg += ` vs ${session.opponent}`;
  if (session.location) msg += `\n📍 ${session.location}`;
  const sig = [coachName && `— ${coachName}`, teamName].filter(Boolean).join(', ');
  if (sig) msg += `\n${sig}`;
  return msg;
}

async function shareReminder(msg: string, onSuccess: () => void) {
  try {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ text: msg });
    } else {
      await navigator.clipboard.writeText(msg);
    }
    onSuccess();
  } catch {
    // user cancelled or browser denied
  }
}

// ─── Today's Session Card ──────────────────────────────────────────────

function TodaySessionCard({
  session,
  restrictedPlayers,
  coachName,
  teamName,
}: {
  session: Session;
  restrictedPlayers: Array<{ name: string; status: string }>;
  coachName?: string | null;
  teamName?: string | null;
}) {
  const [reminded, setReminded] = useState(false);

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
        {(session.type === 'game' || session.type === 'scrimmage' || session.type === 'tournament') && (
          <Link href={`/sessions/${session.id}/game-tracker`}>
            <Button size="sm" variant="outline" className="shrink-0 gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300">
              <BarChart2 className="h-4 w-4" />
              Stats
            </Button>
          </Link>
        )}
        <Link href={`/capture?sessionId=${session.id}`}>
          <Button size="sm" variant="outline" className="shrink-0" aria-label="Capture observation">
            <Mic className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Remind parents — one-tap WhatsApp/share message with session details */}
      <button
        onClick={() =>
          shareReminder(buildReminderMsg(session, coachName, teamName), () => {
            setReminded(true);
            setTimeout(() => setReminded(false), 2500);
          })
        }
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-teal-500/20 bg-teal-500/5 px-4 py-2.5 text-sm font-medium text-teal-400 hover:bg-teal-500/10 hover:text-teal-300 transition-colors touch-manipulation active:scale-[0.98]"
      >
        <Share2 className="h-3.5 w-3.5 shrink-0" />
        {reminded ? 'Message ready to send ✓' : 'Remind Parents'}
      </button>
    </div>
  );
}

// ─── Upcoming Sessions Card ──────────────────────────────────────────────────────

function UpcomingSessionsCard({
  sessions,
  coachName,
  teamName,
}: {
  sessions: Session[];
  coachName?: string | null;
  teamName?: string | null;
}) {
  const [sharedId, setSharedId] = useState<string | null>(null);

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
          const isShared = sharedId === s.id;
          return (
            <div key={s.id} className="flex items-center gap-1">
              <Link href={`/sessions/${s.id}`} className="flex-1 min-w-0">
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
              <button
                onClick={() =>
                  shareReminder(buildReminderMsg(s, coachName, teamName), () => {
                    setSharedId(s.id);
                    setTimeout(() => setSharedId(null), 2500);
                  })
                }
                aria-label="Remind parents about this session"
                className={`shrink-0 rounded-lg p-2 transition-colors touch-manipulation ${
                  isShared
                    ? 'text-teal-400 bg-teal-500/10'
                    : 'text-zinc-600 hover:text-teal-400 hover:bg-teal-500/10'
                }`}
              >
                <Share2 className="h-4 w-4" />
              </button>
            </div>
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

// ─── Last Session Card ──────────────────────────────────────────────────────────

const SESSION_EMOJI: Record<string, string> = {
  practice: '🏃',
  game: '🏀',
  scrimmage: '⚡',
  tournament: '🏆',
  training: '💪',
};

const SESSION_LABEL: Record<string, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

function LastSessionCard({ session }: {
  session: { id: string; type: string; date: string; quality_rating?: number | null; coach_debrief_text?: string | null; coach_debrief_extracts?: unknown; observations?: [{ count: number }] };
}) {
  const obsCount = session.observations?.[0]?.count ?? 0;
  const emoji = SESSION_EMOJI[session.type] ?? '📋';
  const label = SESSION_LABEL[session.type] ?? session.type;
  const rating = session.quality_rating;
  const hasRating = rating != null && rating >= 1 && rating <= 5;
  const hasAiDebrief = session.coach_debrief_extracts != null;
  const showDebriefCta = !hasAiDebrief && obsCount >= 3;

  const daysDiff = Math.round(
    (Date.now() - new Date(session.date + 'T12:00:00').getTime()) / 86_400_000
  );
  const dateLabel = daysDiff === 1 ? 'Yesterday' : `${daysDiff} days ago`;

  return (
    <Card className="border-zinc-800">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg">
            {emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Last session · {dateLabel}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-zinc-200">{label}</p>
              {hasRating && (
                <div className="flex items-center gap-0.5" title={`Rated ${rating}/5`}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3 w-3 ${i < rating! ? 'text-amber-400 fill-amber-400' : 'text-zinc-700'}`}
                    />
                  ))}
                </div>
              )}
              {hasAiDebrief && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  AI done
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              {obsCount > 0
                ? `${obsCount} observation${obsCount !== 1 ? 's' : ''} captured`
                : 'No observations — tap to add'}
            </p>
            {session.coach_debrief_text && (
              <p className="text-xs text-zinc-600 italic mt-0.5 line-clamp-1">
                {session.coach_debrief_text.length > 55
                  ? session.coach_debrief_text.slice(0, 55) + '…'
                  : session.coach_debrief_text}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2">
          {showDebriefCta ? (
            <>
              <Link
                href={`/sessions/${session.id}?fromPractice=1&obsCount=${obsCount}`}
                className="flex-1"
              >
                <Button size="sm" className="w-full gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  AI Debrief
                </Button>
              </Link>
              <Link href={`/sessions/${session.id}`} className="shrink-0">
                <Button size="sm" variant="outline" className="gap-1.5">
                  <History className="h-3.5 w-3.5" />
                  View
                </Button>
              </Link>
            </>
          ) : (
            <Link href={`/sessions/${session.id}`} className="flex-1">
              <Button size="sm" variant="outline" className="w-full gap-1.5">
                <History className="h-3.5 w-3.5" />
                View Session
              </Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Greeting helpers ────────────────────────────────────────────────────────────────────────

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ─── Page ─────────────────────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { activeTeam, coach, aiPlatformAvailable, sportSlug } = useActiveTeam();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDebrief, setShowDebrief] = useState(false);
  const [showGameQuickStart, setShowGameQuickStart] = useState(false);
  const [gameType, setGameType] = useState<QuickGameType>('game');
  const [gameOpponent, setGameOpponent] = useState('');
  const [startingGame, setStartingGame] = useState(false);
  const [gameError, setGameError] = useState(false);
  const [midPracticeShared, setMidPracticeShared] = useState(false);

  const [qoPlayer, setQoPlayer] = useState<{ id: string; name: string; jersey_number: number | null } | null>(null);

  const hasAIKeys = (() => {
    if (aiPlatformAvailable) return true;
    const settings = (coach as any)?.organizations?.settings;
    const keys = settings?.ai_keys || {};
    return !!(keys.anthropic || keys.openai || keys.gemini);
  })();

  const practiceActive = useAppStore((s) => s.practiceActive);
  const setPracticeActive = useAppStore((s) => s.setPracticeActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);
  const setPracticeSessionId = useAppStore((s) => s.setPracticeSessionId);
  const setPracticeStartedAt = useAppStore((s) => s.setPracticeStartedAt);
  const practiceStartedAt = useAppStore((s) => s.practiceStartedAt);

  const elapsedTime = useElapsedTime(practiceActive ? practiceStartedAt : null);
  const showWrapUpNudge = practiceActive && shouldShowWrapUpNudge(practiceStartedAt);

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

  async function startPracticeWithTimer() {
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
        router.push(`/sessions/${id}/timer`);
      }
    } catch (err) {
      console.warn('Failed to start practice with timer:', err);
    }
  }

  async function startPracticeWithPlan(planId: string) {
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
        router.push(`/sessions/${id}/timer?planId=${planId}`);
      }
    } catch (err) {
      console.warn('Failed to start practice with plan:', err);
    }
  }

  async function quickStartGame() {
    if (!activeTeam || !coach || startingGame) return;
    setStartingGame(true);
    setGameError(false);
    try {
      const session = await mutate<{ id: string }>({
        table: 'sessions',
        operation: 'insert',
        data: buildQuickGamePayload(activeTeam.id, coach.id, gameType, gameOpponent),
        select: 'id',
      });
      const id = resolveInsertedId(session);
      if (id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.sessions.all(activeTeam.id) });
        router.push(quickGameDestination(gameType, id));
      } else {
        setGameError(true);
      }
    } catch (err) {
      console.warn('Failed to create game session:', err);
      setGameError(true);
    } finally {
      setStartingGame(false);
    }
  }

  // Core stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['home-stats', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const [players, observations, sessions, artifacts] = await Promise.all([
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
        // Count of the coach's generated AI artifacts (plans rows) for this
        // team — drives the first-artifact activation nudge (ticket 0030).
        // Read via the existing query() path; NOT a new tracking field.
        query<{ id: string }[]>({
          table: 'plans',
          select: 'id',
          filters: { team_id: activeTeam.id },
        }),
      ]);
      return {
        players: players.length,
        observations: observations.length,
        sessions: sessions.length,
        artifactsGenerated: artifacts.length,
      };
    },
    enabled: !!activeTeam,
  });

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
    enabled:
      !!activeTeam &&
      (todaySessions.length > 0 ||
        practiceActive ||
        upcomingSessions.some(
          (s) => s.type === 'game' || s.type === 'scrimmage' || s.type === 'tournament',
        )),
    staleTime: 5 * 60 * 1000,
  });

  const { data: rosterPlayers = [] } = useQuery({
    queryKey: ['home-roster', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      return query<{ id: string; name: string; jersey_number: number | null }[]>({
        table: 'players',
        select: 'id, name, jersey_number',
        filters: { team_id: activeTeam.id, is_active: true },
      });
    },
    enabled: !!activeTeam && (todaySessions.length > 0 || practiceActive),
    staleTime: 5 * 60 * 1000,
  });

  const restrictedPlayersToday = useMemo(() => {
    if (!rosterPlayers.length || !Object.keys(playerAvailability).length) return [];
    return rosterPlayers
      .filter((p) => {
        const avail = playerAvailability[p.id];
        return avail && avail.status !== 'available';
      })
      .map((p) => ({ name: p.name, status: playerAvailability[p.id].status }));
  }, [rosterPlayers, playerAvailability]);

  const { data: lastSession } = useQuery({
    queryKey: ['last-session', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
      const sessions = await query<any[]>({
        table: 'sessions',
        select: 'id, type, date, quality_rating, coach_debrief_text, coach_debrief_extracts, observations:observations(count)',
        filters: {
          team_id: activeTeam.id,
          date: { op: 'lt', value: today },
        },
        order: { column: 'date', ascending: false },
        limit: 1,
      });
      const session = sessions?.[0] ?? null;
      if (!session || session.date < sevenDaysAgo) return null;
      return session;
    },
    enabled: !!activeTeam && !practiceActive,
    staleTime: 5 * 60 * 1000,
  });

  const { data: recentPracticePlan } = useQuery({
    queryKey: ['home-recent-practice-plan', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const plans = await query<Pick<Plan, 'id' | 'title' | 'content_structured'>[]>({
        table: 'plans',
        select: 'id, title, content_structured',
        filters: {
          team_id: activeTeam.id,
          type: 'practice',
          created_at: { op: 'gte', value: sevenDaysAgo },
        },
        order: { column: 'created_at', ascending: false },
        limit: 1,
      });
      return plans?.[0] ?? null;
    },
    enabled: !!activeTeam && !practiceActive,
    staleTime: 10 * 60 * 1000,
  });

  const { planDrillCount, planDurationMin } = useMemo(() => {
    const cs = recentPracticePlan?.content_structured as any;
    return {
      planDrillCount: Array.isArray(cs?.drills) ? cs.drills.length : 0,
      planDurationMin: typeof cs?.duration_minutes === 'number' ? cs.duration_minutes : 0,
    };
  }, [recentPracticePlan]);

  const { data: sessionObsStats } = useQuery({
    queryKey: ['session-obs-count', practiceSessionId],
    queryFn: async () => {
      if (!practiceSessionId) return null;
      const obs = await query<{
        id: string;
        player_id: string | null;
        text: string;
        sentiment: string;
        category: string;
        created_at: string;
      }[]>({
        table: 'observations',
        select: 'id, player_id, text, sentiment, category, created_at',
        filters: { session_id: practiceSessionId },
        order: { column: 'created_at', ascending: false },
      });
      if (!obs) return null;
      const observedSet = new Set(obs.filter((o) => o.player_id).map((o) => o.player_id as string));
      const positiveObs = obs.filter((o) => o.sentiment === 'positive');
      const catCounts: Record<string, number> = {};
      for (const o of positiveObs) {
        if (o.category && o.category !== 'general') {
          catCounts[o.category] = (catCounts[o.category] ?? 0) + 1;
        }
      }
      const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      const positivePlayerIds = [...new Set(positiveObs.filter((o) => o.player_id).map((o) => o.player_id as string))];
      return {
        count: obs.length,
        players: observedSet.size,
        observedPlayerIds: [...observedSet],
        recentObs: obs.slice(0, 3),
        positiveCount: positiveObs.length,
        topCategory,
        positivePlayerIds,
      };
    },
    enabled: !!practiceSessionId && practiceActive,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const since30d = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const { data: playerFocusMap = {} } = useQuery({
    queryKey: ['practice-player-focus', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return {};
      const obs = await query<{ player_id: string | null; category: string | null }[]>({
        table: 'observations',
        select: 'player_id, category',
        filters: {
          team_id: activeTeam.id,
          sentiment: 'needs-work',
          created_at: { op: 'gte', value: since30d },
        },
      });
      if (!obs) return {};
      const counts: Record<string, Record<string, number>> = {};
      for (const o of obs) {
        if (!o.player_id || !o.category || o.category === 'general') continue;
        counts[o.player_id] ??= {};
        counts[o.player_id][o.category] = (counts[o.player_id][o.category] ?? 0) + 1;
      }
      const result: Record<string, string> = {};
      for (const [pid, cats] of Object.entries(counts)) {
        const top = Object.entries(cats).sort((a, b) => b[1] - a[1])[0];
        if (top) result[pid] = top[0];
      }
      return result;
    },
    enabled: !!activeTeam && practiceActive,
    staleTime: 30 * 60_000,
  });

  const sessionMomentum = useMemo(() => {
    if (!sessionObsStats || sessionObsStats.count < 3) return null;
    const pct = Math.round((sessionObsStats.positiveCount / sessionObsStats.count) * 100);
    if (pct >= 70) return { pct, emoji: '🔥', label: 'Great session', colorClass: 'text-emerald-400' };
    if (pct >= 50) return { pct, emoji: '💪', label: 'Good session', colorClass: 'text-blue-400' };
    if (pct >= 30) return { pct, emoji: '📝', label: 'Mixed session', colorClass: 'text-amber-400' };
    return { pct, emoji: '⚠️', label: 'Keep going', colorClass: 'text-zinc-400' };
  }, [sessionObsStats]);

  // Players who are present at practice (exclude injured/sick/unavailable)
  const presentPlayers = useMemo(() => {
    if (!rosterPlayers.length) return rosterPlayers;
    if (!Object.keys(playerAvailability).length) return rosterPlayers;
    return rosterPlayers.filter((p) => {
      const avail = playerAvailability[p.id];
      return !avail || avail.status === 'available' || avail.status === 'limited';
    });
  }, [rosterPlayers, playerAvailability]);

  const unobservedDuringPractice = useMemo(() => {
    if (!practiceActive || !presentPlayers.length) return [];
    const observed = new Set(sessionObsStats?.observedPlayerIds ?? []);
    return presentPlayers.filter((p) => !observed.has(p.id));
  }, [practiceActive, presentPlayers, sessionObsStats]);

  const playerNameById = useMemo(() => {
    const map: Record<string, string> = {};
    rosterPlayers.forEach((p) => {
      map[p.id] = p.jersey_number != null
        ? `#${p.jersey_number} ${p.name.split(' ')[0]}`
        : p.name.split(' ')[0];
    });
    return map;
  }, [rosterPlayers]);

  const coachFirstName = coach?.full_name?.split(' ')[0] ?? null;

  // Contextual one-liner shown beneath the team name — uses only already-fetched data
  const greetingInsight = useMemo<{ emoji: string; text: string; color: string } | null>(() => {
    // Practice is live
    if (practiceActive && sessionObsStats && sessionObsStats.count >= 1) {
      const { count, players, positiveCount } = sessionObsStats;
      const pctStr = count > 0 ? ` · ${Math.round((positiveCount / count) * 100)}% positive` : '';
      return {
        emoji: '🏃',
        text: `Live now — ${count} obs · ${players} player${players !== 1 ? 's' : ''} covered${pctStr}`,
        color: 'text-emerald-400',
      };
    }
    // Game / scrimmage / tournament today
    const competitiveToday = todaySessions.find(
      (s) => s.type === 'game' || s.type === 'scrimmage' || s.type === 'tournament',
    );
    if (!practiceActive && competitiveToday) {
      const typeLabel = ({ game: 'Game', scrimmage: 'Scrimmage', tournament: 'Tournament' } as Record<string, string>)[competitiveToday.type] ?? 'Game';
      const opp = competitiveToday.opponent ? ` vs ${competitiveToday.opponent}` : '';
      return { emoji: '🏆', text: `${typeLabel} day${opp}!`, color: 'text-orange-400' };
    }
    // Practice / training today (not yet started)
    const practiceToday = todaySessions.find((s) => s.type === 'practice' || s.type === 'training');
    if (!practiceActive && practiceToday) {
      return { emoji: '👟', text: 'Practice today — tap Start Practice when you\'re ready', color: 'text-blue-400' };
    }
    // Recent session highlight
    if (!practiceActive && lastSession) {
      const obsArr = lastSession.observations as { count: number }[] | undefined;
      const obsCount = Array.isArray(obsArr) ? (obsArr[0]?.count ?? 0) : 0;
      if (obsCount >= 5) {
        const daysAgo = Math.floor(
          (Date.now() - new Date(lastSession.date + 'T12:00:00').getTime()) / 86_400_000,
        );
        const when = daysAgo <= 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo}d ago`;
        return {
          emoji: '💪',
          text: `Last session ${when} · ${obsCount} observations captured`,
          color: 'text-zinc-400',
        };
      }
    }
    return null;
  }, [practiceActive, sessionObsStats, todaySessions, lastSession]);

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
        <Link href="/onboarding/setup">
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
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      <div>
        {coachFirstName && (
          <p className="text-sm font-medium text-zinc-500 mb-0.5">
            {getTimeGreeting()}, {coachFirstName}! 👋
          </p>
        )}
        <h1 className="text-2xl font-bold">{activeTeam.name}</h1>
        <p className="text-zinc-400 text-sm">
          Season {activeTeam.season || 'Not set'} &middot;{' '}
          <Link
            href="/curriculum"
            className="underline-offset-2 hover:underline hover:text-zinc-200 transition-colors"
            aria-label={`Currently on week ${activeTeam.current_week} — tap to change`}
          >
            Week {activeTeam.current_week}
          </Link>
        </p>
        {greetingInsight && (
          <p className={`text-sm font-medium mt-1 ${greetingInsight.color}`}>
            {greetingInsight.emoji} {greetingInsight.text}
          </p>
        )}
      </div>

      <BirthdayCard teamId={activeTeam.id} teamName={activeTeam.name} />

      {/* Game Day Card — surfaces 48 h before any game/scrimmage/tournament */}
      {!practiceActive && (
        <GameDayCard
          sessions={[...todaySessions, ...upcomingSessions]}
          todayStr={todayStr}
          tomorrowStr={tomorrowStr}
          teamName={activeTeam.name}
          coachName={coach?.full_name ?? null}
          playerAvailability={playerAvailability}
        />
      )}

      {/* AI Keys Onboarding Banner */}
      {!hasAIKeys && (
        <Card className="border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-orange-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
              <Sparkles className="h-5 w-5 text-orange-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-300">Set up AI to get started</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Connect an AI provider to unlock voice capture, practice plans, and report cards.
              </p>
              <Link href="/settings/ai" className="mt-3 inline-block">
                <Button size="sm" className="text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Set Up AI
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      )}

      {practiceActive ? (
        <div className="space-y-3">
          <button
            onClick={() => setShowDebrief(true)}
            className="w-full rounded-2xl bg-gradient-to-r from-red-500 to-red-600 p-5 text-left text-white shadow-lg shadow-red-500/20 active:scale-[0.98] transition-all touch-manipulation"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/20">
                <Square className="h-7 w-7" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-bold">End Practice</p>
                  {elapsedTime && (
                    <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold tabular-nums">
                      ⏱ {elapsedTime}
                    </span>
                  )}
                </div>
                <p className="text-sm text-red-100">
                  {sessionObsStats && sessionObsStats.count > 0
                    ? `${sessionObsStats.count} obs · ${sessionObsStats.players} player${sessionObsStats.players !== 1 ? 's' : ''} covered`
                    : 'Tap to wrap up and debrief'}
                </p>
              </div>
              {sessionObsStats && sessionObsStats.count > 0 && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20">
                  <span className="text-sm font-bold">{sessionObsStats.count}</span>
                </div>
              )}
            </div>
          </button>

          {showWrapUpNudge && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              <span aria-hidden="true">⏰</span>
              <span>{elapsedTime} in — time to start cool-down?</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Link href={practiceSessionId ? `/capture?sessionId=${practiceSessionId}` : '/capture'}>
              <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-700 transition-colors touch-manipulation active:scale-[0.97]">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/15">
                  <Mic className="h-4 w-4 text-orange-400" />
                </div>
                <span className="text-sm font-medium text-zinc-300">Capture</span>
              </div>
            </Link>
            {practiceSessionId && (
              <Link href={`/sessions/${practiceSessionId}/timer`}>
                <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 hover:border-zinc-700 transition-colors touch-manipulation active:scale-[0.97]">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/15">
                    <Timer className="h-4 w-4 text-blue-400" />
                  </div>
                  <span className="text-sm font-medium text-zinc-300">Open Timer</span>
                </div>
              </Link>
            )}
          </div>

          {practiceSessionId && presentPlayers.length > 0 && (
            unobservedDuringPractice.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
                <span aria-hidden="true">✓</span>
                <span>
                  All {presentPlayers.length}{presentPlayers.length < rosterPlayers.length ? ' present' : ''} players observed this session
                </span>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                  Not yet observed ({unobservedDuringPractice.length}/{presentPlayers.length}
                  {presentPlayers.length < rosterPlayers.length && (
                    <span className="normal-case font-normal text-zinc-600"> · {rosterPlayers.length - presentPlayers.length} absent</span>
                  )})
                </p>
                <div className="flex gap-2 flex-wrap">
                  {unobservedDuringPractice.map((p) => {
                    const label = p.jersey_number != null ? `#${p.jersey_number} ${p.name.split(' ')[0]}` : p.name.split(' ')[0];
                    const focusCat = playerFocusMap[p.id];
                    const focusLabel = focusCat ? formatSkillLabel(focusCat) : null;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setQoPlayer(p)}
                        aria-label={`Quick observe ${p.name}`}
                        className="inline-flex items-center gap-1 rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/20 transition-colors touch-manipulation active:scale-95"
                      >
                        {label}
                        {focusLabel && (
                          <span className="text-orange-400/55 font-normal">· {focusLabel}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {sessionObsStats && sessionObsStats.recentObs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Recent captures
              </p>
              <div className="space-y-1.5">
                {sessionObsStats.recentObs.map((obs) => {
                  const playerLabel = obs.player_id
                    ? (playerNameById[obs.player_id] ?? 'Player')
                    : 'Team';
                  const icon = obs.sentiment === 'positive'
                    ? '✅'
                    : obs.sentiment === 'needs-work'
                    ? '⚠️'
                    : '·';
                  const snippet = obs.text.length > 48
                    ? obs.text.slice(0, 48) + '…'
                    : obs.text;
                  return (
                    <div
                      key={obs.id}
                      className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs"
                    >
                      <span className="shrink-0 mt-px leading-none" aria-hidden="true">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-zinc-300">{playerLabel}</span>
                        {snippet && (
                          <span className="ml-1.5 text-zinc-500">{snippet}</span>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums text-zinc-600">
                        {formatLiveTimeAgo(obs.created_at)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sessionMomentum && (
            <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{sessionMomentum.emoji}</span>
                <span className={`text-sm font-medium ${sessionMomentum.colorClass}`}>
                  {sessionMomentum.label}
                </span>
                <span className="text-xs text-zinc-600">
                  {sessionMomentum.pct}% positive
                  {sessionObsStats?.topCategory ? ` · ${formatSkillLabel(sessionObsStats.topCategory)}` : ''}
                </span>
              </div>
              {sessionObsStats && sessionObsStats.positiveCount >= 2 && (
                <button
                  onClick={async () => {
                    const coachFirst = coach?.full_name?.split(' ')[0] ?? 'Coach';
                    const teamName = activeTeam?.name ?? 'Team';
                    const positiveNames = (sessionObsStats.positivePlayerIds ?? [])
                      .slice(0, 2)
                      .map((id) => playerNameById[id])
                      .filter(Boolean) as string[];
                    const topCatLabel = sessionObsStats.topCategory
                      ? formatSkillLabel(sessionObsStats.topCategory)
                      : null;

                    let msg = `${getSportEmoji(sportSlug)} Quick practice update from ${teamName}!\n\n`;
                    if (positiveNames.length >= 2) {
                      msg += `${positiveNames[0]} & ${positiveNames[1]} are looking great out there`;
                    } else if (positiveNames.length === 1) {
                      msg += `${positiveNames[0]} is looking great out there`;
                    } else {
                      msg += `${sessionObsStats.positiveCount} great coaching moments so far`;
                    }
                    msg += ` across ${sessionObsStats.players} player${sessionObsStats.players !== 1 ? 's' : ''}.`;
                    if (topCatLabel) msg += `\n\nFocusing on ${topCatLabel} today 🎯`;
                    msg += `\n\n— Coach ${coachFirst}`;

                    try {
                      if (navigator.share) {
                        await navigator.share({ text: msg });
                      } else {
                        await navigator.clipboard.writeText(msg);
                      }
                    } catch {
                      // dismissed or unavailable
                    }
                    setMidPracticeShared(true);
                    setTimeout(() => setMidPracticeShared(false), 3000);
                  }}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-teal-500/15 px-2.5 py-1.5 text-xs font-medium text-teal-400 hover:bg-teal-500/25 active:scale-95 transition-all touch-manipulation"
                  aria-label="Send mid-practice parent update"
                >
                  {midPracticeShared ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Sent!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="h-3.5 w-3.5" />
                      <span>Parent update</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      ) : todaySessions.length > 0 ? (
        <TodaySessionCard
          session={todaySessions[0]}
          restrictedPlayers={restrictedPlayersToday}
          coachName={coach?.full_name ?? null}
          teamName={activeTeam.name}
        />
      ) : (
        <div className="space-y-2">
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
          {recentPracticePlan ? (
            <button
              onClick={() => startPracticeWithPlan(recentPracticePlan.id)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-2.5 text-sm text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300 transition-colors touch-manipulation active:scale-[0.98]"
            >
              <Play className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate min-w-0">
                {recentPracticePlan.title
                  ? `Run "${recentPracticePlan.title}"`
                  : 'Run last practice plan'}
                {planDrillCount > 0 && ` · ${planDrillCount} drill${planDrillCount !== 1 ? 's' : ''}`}
                {planDurationMin > 0 && ` · ${planDurationMin} min`}
              </span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          ) : (
            <button
              onClick={startPracticeWithTimer}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-sm text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors touch-manipulation active:scale-[0.98]"
            >
              <Timer className="h-3.5 w-3.5 shrink-0" />
              <span>Use Practice Timer</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          )}

          {/* Quick Game shortcut */}
          {!showGameQuickStart ? (
            <button
              onClick={() => setShowGameQuickStart(true)}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-2.5 text-sm text-blue-400 hover:bg-blue-500/10 hover:text-blue-300 transition-colors touch-manipulation active:scale-[0.98]"
            >
              <Trophy className="h-3.5 w-3.5 shrink-0" />
              <span>Game day? Log a game</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 ml-auto" />
            </button>
          ) : (
            <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-semibold text-blue-300">Quick Game Start</span>
                </div>
                <button
                  onClick={() => { setShowGameQuickStart(false); setGameOpponent(''); setGameType('game'); setGameError(false); }}
                  className="rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors touch-manipulation"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Session type picker */}
              <div className="flex gap-2">
                {(['game', 'scrimmage', 'tournament'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setGameType(t)}
                    className={`flex-1 rounded-lg border py-1.5 text-xs font-medium capitalize transition-colors touch-manipulation ${
                      gameType === t
                        ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600 hover:text-zinc-300'
                    }`}
                  >
                    {t === 'game' ? '🏆 Game' : t === 'scrimmage' ? '⚡ Scrimmage' : '🏅 Tournament'}
                  </button>
                ))}
              </div>

              {/* Opponent input */}
              <input
                type="text"
                value={gameOpponent}
                onChange={(e) => setGameOpponent(e.target.value)}
                placeholder={gameType === 'tournament' ? 'Tournament name (optional)' : 'vs. Opponent (optional)'}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500/50 focus:outline-none transition-colors"
                onKeyDown={(e) => { if (e.key === 'Enter') quickStartGame(); }}
              />

              <button
                onClick={quickStartGame}
                disabled={startingGame}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 active:scale-[0.98] transition-all touch-manipulation disabled:opacity-60"
              >
                {startingGame ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
                ) : (
                  <><Trophy className="h-4 w-4" />Go Live</>
                )}
              </button>

              {gameError && (
                <p className="text-xs text-red-400 text-center">Couldn&apos;t create session — please try again.</p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Link href={practiceActive && practiceSessionId ? `/capture?sessionId=${practiceSessionId}` : '/capture'}>
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

      {!practiceActive && activeTeam && stats && (
        <PrePracticeSnapshotCard
          teamId={activeTeam.id}
          sessionId={todaySessions[0]?.id}
        />
      )}

      {!practiceActive && activeTeam && (
        <WeeklyDigestSection teamId={activeTeam.id} />
      )}

      {/* Ticket 0047 — referral-conversion celebration. Self-gating: renders
          nothing unless the live referralCount > last_seen_referral_count, so
          /home is byte-identical for coaches with no new conversions. */}
      <ReferralCelebrationCard />

      {/* Ticket 0046 — coach-private sideline cheat sheet. One-tap on demand, */}
      {/* never auto-generated (pre-game artifact, quota-aware). Coach+ via the */}
      {/* existing report_cards key (server + surface gate matched verbatim). */}
      {!practiceActive && activeTeam && (
        <SidelineCheatSheetCard teamId={activeTeam.id} />
      )}

      {!practiceActive && activeTeam && (
        <SeasonWrapSection teamId={activeTeam.id} />
      )}

      {!practiceActive && activeTeam && (
        <SeasonMomentumSection teamId={activeTeam.id} />
      )}

      {!practiceActive && activeTeam && (
        <ContinueArcCard teamId={activeTeam.id} />
      )}

      {!practiceActive && activeTeam && (
        <ArcCompleteCard teamId={activeTeam.id} />
      )}

      {!practiceActive && todaySessions.length === 0 && lastSession && (
        <LastSessionCard session={lastSession} />
      )}

      {!practiceActive && !isLoadingStats && stats && stats.sessions > 0 && (
        <DailyFocusCard teamId={activeTeam.id} />
      )}

      {!isLoadingStats && stats && stats.observations >= 3 && (
        <DrillOfDayCard
          teamId={activeTeam.id}
          sportId={activeTeam.sport_id}
          sportSlug={sportSlug}
        />
      )}

      {!isLoadingStats && stats && coach && (
        <GettingStartedCard
          players={stats.players}
          sessions={stats.sessions}
          observations={stats.observations}
          teamId={activeTeam.id}
        />
      )}

      {/* First-artifact activation nudge (ticket 0030) — the missing OUTPUT step
          of the activation arc: shown once the coach has enough notes but no
          artifact yet, with a one-tap path to generate their first report. */}
      {!isLoadingStats && stats && coach && (
        <FirstArtifactCard
          teamId={activeTeam.id}
          teamName={activeTeam.name}
          observations={stats.observations}
          artifactsGenerated={stats.artifactsGenerated}
        />
      )}

      {!practiceActive && !isLoadingStats && stats?.sessions === 0 && coach && (
        <FirstPracticeLauncher
          teamId={activeTeam.id}
          coachId={coach.id}
          sportId={activeTeam.sport_id}
          ageGroup={activeTeam.age_group}
        />
      )}

      {!isLoadingStats && stats && (
        <SeasonalPromo playerCount={stats.players} />
      )}

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
            <Link href="/roster">
              <Card className="cursor-pointer hover:border-orange-500/40 transition-colors active:scale-[0.97] touch-manipulation">
                <CardContent className="p-3 sm:p-4 text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-orange-500">
                    {stats?.players ?? 0}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">Players</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/observations">
              <Card className="cursor-pointer hover:border-blue-500/40 transition-colors active:scale-[0.97] touch-manipulation">
                <CardContent className="p-3 sm:p-4 text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-blue-500">
                    {stats?.observations ?? 0}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">Observations</p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/sessions">
              <Card className="cursor-pointer hover:border-emerald-500/40 transition-colors active:scale-[0.97] touch-manipulation">
                <CardContent className="p-3 sm:p-4 text-center">
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-500">
                    {stats?.sessions ?? 0}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">Sessions</p>
                </CardContent>
              </Card>
            </Link>
          </>
        )}
      </div>

      {stats && (
        <FreemiumNudge playerCount={stats.players} observationCount={stats.observations} />
      )}

      {activeTeam && stats && stats.sessions >= 1 && (
        <WeeklyFocusCard teamId={activeTeam.id} />
      )}

      {!practiceActive && activeTeam && stats && stats.sessions >= 1 && (
        <QuickWinsCard
          teamId={activeTeam.id}
          lastSession={lastSession ?? null}
          obsCount={stats.observations}
          sessionCount={stats.sessions}
          planGeneratedThisWeek={!!recentPracticePlan}
        />
      )}

      {activeTeam && (
        <TeamSkillTrendsCard teamId={activeTeam.id} />
      )}

      {activeTeam && stats && (
        <StreakCard teamId={activeTeam.id} observationCount={stats.observations} />
      )}

      {activeTeam && stats && (
        <AICoachingTipsCard teamId={activeTeam.id} observationCount={stats.observations} />
      )}

      {activeTeam && <TeamWinsCard teamId={activeTeam.id} />}

      {activeTeam && <GoalDeadlineCard teamId={activeTeam.id} />}

      {activeTeam && (
        <PlayerBreakthroughCard
          teamId={activeTeam.id}
          coachName={coach?.full_name ?? undefined}
        />
      )}

      {activeTeam && (
        <PlayerOnARollCard teamId={activeTeam.id} />
      )}

      {activeTeam && (
        <StrugglingPlayerCard teamId={activeTeam.id} />
      )}

      {activeTeam && <ParentReactionsCard teamId={activeTeam.id} />}

      {activeTeam && coach && stats && (
        <WeeklyWrapCard
          teamId={activeTeam.id}
          teamName={activeTeam.name}
          coachName={coach.full_name ?? ''}
          totalPlayerCount={stats.players}
        />
      )}

      {/* Invite a Coach — shown to established coaches (≥2 sessions, ≥10 obs) to drive referrals */}
      {activeTeam && coach && stats && stats.sessions >= 2 && stats.observations >= 10 && (
        <InviteCoachCard
          coachId={coach.id}
          coachName={coach.full_name ?? null}
          teamName={activeTeam.name}
          observations={stats.observations}
          players={stats.players}
          sessions={stats.sessions}
        />
      )}

      {/* Ticket 0049 — clones-of-your-published-plans card. Renders nothing
          when count is 0 OR <= lastSeenCount, so /home stays calm for coaches
          who never published. The component is self-gating. */}
      <PlanClonesCard />

      {/* Ticket 0049 — consume a sessionStorage clone_token left by signup
          (from /plan/<token>'s unauthed CTA) and auto-clone onto the active
          team. Renders nothing; clears the bookmark whether the clone
          succeeds or fails so a stale token never re-fires. */}
      <PendingCloneConsumer activeTeamId={activeTeam?.id ?? null} />

      {/* Upcoming sessions this week */}
      {upcomingSessions.length > 0 && (
        <UpcomingSessionsCard
          sessions={upcomingSessions}
          coachName={coach?.full_name ?? null}
          teamName={activeTeam.name}
        />
      )}

    </div>

    {qoPlayer && activeTeam && practiceSessionId && (
      <HomeQuickObserveSheet
        player={qoPlayer}
        focusCategory={playerFocusMap[qoPlayer.id] ?? null}
        sportSlug={sportSlug}
        teamId={activeTeam.id}
        orgId={activeTeam.org_id}
        coachId={coach?.id ?? ''}
        sessionId={practiceSessionId}
        onClose={() => setQoPlayer(null)}
        onSaved={() => setQoPlayer(null)}
      />
    )}

    {showDebrief && practiceSessionId && (
      <PostPracticeDebrief
        sessionId={practiceSessionId}
        onClose={() => setShowDebrief(false)}
      />
    )}

    </>
  );
}
