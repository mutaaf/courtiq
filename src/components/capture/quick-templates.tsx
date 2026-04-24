'use client';

/**
 * QuickTemplates — one-tap pre-defined observation chips for the capture page.
 *
 * Coaches tap a template chip → pick a player from a bottom sheet →
 * the observation is saved immediately (no AI segmentation needed since
 * sentiment and category are already defined by the template).
 */

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronRight, X, Loader2, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mutate, query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import {
  getTemplatesBySentiment,
  type ObservationTemplate,
  type TemplateSentiment,
} from '@/lib/observation-templates';

interface Player {
  id: string;
  name: string;
  jersey_number: number | null;
}

interface QuickTemplatesProps {
  teamId: string;
  coachId: string;
  sessionId?: string | null;
  preselectPlayerId?: string | null;
}

// ── Sentiment tab ──────────────────────────────────────────────────────────────

const TAB_LABELS: { value: TemplateSentiment; label: string; color: string; ring: string }[] = [
  {
    value: 'positive',
    label: 'Positive',
    color: 'text-emerald-400',
    ring: 'ring-emerald-500/40',
  },
  {
    value: 'needs-work',
    label: 'Needs Work',
    color: 'text-amber-400',
    ring: 'ring-amber-500/40',
  },
];

// ── Player picker bottom sheet ─────────────────────────────────────────────────

interface PlayerPickerProps {
  template: ObservationTemplate;
  teamId: string;
  coachId: string;
  sessionId?: string | null;
  preselectPlayerId?: string | null;
  onClose: () => void;
  onSaved: (playerName: string) => void;
}

