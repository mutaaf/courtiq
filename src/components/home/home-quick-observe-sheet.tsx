'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { findTemplateById, getTemplatesBySentiment } from '@/lib/observation-templates';
import { formatSkillLabel } from '@/lib/skill-trend-utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { X, Check, Loader2, AlertCircle } from 'lucide-react';

export interface HomeQuickObserveSheetProps {
  player: { id: string; name: string; jersey_number: number | null };
  /** Pre-computed top focus category for this player (from playerFocusMap). */
  focusCategory?: string | null;
  sportSlug?: string | null;
  teamId: string;
  orgId: string;
  coachId: string;
  sessionId: string;
  onClose: () => void;
  onSaved: () => void;
}

export function HomeQuickObserveSheet({
  player,
  focusCategory,
  sportSlug,
  teamId,
  orgId,
  sessionId,
  onClose,
  onSaved,
}: HomeQuickObserveSheetProps) {
  const [sentiment, setSentiment] = useState<'positive' | 'needs-work'>('positive');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const trapRef = useFocusTrap<HTMLDivElement>({ enabled: true, onEscape: onClose });

  const handleSave = useCallback(async () => {
    const template = findTemplateById(templateId ?? '');
    const observationText = text.trim() || template?.text || '';
    if (!observationText) return;
    setSaving(true);
    setError(null);
    try {
      await mutate({
        table: 'observations',
        operation: 'insert',
        data: {
          team_id: teamId,
          org_id: orgId,
          player_name: player.name,
          player_id: player.id,
          session_id: sessionId,
          text: observationText,
          sentiment,
          category: template?.category || 'general',
          source: 'template' as const,
        },
      });
      queryClient.invalidateQueries({ queryKey: ['session-obs-count', sessionId] });
      setSaved(true);
      setTimeout(() => {
        onSaved();
        onClose();
      }, 1400);
    } catch {
      setError('Failed to save — please try again.');
    } finally {
      setSaving(false);
    }
  }, [templateId, text, teamId, orgId, player.name, player.id, sessionId, sentiment, queryClient, onSaved, onClose]);

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
        role="presentation"
      />
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Quick observation for ${player.name}`}
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl bg-zinc-900 border-t border-zinc-800 p-4 pb-10 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-zinc-500 font-medium">Quick Observation</p>
            <p className="text-sm font-semibold text-zinc-100">
              {player.jersey_number != null ? `#${player.jersey_number} ` : ''}{player.name}
            </p>
            {focusCategory && (
              <p className="text-xs text-amber-400 mt-0.5">
                Focus: {formatSkillLabel(focusCategory)}
              </p>
            )}
          </div>
          <button
            aria-label="Close quick observation"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <p className="text-xs text-red-300">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          {(['positive', 'needs-work'] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setSentiment(s); setTemplateId(null); }}
              className={`flex-1 rounded-xl py-2.5 text-sm font-medium transition-all touch-manipulation active:scale-[0.97] ${
                sentiment === s
                  ? s === 'positive'
                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-300'
                    : 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
              }`}
            >
              {s === 'positive' ? '👍 Positive' : '👎 Needs Work'}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {getTemplatesBySentiment(sentiment, sportSlug ?? undefined).slice(0, 8).map((t) => (
            <button
              key={t.id}
              onClick={() => { setTemplateId(templateId === t.id ? null : t.id); setText(''); }}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition-all touch-manipulation active:scale-[0.97] ${
                templateId === t.id
                  ? sentiment === 'positive'
                    ? 'bg-emerald-500/25 border border-emerald-500/60 text-emerald-200'
                    : 'bg-amber-500/25 border border-amber-500/60 text-amber-200'
                  : 'bg-zinc-800 border border-zinc-700 text-zinc-300'
              }`}
            >
              {t.text}
            </button>
          ))}
        </div>

        <Textarea
          placeholder="Add a specific note (optional)…"
          value={text}
          onChange={(e) => { setText(e.target.value); if (e.target.value) setTemplateId(null); }}
          rows={2}
          className="text-sm resize-none"
        />

        <Button
          onClick={handleSave}
          disabled={saving || saved || (!templateId && !text.trim())}
          className={`w-full h-12 text-base font-semibold transition-all ${
            saved ? 'bg-emerald-500 hover:bg-emerald-500' : ''
          }`}
        >
          {saved ? (
            <>
              <Check className="h-5 w-5" />
              Saved!
            </>
          ) : saving ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving…
            </>
          ) : (
            'Save Observation'
          )}
        </Button>
      </div>
    </>
  );
}
