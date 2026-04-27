'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
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
} from 'lucide-react';
import type { Session } from '@/types/database';
import { useAppStore } from '@/lib/store';
import { PostPracticeDebrief } from '@/components/capture/post-practice-debrief';
import Image from 'next/image';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { GettingStartedCard } from '@/components/home/getting-started-card';
import { FirstPracticeLauncher } from '@/components/home/first-practice-launcher';
import { StreakCard } from '@/components/home/streak-card';
import { TeamWinsCard } from '@/components/home/team-wins-card';
import { ParentReactionsCard } from '@/components/home/parent-reactions-card';
import { DailyFocusCard } from '@/components/home/daily-focus-card';
import { BirthdayCard } from '@/components/home/birthday-card';
import { DrillOfDayCard } from '@/components/home/drill-of-day-card';

// ─── Today's Session Card ────────────────────────────────────────────────────

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
        <Link href={`/capture?sessionId=${session.id}`}>
          <Button size="sm" variant="outline" className="shrink-0" aria-label="Capture observation">
            <Mic className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Upcoming Sessions Card ─────────────────────────────────────────────────

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

// ─── Last Session Card ─────────────────────────────────────────────────────────

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
  session: { id: string; type: string; date: string; observations?: [{ count: number }] };
}) {
  const obsCount = session.observations?.[0]?.count ?? 0;
  const emoji = SESSION_EMOJI[session.type] ?? '📋';
  const label = SESSION_LABEL[session.type] ?? session.type;

  const daysDiff = Math.round(
    (Date.now() - new Date(session.date + 'T12:00:00').getTime()) / 86_400_000
  );
  const dateLabel = daysDiff === 1 ? 'Yesterday' : `${daysDiff} days ago`;

  return (
    <Card className="border-zinc-800">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800 text-lg">
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
            Last session · {dateLabel}
          </p>
          <p className="text-sm font-semibold text-zinc-200">{label}</p>
          <p className="text-xs text-zinc-500 mt-0.5">
            {obsCount > 0
              ? `${obsCount} observation${obsCount !== 1 ? 's' : ''} captured`
              : 'No observations — tap to add'}
          </p>
        </div>
        <Link href={`/sessions/${session.id}`} className="shrink-0">
          <Button size="sm" variant="outline" className="gap-1.5">
            <History className="h-3.5 w-3.5" />
            View
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { activeTeam, coach, aiPlatformAvailable } = useActiveTeam();
  const [showDebrief, setShowDebrief] = useState(false);

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

  // Core stats
  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['home-stats', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const [players, observations, sessions] = await Promise.all([
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
      ]);
      return {
        players: players.length,
        observations: observations.length,
        sessions: sessions.length,
      };
    },
    enabled: !!activeTeam,
  });

  // Today's and upcoming sessions
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

  // Roster for availability warnings
  const { data: rosterPlayers = [] } = useQuery({
    queryKey: ['home-roster', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      return query<{ id: string; name: string }[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: activeTeam.id, is_active: true },
      });
    },
    enabled: !!activeTeam && todaySessions.length > 0,
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

  // Most recent past session (for "Last Session" card — shown when no active practice or today session)
  const { data: lastSession } = useQuery({
    queryKey: ['last-session', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const today = new Date().toISOString().split('T')[0];
      const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().split('T')[0];
      const sessions = await query<any[]>({
        table: 'sessions',
        select: 'id, type, date, observations:observations(count)',
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

  // Live observation count for the active practice session
  const { data: sessionObsStats } = useQuery({
    queryKey: ['session-obs-count', practiceSessionId],
    queryFn: async () => {
      if (!practiceSessionId) return null;
      const obs = await query<{ player_id: string | null }[]>({
        table: 'observations',
        select: 'player_id',
        filters: { session_id: practiceSessionId },
      });
      if (!obs) return null;
      const players = new Set(obs.filter((o) => o.player_id).map((o) => o.player_id)).size;
      return { count: obs.length, players };
    },
    enabled: !!practiceSessionId && practiceActive,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  // ── No team state ─────────────────────────────────────────────────────────
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

  // ── Main dashboard ────────────────────────────────────────────────────────
  return (
    <>
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{activeTeam.name}</h1>
        <p className="text-zinc-400">
          Season {activeTeam.season || 'Not set'} &middot; Week {activeTeam.current_week}
        </p>
      </div>

      {/* Birthday Card — upcoming player birthdays, dismissible per day */}
      <BirthdayCard teamId={activeTeam.id} teamName={activeTeam.name} />

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

      {/* Session CTA — End Practice / Today's Session / Start Practice */}
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
                <p className="text-lg font-bold">End Practice</p>
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
          {/* Practice quick actions */}
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
        </div>
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
      <div className="grid grid-cols-3 gap-3">
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

      {/* Last session summary — shown when no today session and practice not active */}
      {!practiceActive && todaySessions.length === 0 && lastSession && (
        <LastSessionCard session={lastSession} />
      )}

      {/* Daily Focus — which player needs attention today (shown when enough data exists) */}
      {!practiceActive && !isLoadingStats && stats && stats.sessions > 0 && (
        <DailyFocusCard teamId={activeTeam.id} />
      )}

      {/* Drill of the Day — deterministic drill targeting the team's top skill gap */}
      {!isLoadingStats && stats && stats.observations >= 5 && (
        <DrillOfDayCard teamId={activeTeam.id} sportId={activeTeam.sport_id} />
      )}

      {/* Getting Started checklist — shown until first 3 actions are complete */}
      {!isLoadingStats && stats && coach && (
        <GettingStartedCard
          players={stats.players}
          sessions={stats.sessions}
          observations={stats.observations}
          teamId={activeTeam.id}
        />
      )}

      {/* First Practice Launcher — shown once to new coaches with 0 sessions */}
      {!practiceActive && !isLoadingStats && stats?.sessions === 0 && coach && (
        <FirstPracticeLauncher
          teamId={activeTeam.id}
          coachId={coach.id}
          sportId={activeTeam.sport_id}
          ageGroup={activeTeam.age_group}
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

      {/* Coaching streak tracker */}
      {activeTeam && stats && (
        <StreakCard teamId={activeTeam.id} observationCount={stats.observations} />
      )}

      {/* Team Wins Feed — recent badges + achieved goals */}
      {activeTeam && <TeamWinsCard teamId={activeTeam.id} />}

      {/* Parent Reactions — love notes from parents */}
      {activeTeam && <ParentReactionsCard teamId={activeTeam.id} />}

      {/* Upcoming sessions this week */}
      {upcomingSessions.length > 0 && <UpcomingSessionsCard sessions={upcomingSessions} />}

    </div>

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
