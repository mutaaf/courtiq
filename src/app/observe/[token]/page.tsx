'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Loader2, Eye } from 'lucide-react';
import {
  getPositiveTemplates,
  getNeedsWorkTemplates,
  formatObserverCount,
  getSessionTypeLabel,
} from '@/lib/observer-utils';
import type { ObservationTemplate } from '@/lib/observation-templates';

interface SessionInfo {
  id: string;
  type: string;
  date: string;
  location: string | null;
  opponent: string | null;
}

interface PlayerInfo {
  id: string;
  name: string;
  nickname: string | null;
  jersey_number: number | null;
}

interface ObserveData {
  session: SessionInfo;
  team: { name: string; age_group: string | null } | null;
  coachName: string | null;
  players: PlayerInfo[];
  teamId: string;
  coachId: string;
}

type Step = 'sentiment' | 'template' | 'player';

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export default function ObservePage() {
  const { token } = useParams<{ token: string }>();

  const [data, setData] = useState<ObserveData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [step, setStep] = useState<Step>('sentiment');
  const [sentiment, setSentiment] = useState<'positive' | 'needs-work'>('positive');
  const [selectedTemplate, setSelectedTemplate] = useState<ObservationTemplate | null>(null);

  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/observe/${token}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setLoadError(body.error ?? 'Invalid or expired observer link.');
        return;
      }
      setData(await res.json());
    }
    load();
  }, [token]);

  const handleSentiment = (s: 'positive' | 'needs-work') => {
    setSentiment(s);
    setSelectedTemplate(null);
    setStep('template');
  };

  const handleTemplate = (t: ObservationTemplate) => {
    setSelectedTemplate(t);
    setStep('player');
  };

  const handlePlayer = useCallback(
    async (player: PlayerInfo) => {
      if (!selectedTemplate || saving) return;
      setSaving(true);
      setSaveError(null);

      const res = await fetch(`/api/observe/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId: selectedTemplate.id, playerId: player.id }),
      });

      if (res.ok) {
        setSavedCount((c) => c + 1);
        setLastSaved(`${selectedTemplate.emoji} ${selectedTemplate.text} — ${player.name}`);
        // Reset to template step so next observation is quick
        setSelectedTemplate(null);
        setStep('template');
        if (navigator.vibrate) navigator.vibrate(40);
      } else {
        const body = await res.json().catch(() => ({}));
        setSaveError(body.error ?? 'Failed to save. Please try again.');
      }

      setSaving(false);
    },
    [selectedTemplate, saving, token]
  );

  const resetToStart = () => {
    setStep('sentiment');
    setSelectedTemplate(null);
    setSaveError(null);
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (!data && !loadError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zinc-100 mb-2">Link unavailable</h1>
          <p className="text-zinc-400 text-sm">{loadError}</p>
          <p className="text-zinc-500 text-xs mt-4">
            Ask the coach to share a new observer link.
          </p>
        </div>
      </div>
    );
  }

  const { session, team, coachName, players } = data!;
  const positiveTemplates = getPositiveTemplates();
  const needsWorkTemplates = getNeedsWorkTemplates();
  const templates = sentiment === 'positive' ? positiveTemplates : needsWorkTemplates;

  // ── Observer UI ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-4">
        <div className="flex items-center gap-2 mb-0.5">
          <Eye className="h-4 w-4 text-orange-500 flex-shrink-0" />
          <span className="text-xs text-orange-400 font-medium uppercase tracking-wide">
            Observer Mode
          </span>
        </div>
        <h1 className="text-lg font-bold leading-tight">
          {team?.name ?? 'Team'}
        </h1>
        <p className="text-sm text-zinc-400">
          {getSessionTypeLabel(session.type)} · {formatDate(session.date)}
          {session.location && ` · ${session.location}`}
          {session.opponent && ` vs ${session.opponent}`}
        </p>
        {coachName && (
          <p className="text-xs text-zinc-500 mt-0.5">
            Helping Coach {coachName.split(' ')[0]} capture observations
          </p>
        )}
      </div>

      {/* Observation count strip */}
      {savedCount > 0 && (
        <div className="bg-emerald-950/60 border-b border-emerald-800/40 px-4 py-2 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
          <span className="text-sm text-emerald-300 font-medium">
            {formatObserverCount(savedCount)}
          </span>
          {lastSaved && (
            <span className="text-xs text-emerald-500 truncate ml-auto">
              Last: {lastSaved}
            </span>
          )}
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="bg-red-950/60 border-b border-red-800/40 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-300">{saveError}</span>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 p-4 space-y-6 pb-10">

        {/* Step 1 — Sentiment toggle */}
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
            {step === 'sentiment' ? 'Step 1 — What type of observation?' : 'Observation type'}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => handleSentiment('positive')}
              className={`flex items-center justify-center gap-2 rounded-xl py-4 px-3 text-sm font-semibold transition-all touch-manipulation active:scale-[0.97] ${
                sentiment === 'positive' && step !== 'sentiment'
                  ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 ring-offset-2 ring-offset-zinc-950'
                  : step === 'sentiment'
                  ? 'bg-zinc-800 text-zinc-100 hover:bg-emerald-900/60 hover:text-emerald-300'
                  : 'bg-zinc-800/50 text-zinc-500'
              }`}
            >
              ✅ Positive
            </button>
            <button
              onClick={() => handleSentiment('needs-work')}
              className={`flex items-center justify-center gap-2 rounded-xl py-4 px-3 text-sm font-semibold transition-all touch-manipulation active:scale-[0.97] ${
                sentiment === 'needs-work' && step !== 'sentiment'
                  ? 'bg-amber-600 text-white ring-2 ring-amber-500 ring-offset-2 ring-offset-zinc-950'
                  : step === 'sentiment'
                  ? 'bg-zinc-800 text-zinc-100 hover:bg-amber-900/60 hover:text-amber-300'
                  : 'bg-zinc-800/50 text-zinc-500'
              }`}
            >
              ⚠️ Needs Work
            </button>
          </div>
        </div>

        {/* Step 2 — Template chips */}
        {(step === 'template' || step === 'player') && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
              {step === 'template' ? 'Step 2 — What did you observe?' : 'Observation'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTemplate(t)}
                  className={`flex items-center gap-2 rounded-xl py-3 px-4 text-left text-sm font-medium transition-all touch-manipulation active:scale-[0.97] ${
                    selectedTemplate?.id === t.id
                      ? sentiment === 'positive'
                        ? 'bg-emerald-600 text-white ring-2 ring-emerald-500 ring-offset-1 ring-offset-zinc-950'
                        : 'bg-amber-600 text-white ring-2 ring-amber-500 ring-offset-1 ring-offset-zinc-950'
                      : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                  }`}
                >
                  <span className="text-lg leading-none flex-shrink-0">{t.emoji}</span>
                  <span className="leading-snug">{t.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3 — Player picker */}
        {step === 'player' && selectedTemplate && (
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">
              Step 3 — Which player?
            </p>
            {saving && (
              <div className="flex items-center gap-2 mb-3 text-sm text-zinc-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              {players.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handlePlayer(p)}
                  disabled={saving}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 bg-zinc-800 hover:bg-zinc-700 text-center text-sm font-medium transition-all touch-manipulation active:scale-[0.97] disabled:opacity-50 disabled:cursor-wait"
                >
                  <div
                    className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold ${
                      sentiment === 'positive'
                        ? 'bg-emerald-700 text-emerald-100'
                        : 'bg-amber-700 text-amber-100'
                    }`}
                  >
                    {getInitials(p.name)}
                  </div>
                  <span className="text-zinc-200 leading-tight truncate w-full text-center text-xs">
                    {p.nickname ?? p.name.split(' ')[0]}
                  </span>
                  {p.jersey_number != null && (
                    <span className="text-zinc-500 text-xs">#{p.jersey_number}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Back / reset */}
        {step !== 'sentiment' && (
          <button
            onClick={resetToStart}
            className="text-xs text-zinc-500 hover:text-zinc-300 underline underline-offset-2 transition-colors"
          >
            ← Start over
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="bg-zinc-900 border-t border-zinc-800 px-4 py-3 text-center">
        <p className="text-xs text-zinc-600">
          Powered by SportsIQ · 3 taps to save an observation
        </p>
      </div>
    </div>
  );
}
