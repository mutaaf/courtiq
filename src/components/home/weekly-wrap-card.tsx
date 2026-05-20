'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, X, Copy, Check, MessageSquare, Pencil, CheckCheck } from 'lucide-react';
import { query } from '@/lib/api';
import {
  buildWeeklyWrapMessage,
  buildWrapPreview,
  buildWrapWhatsAppUrl,
  countNeedsWorkWrapObs,
  countObservedPlayers,
  countPositiveWrapObs,
  countTotalObs,
  dismissWrap,
  getCutoffIso,
  getTopNeedsWorkWrapCategory,
  getTopPlayerIdByPositive,
  getTopPositiveWrapCategory,
  hasEnoughDataForWrap,
  isWrapDismissed,
  type WrapObs,
  type WrapPlayer,
} from '@/lib/weekly-wrap-utils';

interface Session {
  id: string;
  date: string;
}

interface WeeklyWrapCardProps {
  teamId: string;
  teamName: string;
  coachName: string;
  totalPlayerCount: number;
}

export function WeeklyWrapCard({
  teamId,
  teamName,
  coachName,
  totalPlayerCount,
}: WeeklyWrapCardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'sent'>('idle');
  const [editMode, setEditMode] = useState(false);
  const [editedMessage, setEditedMessage] = useState<string | null>(null);

  const cutoff7 = useMemo(() => getCutoffIso(7), []);

  // Observations from the last 7 days
  const { data: rawObs = [] } = useQuery<WrapObs[]>({
    queryKey: ['weekly-wrap-obs', teamId, cutoff7],
    queryFn: () =>
      query<WrapObs[]>({
        table: 'observations',
        select: 'player_id, sentiment, category, created_at',
        filters: {
          team_id: teamId,
          created_at: { op: 'gte', value: cutoff7 },
        },
        order: { column: 'created_at', ascending: false },
        limit: 200,
      }).then((r) => r ?? []),
    staleTime: 10 * 60_000,
  });

  // Sessions in the last 7 days
  const { data: recentSessions = [] } = useQuery<Session[]>({
    queryKey: ['weekly-wrap-sessions', teamId, cutoff7],
    queryFn: () =>
      query<Session[]>({
        table: 'sessions',
        select: 'id, date',
        filters: {
          team_id: teamId,
          date: { op: 'gte', value: cutoff7.split('T')[0] },
        },
      }).then((r) => r ?? []),
    staleTime: 10 * 60_000,
  });

  // Player names for top-player resolution
  const topPlayerId = useMemo(() => getTopPlayerIdByPositive(rawObs), [rawObs]);

  const { data: players = [] } = useQuery<WrapPlayer[]>({
    queryKey: ['weekly-wrap-players', teamId],
    queryFn: () =>
      query<WrapPlayer[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: teamId },
      }).then((r) => r ?? []),
    staleTime: 30 * 60_000,
    enabled: !!topPlayerId,
  });

  // Computed stats
  const {
    message,
    preview,
    hasData,
    alreadyDismissed,
    topPlayerName,
    posCount,
    needsCount,
  } = useMemo(() => {
    const alreadyDismissed = isWrapDismissed(teamId);
    const hasData = hasEnoughDataForWrap(rawObs);

    if (!hasData) {
      return { message: '', preview: '', hasData, alreadyDismissed, topPlayerName: null, posCount: 0, needsCount: 0 };
    }

    const topPositiveCategory = getTopPositiveWrapCategory(rawObs);
    const topNeedsWorkCategory = getTopNeedsWorkWrapCategory(rawObs);
    const topPlayerObj = players.find((p) => p.id === topPlayerId);
    const topPlayerName = topPlayerObj?.name ?? null;
    const observedPlayerCount = countObservedPlayers(rawObs);
    const obsCount = countTotalObs(rawObs);
    const sessionCount = recentSessions.length;
    const posCount = countPositiveWrapObs(rawObs);
    const needsCount = countNeedsWorkWrapObs(rawObs);

    const params = {
      teamName,
      coachName,
      obsCount,
      sessionCount,
      observedPlayerCount,
      totalPlayerCount,
      topPlayerName,
      topPositiveCategory,
      topNeedsWorkCategory,
    };

    return {
      message: buildWeeklyWrapMessage(params),
      preview: buildWrapPreview(params),
      hasData,
      alreadyDismissed,
      topPlayerName,
      posCount,
      needsCount,
    };
  }, [rawObs, recentSessions, players, teamId, teamName, coachName, totalPlayerCount, topPlayerId]);

  if (!hasData || alreadyDismissed || dismissed) return null;

  function handleDismiss() {
    dismissWrap(teamId);
    setDismissed(true);
  }

  function handleOpenEdit() {
    if (editedMessage === null) setEditedMessage(message);
    setEditMode(true);
  }

  async function handleShare() {
    setEditMode(false);
    const textToSend = editedMessage ?? message;
    if (navigator.share) {
      try {
        await navigator.share({ text: textToSend });
        setShareState('sent');
        setTimeout(() => setShareState('idle'), 2500);
        return;
      } catch {
        // fall through to WhatsApp
      }
    }
    window.open(buildWrapWhatsAppUrl(textToSend), '_blank', 'noopener');
    setShareState('sent');
    setTimeout(() => setShareState('idle'), 2500);
  }

  async function handleCopy() {
    const textToSend = editedMessage ?? message;
    try {
      await navigator.clipboard.writeText(textToSend);
    } catch {
      // ignore
    }
    setShareState('copied');
    setTimeout(() => setShareState('idle'), 2500);
  }

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/20">
          <MessageSquare className="h-5 w-5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-400">
            This Week's Update
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            Send a quick update to parent group chat
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Dismiss weekly update card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Preview stats row */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300">
          {rawObs.length} obs
        </span>
        {recentSessions.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300">
            {recentSessions.length} {recentSessions.length === 1 ? 'session' : 'sessions'}
          </span>
        )}
        {posCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-400">
            ✓ {posCount} positive
          </span>
        )}
        {needsCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs text-amber-400">
            ↑ {needsCount} to improve
          </span>
        )}
      </div>

      {/* Message — editable before sending */}
      {editMode ? (
        <div className="space-y-2">
          <textarea
            value={editedMessage ?? ''}
            onChange={(e) => setEditedMessage(e.target.value)}
            rows={9}
            aria-label="Edit parent update message"
            className="w-full rounded-xl bg-zinc-900/80 border border-violet-500/40 px-3 py-2.5 text-xs text-zinc-200 leading-relaxed resize-none focus:outline-none focus:ring-1 focus:ring-violet-500 placeholder:text-zinc-600"
          />
          <button
            onClick={() => setEditMode(false)}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 transition-colors"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Done editing
          </button>
        </div>
      ) : (
        <div className="relative rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2.5 group">
          <p className="text-[10px] font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">
            Parent update · tap ✏️ to personalise
          </p>
          <p className="text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap line-clamp-4">
            {editedMessage ?? preview}
          </p>
          <button
            onClick={handleOpenEdit}
            className="absolute top-2 right-2 rounded-md p-1.5 text-zinc-600 hover:text-violet-400 hover:bg-violet-500/10 transition-colors touch-manipulation"
            aria-label="Edit message before sending"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-[0.97] touch-manipulation text-white text-sm font-semibold py-2.5 px-4 transition-all"
          aria-label="Share weekly update with parents"
        >
          {shareState === 'sent' ? (
            <>
              <Check className="h-4 w-4" />
              Sent!
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send to Parents
            </>
          )}
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 hover:border-zinc-600 active:scale-[0.97] touch-manipulation text-zinc-300 text-sm py-2.5 px-3 transition-all"
          aria-label="Copy weekly update to clipboard"
        >
          {shareState === 'copied' ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