function PlayerPicker({
  template,
  teamId,
  coachId,
  sessionId,
  preselectPlayerId,
  onClose,
  onSaved,
}: PlayerPickerProps) {
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const sheetRef = useFocusTrap<HTMLDivElement>({ enabled: true, onEscape: onClose });

  // Load players lazily when sheet opens
  useState(() => {
    query<Player[]>({
      table: 'players',
      select: 'id, name, jersey_number',
      filters: { team_id: teamId, is_active: true },
      order: { column: 'name', ascending: true },
    })
      .then((data) => setPlayers(data ?? []))
      .catch(() => setLoadError(true));
  });

  const save = useCallback(
    async (player: Player) => {
      if (savingId) return;
      setSavingId(player.id);
      if (navigator.vibrate) navigator.vibrate(30);

      try {
        await mutate({
          table: 'observations',
          operation: 'insert',
          data: {
            team_id: teamId,
            coach_id: coachId,
            player_id: player.id,
            session_id: sessionId ?? null,
            recording_id: null,
            category: template.category,
            sentiment: template.sentiment,
            text: template.text,
            raw_text: template.text,
            source: 'typed' as const,
            ai_parsed: false,
            coach_edited: false,
            is_synced: true,
          },
        });

        await queryClient.invalidateQueries({
          queryKey: queryKeys.observations.all(teamId),
        });

        if (navigator.vibrate) navigator.vibrate([60, 30, 60]);
        onSaved(player.name.split(' ')[0]);
      } catch {
        setSavingId(null);
      }
    },
    [savingId, teamId, coachId, sessionId, template, queryClient, onSaved]
  );

  const sentimentStyle =
    template.sentiment === 'positive'
      ? { badge: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-500' }
      : { badge: 'bg-amber-500/15 text-amber-400', dot: 'bg-amber-500' };

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Select player for observation"
    >
      <div
        ref={sheetRef}
        className="w-full rounded-t-2xl border-t border-zinc-800 bg-zinc-950 pb-safe"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pt-2 pb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{template.emoji}</span>
              <p className="text-sm font-semibold text-zinc-100 leading-tight">{template.text}</p>
            </div>
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium', sentimentStyle.badge)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', sentimentStyle.dot)} />
              {template.sentiment === 'positive' ? 'Positive' : 'Needs Work'} · {template.category}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors"
            aria-label="Close player picker"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="px-5 pb-3 text-xs font-medium text-zinc-500 uppercase tracking-wider">
          Select player
        </p>

        {/* Player list */}
        <div className="max-h-[55vh] overflow-y-auto pb-6 px-3">
          {loadError && (
            <p className="px-2 py-4 text-center text-sm text-red-400">Failed to load players.</p>
          )}

          {!players && !loadError && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-600" />
            </div>
          )}

          {players?.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-zinc-500">No active players on this team.</p>
          )}

          {players
            ?.slice()
            .sort((a, b) => {
              if (preselectPlayerId) {
                if (a.id === preselectPlayerId) return -1;
                if (b.id === preselectPlayerId) return 1;
              }
              return 0;
            })
            .map((player) => {
            const isSaving = savingId === player.id;
            const isPreselected = preselectPlayerId === player.id;
            return (
              <button
                key={player.id}
                onClick={() => save(player)}
                disabled={!!savingId}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left transition-colors hover:bg-zinc-800/70 active:scale-[0.98] touch-manipulation disabled:opacity-60',
                  isPreselected && 'border border-orange-500/40 bg-orange-500/8'
                )}
              >
                {/* Jersey badge */}
                <div className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                  isPreselected ? 'bg-orange-500/20 text-orange-300' : 'bg-zinc-800 text-zinc-300'
                )}>
                  {player.jersey_number != null ? `#${player.jersey_number}` : '—'}
                </div>
                <span className={cn('flex-1 text-sm font-medium', isPreselected ? 'text-orange-200' : 'text-zinc-200')}>
                  {player.name}
                  {isPreselected && <span className="ml-2 text-xs text-orange-400/80">suggested</span>}
                </span>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin text-orange-400" />
                ) : (
                  <ChevronRight className={cn('h-4 w-4', isPreselected ? 'text-orange-400' : 'text-zinc-600')} />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Success toast ──────────────────────────────────────────────────────────────

function SuccessToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-28 inset-x-0 z-40 flex justify-center px-4 pointer-events-none"
    >
      <div className="flex items-center gap-2.5 rounded-full border border-emerald-500/30 bg-zinc-900 px-5 py-3 shadow-lg shadow-black/40 pointer-events-auto">
        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
        <span className="text-sm font-medium text-zinc-100">{message}</span>
        <button
          onClick={onDismiss}
          className="ml-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function QuickTemplates({ teamId, coachId, sessionId, preselectPlayerId }: QuickTemplatesProps) {
  const [activeTab, setActiveTab] = useState<TemplateSentiment>('positive');
  const [selectedTemplate, setSelectedTemplate] = useState<ObservationTemplate | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [successTimer, setSuccessTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  const templates = getTemplatesBySentiment(activeTab);

  const handleTemplateClick = useCallback((template: ObservationTemplate) => {
    setSelectedTemplate(template);
    if (successTimer) clearTimeout(successTimer);
    setSuccessMsg(null);
  }, [successTimer]);

  const handleSaved = useCallback((playerFirstName: string) => {
    setSelectedTemplate(null);
    const msg = `Saved for ${playerFirstName}`;
    setSuccessMsg(msg);
    const timer = setTimeout(() => setSuccessMsg(null), 3000);
    setSuccessTimer(timer);
  }, []);

  const handleClose = useCallback(() => setSelectedTemplate(null), []);

  return (
    <>
      <div className="space-y-3">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-orange-500/15">
            <Zap className="h-3.5 w-3.5 text-orange-400" />
          </div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Quick Templates
          </h2>
        </div>

        {/* Sentiment tabs */}
        <div className="flex gap-2" role="tablist" aria-label="Template sentiment">
          {TAB_LABELS.map((tab) => (
            <button
              key={tab.value}
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={cn(
                'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-all touch-manipulation active:scale-[0.97]',
                activeTab === tab.value
                  ? cn('border-transparent bg-zinc-800', tab.color)
                  : 'border-zinc-800 bg-zinc-900/50 text-zinc-500 hover:border-zinc-700 hover:text-zinc-400'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Template chips */}
        <div
          role="tabpanel"
          className="flex flex-wrap gap-2"
        >
          {templates.map((template) => {
            const isPositive = template.sentiment === 'positive';
            return (
              <button
                key={template.id}
                onClick={() => handleTemplateClick(template)}
                aria-label={`Log observation: ${template.text}`}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all touch-manipulation active:scale-[0.95]',
                  isPositive
                    ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-300 hover:border-emerald-500/50 hover:bg-emerald-500/15'
                    : 'border-amber-500/25 bg-amber-500/8 text-amber-300 hover:border-amber-500/50 hover:bg-amber-500/15'
                )}
              >
                <span className="text-base leading-none">{template.emoji}</span>
                <span>{template.text}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Player picker bottom sheet */}
      {selectedTemplate && (
        <PlayerPicker
          template={selectedTemplate}
          teamId={teamId}
          coachId={coachId}
          sessionId={sessionId}
          preselectPlayerId={preselectPlayerId}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}

      {/* Success toast */}
      {successMsg && (
        <SuccessToast
          message={successMsg}
          onDismiss={() => {
            setSuccessMsg(null);
            if (successTimer) clearTimeout(successTimer);
          }}
        />
      )}
    </>
  );
}
