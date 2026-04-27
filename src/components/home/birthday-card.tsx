'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Cake, Send, Copy, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  filterAllUpcomingBirthdays,
  sortByUpcomingBirthday,
  isBirthdayToday,
  formatBirthdayLabel,
  getAgeThisBirthday,
  buildBirthdayMessage,
  buildBirthdayWhatsAppUrl,
  getBirthdayDismissKey,
} from '@/lib/birthday-utils';
import type { BirthdayPlayer } from '@/lib/birthday-utils';

interface BirthdayCardProps {
  teamId: string;
  teamName: string;
}

export function BirthdayCard({ teamId, teamName }: BirthdayCardProps) {
  const today = useMemo(() => new Date(), []);
  const [dismissed, setDismissed] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(getBirthdayDismissKey(teamId, today)) === '1') {
        setDismissed(true);
      }
    } catch {}
  }, [teamId, today]);

  const { data: players = [] } = useQuery<BirthdayPlayer[]>({
    queryKey: ['birthday-roster', teamId],
    queryFn: () =>
      query<BirthdayPlayer[]>({
        table: 'players',
        select: 'id, name, date_of_birth, parent_name, parent_phone',
        filters: { team_id: teamId, is_active: true },
      }).then((r) => r ?? []),
    staleTime: 10 * 60_000,
  });

  const upcoming = useMemo(
    () => sortByUpcomingBirthday(filterAllUpcomingBirthdays(players, 6, today), today),
    [players, today]
  );

  function handleDismiss() {
    try {
      localStorage.setItem(getBirthdayDismissKey(teamId, today), '1');
    } catch {}
    setDismissed(true);
  }

  async function handleSend(player: BirthdayPlayer) {
    const age = player.date_of_birth ? getAgeThisBirthday(player.date_of_birth, today) : null;
    const message = buildBirthdayMessage(player.name, age, teamName);
    const whatsappUrl = buildBirthdayWhatsAppUrl(player, teamName, today);

    if (whatsappUrl) {
      window.open(whatsappUrl, '_blank');
      return;
    }

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ text: message });
        return;
      } catch {}
    }

    try {
      await navigator.clipboard.writeText(message);
      setCopiedId(player.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  }

  if (dismissed || upcoming.length === 0) return null;

  const hasToday = upcoming.some(
    (p) => p.date_of_birth && isBirthdayToday(p.date_of_birth, today)
  );

  return (
    <div
      className={`rounded-2xl border p-4 space-y-3 ${
        hasToday
          ? 'border-amber-500/40 bg-amber-500/8'
          : 'border-amber-500/20 bg-amber-500/5'
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
              hasToday ? 'bg-amber-500/25' : 'bg-amber-500/15'
            }`}
          >
            <Cake className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400">
            {hasToday ? 'Birthday Today!' : 'Upcoming Birthdays'}
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="text-zinc-600 hover:text-zinc-400 transition-colors p-1"
          aria-label="Dismiss birthday card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2">
        {upcoming.map((player) => {
          const isToday = !!player.date_of_birth && isBirthdayToday(player.date_of_birth, today);
          const label = player.date_of_birth
            ? formatBirthdayLabel(player.date_of_birth, today)
            : '';
          const age = player.date_of_birth
            ? getAgeThisBirthday(player.date_of_birth, today)
            : null;
          const isCopied = copiedId === player.id;

          return (
            <div
              key={player.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                isToday
                  ? 'border border-amber-500/25 bg-amber-500/12'
                  : 'bg-zinc-900/50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-zinc-100">{player.name}</p>
                  {isToday && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-zinc-900">
                      Today!
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {label}
                  {age !== null ? ` · Turns ${age}` : ''}
                  {player.parent_name ? ` · ${player.parent_name}` : ''}
                </p>
              </div>
              <Button
                size="sm"
                variant={isToday ? 'default' : 'outline'}
                className={`h-8 shrink-0 gap-1.5 text-xs ${
                  isToday
                    ? 'bg-amber-500 hover:bg-amber-400 text-zinc-900 border-0'
                    : 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                }`}
                onClick={() => handleSend(player)}
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied!
                  </>
                ) : player.parent_phone ? (
                  <>
                    <Send className="h-3.5 w-3.5" />
                    Send
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {upcoming.length > 0 && !hasToday && (
        <p className="text-[11px] text-zinc-600 text-center">
          Add parent phone numbers in the roster to enable one-tap WhatsApp
        </p>
      )}
    </div>
  );
}
