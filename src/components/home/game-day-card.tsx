'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  Users,
  ListChecks,
  Share2,
  Clock,
  MapPin,
  AlertTriangle,
  Check,
} from 'lucide-react';
import {
  findUpcomingGameSession,
  getGameUrgency,
  getCountdownLabel,
  getGameTypeLabel,
  getGameTypeEmoji,
  buildGameReminderMsg,
  countAvailabilityIssues,
  type GameSession,
} from '@/lib/game-day-utils';

interface GameDayCardProps {
  sessions: GameSession[];
  todayStr: string;
  tomorrowStr: string;
  teamName: string;
  coachName?: string | null;
  playerAvailability?: Record<string, { status: string; reason: string | null }>;
}

export function GameDayCard({
  sessions,
  todayStr,
  tomorrowStr,
  teamName,
  coachName,
  playerAvailability = {},
}: GameDayCardProps) {
  const [shared, setShared] = useState(false);
  const now = useMemo(() => new Date(), []);

  const game = useMemo(
    () => findUpcomingGameSession(sessions, todayStr, tomorrowStr),
    [sessions, todayStr, tomorrowStr],
  );

  if (!game) return null;

  const urgency = getGameUrgency(game, todayStr, now);
  const countdown = getCountdownLabel(game, todayStr, now);
  const typeLabel = getGameTypeLabel(game.type);
  const typeEmoji = getGameTypeEmoji(game.type);
  const issuesCount = countAvailabilityIssues(playerAvailability);
  const isToday = game.date === todayStr;

  const borderColor =
    urgency === 'imminent' ? 'border-red-500/40' : 'border-blue-500/30';
  const gradientBg =
    urgency === 'imminent'
      ? 'from-red-500/10 via-red-500/5 to-transparent'
      : 'from-blue-500/10 via-blue-500/5 to-transparent';
  const accentText =
    urgency === 'imminent' ? 'text-red-400' : 'text-blue-400';
  const badgeBg =
    urgency === 'imminent' ? 'bg-red-500/20' : 'bg-blue-500/20';
  const headerLabel =
    urgency === 'imminent'
      ? 'Starting Soon!'
      : isToday
      ? 'Game Day'
      : "Tomorrow's Game";

  async function handleShare() {
    const msg = buildGameReminderMsg(game!, teamName, coachName);
    try {
      if (navigator.share) {
        await navigator.share({ text: msg });
      } else {
        await navigator.clipboard.writeText(msg);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(msg);
      } catch {
        // ignore — can't share or copy
      }
    }
    setShared(true);
    setTimeout(() => setShared(false), 2500);
  }

  return (
    <div
      className={`rounded-2xl border ${borderColor} bg-gradient-to-br ${gradientBg} p-4 space-y-3`}
      role="region"
      aria-label={`${typeLabel} details`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl leading-none ${badgeBg}`}
          aria-hidden
        >
          {typeEmoji}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold uppercase tracking-wider ${accentText}`}>
            {headerLabel}
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            {game.opponent ? `${typeLabel} vs ${game.opponent}` : typeLabel}
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${accentText}`}>
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              {countdown}
            </span>
            {game.location && (
              <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                {game.location}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Availability warning */}
      {issuesCount > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
          <p className="text-xs text-amber-300">
            {issuesCount} player{issuesCount !== 1 ? 's' : ''} with availability concerns
          </p>
          <Link
            href="/roster"
            className="ml-auto text-xs text-amber-400 hover:text-amber-300 underline underline-offset-2 shrink-0"
          >
            View
          </Link>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2">
        <Link
          href={`/sessions/${game.id}/game-tracker`}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-[0.97] touch-manipulation text-white text-xs font-semibold py-2.5 px-3 transition-all"
        >
          <BarChart3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Game Tracker
        </Link>
        <Link
          href={`/sessions/${game.id}/subs`}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.97] touch-manipulation text-zinc-100 text-xs font-semibold py-2.5 px-3 transition-all"
        >
          <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Set Lineup
        </Link>
        <Link
          href="/plans"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-[0.97] touch-manipulation text-zinc-100 text-xs font-semibold py-2.5 px-3 transition-all"
        >
          <ListChecks className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Game Plan
        </Link>
        <button
          onClick={handleShare}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 hover:border-zinc-500 active:scale-[0.97] touch-manipulation text-zinc-300 text-xs font-semibold py-2.5 px-3 transition-all"
          aria-label="Remind parents about this game"
        >
          {shared ? (
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden />
          ) : (
            <Share2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          {shared ? 'Sent!' : 'Remind Parents'}
        </button>
      </div>
    </div>
  );
}
