'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, Share2, X, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { mutate } from '@/lib/api';
import type { Player } from '@/types/database';

interface BulkActionsBarProps {
  selectedPlayers: Player[];
  teamId: string;
  coachId: string;
  onClear: () => void;
}

type ActionState = 'idle' | 'loading' | 'success' | 'error';

export function BulkActionsBar({ selectedPlayers, teamId, coachId, onClear }: BulkActionsBarProps) {
  const [obsModal, setObsModal] = useState(false);
  const [obsText, setObsText] = useState('');
  const [obsSentiment, setObsSentiment] = useState<'positive' | 'neutral' | 'needs_work'>('neutral');
  const [obsCategory, setObsCategory] = useState('general');
  const [obsState, setObsState] = useState<ActionState>('idle');
  const [obsMessage, setObsMessage] = useState('');

  const [shareState, setShareState] = useState<ActionState>('idle');
  const [shareMessage, setShareMessage] = useState('');

  const count = selectedPlayers.length;

  const obsTrapRef = useFocusTrap<HTMLDivElement>({
    enabled: obsModal,
    onEscape: () => setObsModal(false),
  });

  async function handleBulkObservation() {
    if (!obsText.trim()) return;
    setObsState('loading');
    try {
      const observations = selectedPlayers.map((p) => ({
        player_id: p.id,
        team_id: teamId,
        coach_id: coachId,
        text: obsText.trim(),
        raw_text: obsText.trim(),
        category: obsCategory,
        sentiment: obsSentiment,
        source: 'typed' as const,
        ai_parsed: false,
        coach_edited: false,
        is_synced: true,
      }));
      await mutate({
        table: 'observations',
        operation: 'insert',
        data: observations,
      });
      setObsState('success');
      setObsMessage(`Saved observation for ${count} player${count !== 1 ? 's' : ''}`);
      setObsText('');
      setObsModal(false);
      setTimeout(() => setObsState('idle'), 3000);
    } catch (err) {
      setObsState('error');
      setObsMessage(err instanceof Error ? err.message : 'Failed to save observations');
      setTimeout(() => setObsState('idle'), 4000);
    }
  }

  async function handleBulkShare() {
    setShareState('loading');
    try {
      const urls: string[] = [];
      for (const player of selectedPlayers) {
        const res = await fetch('/api/share/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: player.id, teamId }),
        });
        if (res.ok) {
          const data = await res.json();
          urls.push(`${window.location.origin}${data.shareUrl} (${player.name})`);
        }
      }
      if (urls.length === 0) throw new Error('No share links created');

      const text = urls.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        setShareMessage(`${urls.length} share link${urls.length !== 1 ? 's' : ''} copied to clipboard`);
      } catch {
        prompt('Copy these share links:', text);
        setShareMessage(`${urls.length} share link${urls.length !== 1 ? 's' : ''} ready`);
      }
      setShareState('success');
      setTimeout(() => setShareState('idle'), 3000);
    } catch (err) {
      setShareState('error');
      setShareMessage(err instanceof Error ? err.message : 'Failed to create share links');
      setTimeout(() => setShareState('idle'), 4000);
    }
  }

  const feedbackMsg = obsState !== 'idle' ? obsMessage : shareState !== 'idle' ? shareMessage : null;
  const feedbackOk = obsState === 'success' || shareState === 'success';
  const feedbackErr = obsState === 'error' || shareState === 'error';

  return (
    <>
      {/* Sticky action bar */}
      <div className="fixed bottom-20 sm:bottom-4 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-lg rounded-2xl border border-orange-500/40 bg-zinc-900/95 shadow-2xl shadow-orange-500/10 backdrop-blur-sm p-3 flex items-center gap-3">
          {/* Count badge */}
          <div className="flex h-9 min-w-9 items-center justify-center rounded-xl bg-orange-500 px-3 text-sm font-bold text-white shrink-0">
            {count}
          </div>

          {/* Actions */}
          <div className="flex-1 flex items-center gap-2 overflow-x-auto">
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1.5 border-zinc-600 text-zinc-200 hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
              onClick={() => setObsModal(true)}
            >
              <MessageSquarePlus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Observation</span>
              <span className="sm:hidden">Observe</span>
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1.5 border-zinc-600 text-zinc-200 hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-400"
              onClick={handleBulkShare}
              disabled={shareState === 'loading'}
            >
              {shareState === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Share Reports</span>
              <span className="sm:hidden">Share</span>
            </Button>
          </div>

          {/* Clear */}
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 shrink-0 p-0 text-zinc-400 hover:text-zinc-200"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Feedback toast */}
      {feedbackMsg && (
        <div className={`fixed bottom-36 sm:bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${feedbackOk ? 'bg-emerald-600 text-white' : feedbackErr ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-200'}`}>
          {feedbackOk ? <CheckCircle className="h-4 w-4 shrink-0" /> : feedbackErr ? <AlertCircle className="h-4 w-4 shrink-0" /> : null}
          {feedbackMsg}
        </div>
      )}

      {/* Observation Modal */}
      {obsModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setObsModal(false)}>
          <div ref={obsTrapRef} role="dialog" aria-modal="true" aria-labelledby="bulk-obs-title" className="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 id="bulk-obs-title" className="text-base font-semibold text-zinc-100">
                Add observation for {count} player{count !== 1 ? 's' : ''}
              </h3>
              <button onClick={() => setObsModal(false)} aria-label="Close" className="text-zinc-400 hover:text-zinc-200 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <textarea
              aria-label="Observation text"
              className="w-full h-28 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
              placeholder="Describe what you observed (applied to all selected players)…"
              value={obsText}
              onChange={(e) => setObsText(e.target.value)}
              autoFocus
            />

            <div className="flex gap-2">
              <select
                aria-label="Observation category"
                value={obsCategory}
                onChange={(e) => setObsCategory(e.target.value)}
                className="flex-1 h-10 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="general">General</option>
                <option value="defense">Defense</option>
                <option value="offense">Offense</option>
                <option value="physical">Physical</option>
                <option value="mental">Mental</option>
                <option value="teamwork">Teamwork</option>
                <option value="skill">Skill</option>
              </select>
              <select
                aria-label="Observation sentiment"
                value={obsSentiment}
                onChange={(e) => setObsSentiment(e.target.value as any)}
                className="flex-1 h-10 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500"
              >
                <option value="positive">Positive</option>
                <option value="neutral">Neutral</option>
                <option value="needs_work">Needs Work</option>
              </select>
            </div>

            <Button
              className="w-full h-11"
              onClick={handleBulkObservation}
              disabled={!obsText.trim() || obsState === 'loading'}
            >
              {obsState === 'loading' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              ) : (
                <>Save for {count} Player{count !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
