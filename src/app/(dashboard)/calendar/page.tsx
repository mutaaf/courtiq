'use client';

import { useState, useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, Plus, Calendar, MapPin, Clock } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Session, SessionType } from '@/types/database';

const SESSION_TYPE_COLORS: Record<SessionType, string> = {
  practice: 'bg-blue-500',
  game: 'bg-emerald-500',
  scrimmage: 'bg-purple-500',
  tournament: 'bg-amber-500',
  training: 'bg-orange-500',
};

const SESSION_TYPE_BG: Record<SessionType, string> = {
  practice: 'bg-blue-500/20 text-blue-400',
  game: 'bg-emerald-500/20 text-emerald-400',
  scrimmage: 'bg-purple-500/20 text-purple-400',
  tournament: 'bg-amber-500/20 text-amber-400',
  training: 'bg-orange-500/20 text-orange-400',
};

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatTime(time: string | null) {
  if (!time) return null;
  const [h, m] = time.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${m} ${ampm}`;
}

function formatLongDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function CalendarPage() {
  const { activeTeam } = useActiveTeam();
  const todayDate = new Date();
  const todayStr = todayDate.toISOString().split('T')[0];

  const [currentMonth, setCurrentMonth] = useState(
    new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Fetch sessions spanning prev + current + next month for smooth navigation
  const rangeStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    .toISOString()
    .split('T')[0];
  const rangeEnd = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 2, 0)
    .toISOString()
    .split('T')[0];

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['sessions-calendar', activeTeam?.id, rangeStart, rangeEnd],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Session[]>({
        table: 'sessions',
        select: 'id, type, date, start_time, location, opponent',
        filters: {
          team_id: activeTeam.id,
          date: { op: 'gte', value: rangeStart },
        },
        order: { column: 'date', ascending: true },
      });
      return (data || []).filter((s) => s.date <= rangeEnd);
    },
    enabled: !!activeTeam,
    staleTime: 60_000,
  });

  // Build map: dateStr → sessions[]
  const sessionsByDate = useMemo(() => {
    const map: Record<string, Session[]> = {};
    for (const s of sessions || []) {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    }
    return map;
  }, [sessions]);

  // Build calendar grid for current month
  const { days, monthLabel } = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDayOfWeek = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const label = currentMonth.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    const grid: Array<{
      date: string;
      day: number;
      isCurrentMonth: boolean;
      isToday: boolean;
    }> = [];

    // Pad start with previous month days
    for (let i = 0; i < firstDayOfWeek; i++) {
      const day = daysInPrevMonth - firstDayOfWeek + 1 + i;
      const d = new Date(year, month - 1, day);
      grid.push({
        date: d.toISOString().split('T')[0],
        day,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    // Current month days
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      const dateStr = d.toISOString().split('T')[0];
      grid.push({
        date: dateStr,
        day: i,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
      });
    }

    // Pad end to complete grid (max 42 cells = 6 rows)
    const remaining = 42 - grid.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(year, month + 1, i);
      grid.push({
        date: d.toISOString().split('T')[0],
        day: i,
        isCurrentMonth: false,
        isToday: false,
      });
    }

    return { days: grid, monthLabel: label };
  }, [currentMonth, todayStr]);

  // Upcoming sessions: from today forward, max 8
  const upcomingSessions = useMemo(
    () =>
      (sessions || [])
        .filter((s) => s.date >= todayStr)
        .slice(0, 8),
    [sessions, todayStr]
  );

  const isCurrentMonthView =
    currentMonth.getFullYear() === todayDate.getFullYear() &&
    currentMonth.getMonth() === todayDate.getMonth();

  const selectedDateSessions = selectedDate ? (sessionsByDate[selectedDate] || []) : [];

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-zinc-400 text-sm">Schedule and view sessions</p>
        </div>
        <Link href={selectedDate ? `/sessions/new?date=${selectedDate}` : '/sessions/new'}>
          <Button className="h-12 px-5 sm:h-10 sm:px-4 text-base sm:text-sm">
            <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">New Session</span>
            <span className="sm:hidden">New</span>
          </Button>
        </Link>
      </div>

      {/* Calendar card */}
      <Card>
        <CardContent className="p-4 sm:p-6">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
                )
              }
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors touch-manipulation active:scale-[0.95]"
              aria-label="Previous month"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3">
              <span className="text-base sm:text-lg font-semibold">{monthLabel}</span>
              {!isCurrentMonthView && (
                <button
                  onClick={() =>
                    setCurrentMonth(
                      new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
                    )
                  }
                  className="text-xs text-orange-500 hover:text-orange-400 font-medium transition-colors"
                >
                  Today
                </button>
              )}
            </div>

            <button
              onClick={() =>
                setCurrentMonth(
                  new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
                )
              }
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors touch-manipulation active:scale-[0.95]"
              aria-label="Next month"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div
                key={d}
                className="text-center text-[11px] font-medium text-zinc-500 py-1"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {isLoading ? (
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-0.5">
              {days.map(({ date, day, isCurrentMonth, isToday }) => {
                const daySessions = sessionsByDate[date] || [];
                const isSelected = selectedDate === date;
                const hasSessions = daySessions.length > 0;

                return (
                  <button
                    key={date}
                    onClick={() =>
                      setSelectedDate(isSelected ? null : date)
                    }
                    className={cn(
                      'relative flex flex-col items-center rounded-lg transition-colors touch-manipulation min-h-[44px] pt-1 pb-1',
                      isSelected
                        ? 'bg-orange-500/20 ring-1 ring-orange-500'
                        : isToday
                        ? 'bg-orange-500/10'
                        : 'hover:bg-zinc-800/70',
                      !isCurrentMonth && 'opacity-30 pointer-events-none'
                    )}
                    disabled={!isCurrentMonth}
                  >
                    <span
                      className={cn(
                        'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                        isToday && !isSelected && 'bg-orange-500 text-white',
                        isSelected && 'text-orange-300 font-bold',
                        !isToday && !isSelected && 'text-zinc-100'
                      )}
                    >
                      {day}
                    </span>
                    {/* Session type dots */}
                    {hasSessions && (
                      <div className="flex gap-0.5 mt-0.5 justify-center flex-wrap max-w-[28px]">
                        {daySessions.slice(0, 3).map((s, idx) => (
                          <span
                            key={idx}
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              SESSION_TYPE_COLORS[s.type as SessionType]
                            )}
                          />
                        ))}
                        {daySessions.length > 3 && (
                          <span className="text-[8px] text-zinc-500 leading-none">
                            +{daySessions.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-4 border-t border-zinc-800">
            {(Object.entries(SESSION_TYPE_COLORS) as [SessionType, string][]).map(
              ([type, colorClass]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className={cn('h-2 w-2 rounded-full', colorClass)} />
                  {SESSION_TYPE_LABELS[type]}
                </div>
              )
            )}
          </div>
        </CardContent>
      </Card>

      {/* Selected day panel */}
      {selectedDate && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">{formatLongDate(selectedDate)}</h2>
            <Link href={`/sessions/new?date=${selectedDate}`}>
              <Button
                variant="outline"
                size="sm"
                className="h-10 sm:h-8 touch-manipulation"
              >
                <Plus className="h-4 w-4" />
                Add Session
              </Button>
            </Link>
          </div>

          {selectedDateSessions.length === 0 ? (
            <Card className="border-dashed border-zinc-700">
              <CardContent className="py-8 flex flex-col items-center gap-3">
                <Calendar className="h-8 w-8 text-zinc-600" />
                <p className="text-zinc-500 text-sm text-center">
                  No sessions on this day.
                  <br />
                  Tap &quot;Add Session&quot; to schedule one.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {selectedDateSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <Card className="hover:border-zinc-700 cursor-pointer active:scale-[0.98] touch-manipulation transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold shrink-0',
                            SESSION_TYPE_BG[session.type as SessionType]
                          )}
                        >
                          {SESSION_TYPE_LABELS[session.type as SessionType]}
                        </span>
                        {session.opponent && (
                          <span className="text-sm text-zinc-300">
                            vs {session.opponent}
                          </span>
                        )}
                        <div className="flex items-center gap-3 ml-auto text-xs text-zinc-500">
                          {session.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatTime(session.start_time)}
                            </span>
                          )}
                          {session.location && (
                            <span className="flex items-center gap-1 hidden sm:flex">
                              <MapPin className="h-3 w-3" />
                              {session.location}
                            </span>
                          )}
                        </div>
                      </div>
                      {session.location && (
                        <p className="mt-1.5 text-xs text-zinc-500 flex items-center gap-1 sm:hidden">
                          <MapPin className="h-3 w-3" />
                          {session.location}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Upcoming sessions list (shown when no day is selected) */}
      {!selectedDate && (
        <div className="space-y-3">
          <h2 className="text-base font-semibold">Upcoming Sessions</h2>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : upcomingSessions.length === 0 ? (
            <Card className="border-dashed border-zinc-700">
              <CardContent className="py-10 flex flex-col items-center gap-3">
                <Calendar className="h-8 w-8 text-zinc-600" />
                <p className="text-zinc-500 text-sm text-center">
                  No upcoming sessions scheduled.
                  <br />
                  Tap a date on the calendar to add one.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {upcomingSessions.map((session) => (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <Card className="hover:border-zinc-700 cursor-pointer active:scale-[0.98] touch-manipulation transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-zinc-800 text-center leading-tight">
                          <span className="text-[10px] font-medium text-zinc-400 uppercase">
                            {new Date(session.date + 'T00:00:00').toLocaleDateString(
                              'en-US',
                              { month: 'short' }
                            )}
                          </span>
                          <span className="text-lg font-bold text-zinc-100 leading-none">
                            {new Date(session.date + 'T00:00:00').getDate()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
                                SESSION_TYPE_BG[session.type as SessionType]
                              )}
                            >
                              {SESSION_TYPE_LABELS[session.type as SessionType]}
                            </span>
                            {session.opponent && (
                              <span className="text-sm text-zinc-300 truncate">
                                vs {session.opponent}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-500">
                            <span>
                              {new Date(session.date + 'T00:00:00').toLocaleDateString(
                                'en-US',
                                { weekday: 'short' }
                              )}
                            </span>
                            {session.start_time && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTime(session.start_time)}
                              </span>
                            )}
                            {session.location && (
                              <span className="flex items-center gap-1 truncate">
                                <MapPin className="h-3 w-3" />
                                {session.location}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              <Link href="/sessions">
                <Button
                  variant="ghost"
                  className="w-full text-zinc-400 h-10 touch-manipulation"
                >
                  View all sessions
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
