'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { getTemplatesBySentiment, type ObservationTemplate } from '@/lib/observation-templates';
import { queryKeys } from '@/lib/query/keys';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { X, Loader2, Check, AlertCircle, Mic } from 'lucide-react';
import Link from 'next/link';

export interface QuickObserveModalProps {
  player: { id: string; name: string };
  teamId: string;
  coachId: string;
  sessionId: string;
  sportId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export function QuickObserveModal({
  player,
  teamId,
  coachId,
  sessionId,
  sportId,
  onClose,
  onSaved,
}: QuickObserveModalProps) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const trapRef = useFocusTrap<HTMLDivElement>({ enabled: true, onEscape: onClose });

  const positiveTemplates = useMemo(
    () => getTemplatesBySentiment('positive', sportId ?? undefined).slice(0, 8),
    [sportId]
  );
  const needsWorkTemplates = useMemo(
    () => getTemplatesBySentiment('needs-work', sportId ?? undefined).slice(0, 8),
    [sportId]
  );

  const save = useCallback(
    async (template: ObservationTemplate) => {
      if (savingId) return;
      setSavingId(template.id);
      setSaveError(null);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(30);

      try {
        await mutate({
          table: 'observations',
          operation: 'insert',
          data: {
            team_id: teamId,
            coach_id: coachId,
            player_id: player.id,
            session_id: sessionId,
            recording_id: null,
            category: template.category,
            sentiment: template.sentiment,
            text: template.text,
            raw_text: template.text,
            source: 'template' as const,
            ai_parsed: false,
            coach_edited: false,
            is_synced: true,
          },
        });

        await queryClient.invalidateQueries({
          queryKey: queryKeys.observations.all(teamId),
        });
        await queryClient.invalidateQueries({
          queryKey: ['session-obs-count', sessionId],
        });

        setSavedId(template.id);
        if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate([60, 30, 60]);
        setTimeout(() => {
          onSaved();
          onClose();
        }, 600);
      } catch {
        setSaveError('Failed to save — please try again.');
        setSavingId(null);
      }
    },
    [savingId, teamId, coachId, player.id, sessionId, queryClient, onSaved, onClose]
  );

  const captureHref = `/capture?sessionId=${sessionId}&playerId=${player.id}&player=${encodeURIComponent(player.name)}`;
  const firstName = player.name.split(' ')[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
    >
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick observe ${player.name}`}
        className="w-full rounded-t-2xl border-t border-zinc-800 bg-zinc-950 pb-safe max-h-[85vh] overflow-y-auto"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-2 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Quick Observe</p>
            <p className="text-lg font-bold text-zinc-100">{player.name}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            aria-label="Close quick observe"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error banner */}
        {saveError && (
          <div className="mx-5 mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">{saveError}</p>
          </div>
        )}

        {/* Positive section */}
        <div className="px-5 pb-2">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-emerald-500">
            ✓ Great job, {firstName}!
          </p>
          <div className="grid grid-cols-2 gap-2">
            {positiveTemplates.map((t) => {
              const isSaving = savingId === t.id;
              const isSaved = savedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => save(t)}
                  disabled={!!savingId}
                  aria-label={t.text}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all touch-manipulation active:scale-[0.97] ${
                    isSaved
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                  } disabled:opacity-60`}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
                  ) : isSaved ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <span className="text-base leading-none" aria-hidden="true">{t.emoji}</span>
                  )}
                  <span className="text-xs font-medium leading-tight">{t.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Needs work section */}
        <div className="px-5 pt-3 pb-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-500">
            ↗ Needs work
          </p>
          <div className="grid grid-cols-2 gap-2">
            {needsWorkTemplates.map((t) => {
              const isSaving = savingId === t.id;
              const isSaved = savedId === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => save(t)}
                  disabled={!!savingId}
                  aria-label={t.text}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all touch-manipulation active:scale-[0.97] ${
                    isSaved
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900/60 text-zinc-200 hover:border-amber-500/40 hover:bg-amber-500/10'
                  } disabled:opacity-60`}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
                  ) : isSaved ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  ) : (
                    <span className="text-base leading-none" aria-hidden="true">{t.emoji}</span>
                  )}
                  <span className="text-xs font-medium leading-tight">{t.text}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Escape hatch: full capture page */}
        <div className="border-t border-zinc-800 px-5 py-3">
          <Link
            href={captureHref}
            onClick={onClose}
            className="flex items-center justify-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Mic className="h-3.5 w-3.5" />
            Voice or detailed note →
          </Link>
        </div>
      </div>
    </div>
  );
}
