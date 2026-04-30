'use client';

/**
 * PlayerFocusEntry — pinned per-player rapid observation entry.
 *
 * The fastest path for adding multiple observations to the same player:
 * pin the player at the top, fire off observations via template chips or
 * a single textarea, and never re-pick the player. Each save is direct
 * (no AI segmentation, no review step) because sentiment + category are
 * fixed by the template or chosen explicitly by the coach.
 *
 * Keyboard:
 *   1 / 2 / 3            switch sentiment (positive / needs-work / neutral)
 *   ⌘/Ctrl + Enter       save the current text
 *   Esc                  call onClose if provided
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Loader2,
  Mic,
  MicOff,
  Send,
  Undo2,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { Badge } from '@/components/ui/badge';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { cn } from '@/lib/utils';
import { useVoiceInput } from '@/hooks/use-voice-input';
import {
  OBSERVATION_TEMPLATES,
  type ObservationTemplate,
  type TemplateSentiment,
} from '@/lib/observation-templates';
import type { Sentiment } from '@/types/database';

type FocusSentiment = Sentiment;

interface FocusPlayer {
  id: string;
  name: string;
  jersey_number?: number | null;
  photo_url?: string | null;
}

interface SavedObservation {
  /** Stable client id; matches the optimistic insert. */
  localId: string;
  /** DB id once the insert returns; null while pending. */
  serverId: string | null;
  text: string;
  sentiment: FocusSentiment;
  category: string;
  pending: boolean;
  errored: boolean;
  savedAt: number;
}

interface Props {
  player: FocusPlayer;
  teamId: string;
  coachId: string;
  sessionId?: string | null;
  /** Triggered when the coach taps the Switch button. If omitted, button is hidden. */
  onSwitchPlayer?: () => void;
  /** Triggered when the coach dismisses focus mode entirely. */
  onClose?: () => void;
  /** Compact rendering for inline use on the player detail page. */
  compact?: boolean;
  autoFocusInput?: boolean;
}

const SENTIMENT_TABS: Array<{
  value: FocusSentiment;
  label: string;
  emoji: string;
  ringClass: string;
  bgClass: string;
  textClass: string;
}> = [
  { value: 'positive',   label: 'Positive',   emoji: '👍', ringClass: 'ring-emerald-400/50', bgClass: 'bg-emerald-500/15', textClass: 'text-emerald-300' },
  { value: 'needs-work', label: 'Needs Work', emoji: '💪', ringClass: 'ring-amber-400/50',   bgClass: 'bg-amber-500/15',   textClass: 'text-amber-300'   },
  { value: 'neutral',    label: 'Note',       emoji: '📝', ringClass: 'ring-zinc-400/40',    bgClass: 'bg-zinc-700/40',    textClass: 'text-zinc-200'    },
];

const CUSTOM_CATEGORY = 'general';

function relativeTime(ts: number): string {
  const sec = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s ago`;
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`;
  return `${Math.round(sec / 3600)}h ago`;
}

export function PlayerFocusEntry({
  player,
  teamId,
  coachId,
  sessionId,
  onSwitchPlayer,
  onClose,
  compact = false,
  autoFocusInput = false,
}: Props) {
  const queryClient = useQueryClient();
  const [sentiment, setSentiment] = useState<FocusSentiment>('positive');
  const [text, setText] = useState('');
  const [savedList, setSavedList] = useState<SavedObservation[]>([]);
  const [savingTemplate, setSavingTemplate] = useState<string | null>(null);
  const [savingCustom, setSavingCustom] = useState(false);
  const [, forceTick] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const voice = useVoiceInput();

  // Refresh "Xs ago" labels every 15s while at least one obs is in the list.
  useEffect(() => {
    if (savedList.length === 0) return;
    const t = setInterval(() => forceTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [savedList.length]);

  useEffect(() => {
    if (autoFocusInput) textareaRef.current?.focus();
  }, [autoFocusInput]);

  // Pull voice transcript into the textarea once recording stops.
  useEffect(() => {
    if (!voice.isRecording && voice.transcript) {
      setText((cur) => (cur ? `${cur} ${voice.transcript}` : voice.transcript).trim());
      voice.reset();
      textareaRef.current?.focus();
    }
  }, [voice.isRecording, voice.transcript, voice]);

  const templatesForSentiment = useMemo<ObservationTemplate[]>(() => {
    if (sentiment === 'neutral') return []; // Neutral is freeform — encourages typing.
    const tone = sentiment as TemplateSentiment;
    return OBSERVATION_TEMPLATES.filter((t) => t.sentiment === tone);
  }, [sentiment]);

  const invalidateAfterSave = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.observations.all(teamId) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: queryKeys.observations.player(player.id) }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['home-stats', teamId] }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['home-pulse', teamId] }).catch(() => {});
    if (sessionId) {
      queryClient.invalidateQueries({ queryKey: queryKeys.observations.session(sessionId) }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['session-obs-count', sessionId] }).catch(() => {});
    }
  }, [queryClient, teamId, player.id, sessionId]);

  const persist = useCallback(async (
    body: { text: string; sentiment: FocusSentiment; category: string; templateId?: string },
  ) => {
    const localId = crypto.randomUUID();
    const optimistic: SavedObservation = {
      localId,
      serverId: null,
      text: body.text,
      sentiment: body.sentiment,
      category: body.category,
      pending: true,
      errored: false,
      savedAt: Date.now(),
    };
    setSavedList((prev) => [optimistic, ...prev].slice(0, 10));
    if (navigator.vibrate) navigator.vibrate(30);

    try {
      const inserted = await mutate<{ id: string }[] | { id: string } | null>({
        table: 'observations',
        operation: 'insert',
        data: {
          team_id: teamId,
          coach_id: coachId,
          player_id: player.id,
          session_id: sessionId ?? null,
          recording_id: null,
          category: body.category,
          sentiment: body.sentiment,
          text: body.text,
          raw_text: body.text,
          source: 'typed' as const,
          ai_parsed: false,
          coach_edited: !body.templateId,
          is_synced: true,
        },
        select: 'id',
      });
      const serverId = Array.isArray(inserted) ? inserted[0]?.id ?? null : (inserted?.id ?? null);
      setSavedList((prev) => prev.map((o) =>
        o.localId === localId ? { ...o, pending: false, serverId } : o,
      ));
      invalidateAfterSave();
    } catch (e) {
      console.error('Focus entry save failed:', e);
      setSavedList((prev) => prev.map((o) =>
        o.localId === localId ? { ...o, pending: false, errored: true } : o,
      ));
    }
  }, [teamId, coachId, player.id, sessionId, invalidateAfterSave]);

  const saveTemplate = useCallback(async (template: ObservationTemplate) => {
    if (savingTemplate) return;
    setSavingTemplate(template.id);
    await persist({
      text: template.text,
      sentiment: template.sentiment as FocusSentiment,
      category: template.category,
      templateId: template.id,
    });
    setSavingTemplate(null);
  }, [persist, savingTemplate]);

  const saveCustom = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || savingCustom) return;
    setSavingCustom(true);
    setText('');
    await persist({ text: trimmed, sentiment, category: CUSTOM_CATEGORY });
    setSavingCustom(false);
    textareaRef.current?.focus();
  }, [persist, sentiment, savingCustom, text]);

  const undo = useCallback(async (item: SavedObservation) => {
    if (!item.serverId) return; // still in flight — block undo
    setSavedList((prev) => prev.filter((o) => o.localId !== item.localId));
    try {
      await mutate({
        table: 'observations',
        operation: 'delete',
        filters: { id: item.serverId },
      });
      invalidateAfterSave();
    } catch (e) {
      console.error('Undo failed:', e);
      setSavedList((prev) => [{ ...item, errored: true }, ...prev]);
    }
  }, [invalidateAfterSave]);

  // Keyboard shortcuts on the focus surface.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable = target?.tagName === 'TEXTAREA' || target?.tagName === 'INPUT';
      if (e.key === 'Escape' && onClose) {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        saveCustom();
        return;
      }
      if (!inEditable) {
        if (e.key === '1') { setSentiment('positive'); }
        else if (e.key === '2') { setSentiment('needs-work'); }
        else if (e.key === '3') { setSentiment('neutral'); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saveCustom]);

  const successCount = savedList.filter((o) => !o.errored).length;
  const padding = compact ? 'p-4' : 'p-5';

  return (
    <Card className="border-orange-500/30 bg-zinc-900/70 ring-1 ring-orange-500/10">
      <CardContent className={cn('space-y-4', padding)}>

        {/* Header — pinned player */}
        <div className="flex items-center gap-3">
          <PlayerAvatar photoUrl={player.photo_url ?? null} name={player.name} size={48} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-semibold text-zinc-100 sm:text-base">
                {player.name}
              </p>
              {player.jersey_number != null && (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-orange-400">
                  #{player.jersey_number}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {successCount === 0
                ? 'Tap a chip to save instantly'
                : `${successCount} saved this session`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {onSwitchPlayer && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSwitchPlayer}
                aria-label="Switch player"
                className="text-zinc-400 hover:text-zinc-100"
              >
                <ArrowLeftRight className="h-4 w-4" />
                <span className="hidden sm:inline">Switch</span>
              </Button>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Close focus mode"
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sentiment tabs */}
        <div className="flex gap-2">
          {SENTIMENT_TABS.map((tab) => {
            const active = sentiment === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSentiment(tab.value)}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all touch-manipulation active:scale-[0.97]',
                  active
                    ? `${tab.bgClass} ${tab.textClass} ring-2 ${tab.ringClass}`
                    : 'bg-zinc-900/60 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200',
                )}
                aria-pressed={active}
              >
                <span aria-hidden>{tab.emoji}</span>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Quick template chips (only shown for positive / needs-work) */}
        {templatesForSentiment.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {templatesForSentiment.map((t) => {
              const isSaving = savingTemplate === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!!savingTemplate}
                  onClick={() => saveTemplate(t)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-medium transition-all touch-manipulation active:scale-95',
                    isSaving
                      ? 'border-orange-500/60 bg-orange-500/10 text-orange-300'
                      : 'border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800',
                  )}
                >
                  <span aria-hidden>{t.emoji}</span>
                  <span className="truncate max-w-[180px]">{t.text}</span>
                  {isSaving && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Custom text + voice */}
        <div className="space-y-2">
          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={voice.isRecording ? `${text}${text ? ' ' : ''}${voice.interimTranscript}` : text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                sentiment === 'neutral'
                  ? `Note about ${player.name}…`
                  : `Custom ${sentiment === 'positive' ? 'positive' : 'needs-work'} note about ${player.name}…`
              }
              rows={compact ? 2 : 3}
              className="resize-none pr-12"
            />
            {voice.isSupported && (
              <button
                type="button"
                onClick={() => (voice.isRecording ? voice.stop() : voice.start())}
                aria-label={voice.isRecording ? 'Stop recording' : 'Start voice input'}
                className={cn(
                  'absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                  voice.isRecording
                    ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/40 animate-pulse'
                    : 'bg-zinc-800 text-zinc-400 hover:text-zinc-100',
                )}
              >
                {voice.isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] text-zinc-500">
            <span>
              <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-300">
                ⌘+Enter
              </kbd>{' '}
              to save · <kbd className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[10px] text-zinc-300">1/2/3</kbd> tone
            </span>
            <Button
              size="sm"
              onClick={saveCustom}
              disabled={!text.trim() || savingCustom}
              className="h-8"
            >
              {savingCustom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </div>

        {/* Recently-saved list */}
        {savedList.length > 0 && (
          <div className="space-y-1.5 border-t border-zinc-800 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              This session
            </p>
            <ul className="space-y-1">
              {savedList.map((item) => (
                <li
                  key={item.localId}
                  className={cn(
                    'flex items-start gap-2 rounded-md px-2 py-1.5 text-xs transition-colors',
                    item.errored ? 'bg-red-500/5 text-red-300' : 'bg-zinc-900/50 text-zinc-300',
                  )}
                >
                  {item.pending ? (
                    <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-zinc-500" />
                  ) : item.errored ? (
                    <X className="mt-0.5 h-3 w-3 shrink-0 text-red-400" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-400" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{item.text}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <Badge
                        variant={
                          item.sentiment === 'positive'
                            ? 'success'
                            : item.sentiment === 'needs-work'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="h-4 px-1.5 text-[10px]"
                      >
                        {item.sentiment === 'needs-work' ? 'needs work' : item.sentiment}
                      </Badge>
                      <span className="text-[10px] text-zinc-500">{relativeTime(item.savedAt)}</span>
                    </div>
                  </div>
                  {!item.pending && !item.errored && item.serverId && (
                    <button
                      type="button"
                      onClick={() => undo(item)}
                      className="shrink-0 text-[11px] text-zinc-500 hover:text-zinc-200 inline-flex items-center gap-1"
                    >
                      <Undo2 className="h-3 w-3" />
                      Undo
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
