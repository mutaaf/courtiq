'use client';

import { useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { findPlayerByName } from '@/lib/player-match';
import {
  ArrowLeft,
  Camera,
  Loader2,
  CheckCircle2,
  X,
  Sparkles,
  ImageIcon,
  ThumbsUp,
  ThumbsDown,
  Minus,
  RotateCcw,
  Save,
} from 'lucide-react';
import Link from 'next/link';
import type { Sentiment } from '@/types/database';

interface SnapObservation {
  id: string;
  player_name: string;
  category: string;
  sentiment: Sentiment;
  text: string;
  skill_id?: string | null;
  selected: boolean;
  isTeam?: boolean;
}

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; icon: React.ReactNode; cls: string }> = {
  positive: {
    label: 'Positive',
    icon: <ThumbsUp className="h-3 w-3" />,
    cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  },
  'needs-work': {
    label: 'Needs Work',
    icon: <ThumbsDown className="h-3 w-3" />,
    cls: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  neutral: {
    label: 'Neutral',
    icon: <Minus className="h-3 w-3" />,
    cls: 'bg-zinc-700/60 text-zinc-400 border-zinc-600/40',
  },
};

export default function PhotoCapturePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const preselectedPlayerId = searchParams.get('playerId');

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [customFocus, setCustomFocus] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [imageDescription, setImageDescription] = useState('');
  const [observations, setObservations] = useState<SnapObservation[]>([]);
  const [analyzed, setAnalyzed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setError(null);
    setAnalyzed(false);
    setObservations([]);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImagePreview(dataUrl);
      // Strip the data URL prefix to get raw base64
      const base64 = dataUrl.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const analyzePhoto = async () => {
    if (!imageBase64 || !activeTeam) return;
    setAnalyzing(true);
    setError(null);
    setObservations([]);

    try {
      const res = await fetch('/api/ai/snap-observation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: activeTeam.id,
          imageBase64,
          customFocus: customFocus.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Analysis failed');
      }

      const data = await res.json();
      setImageDescription(data.image_description || '');

      const allObs: SnapObservation[] = [
        ...(data.observations || []).map((o: any, i: number) => ({
          id: `obs-${i}`,
          player_name: o.player_name,
          category: o.category,
          sentiment: o.sentiment as Sentiment,
          text: o.text,
          skill_id: o.skill_id ?? null,
          selected: true,
          isTeam: false,
        })),
        ...(data.team_observations || []).map((o: any, i: number) => ({
          id: `team-${i}`,
          player_name: 'Team',
          category: o.category,
          sentiment: o.sentiment as Sentiment,
          text: o.text,
          skill_id: null,
          selected: true,
          isTeam: true,
        })),
      ];

      setObservations(allObs);
      setAnalyzed(true);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze photo');
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleObservation = (id: string) => {
    setObservations((prev) =>
      prev.map((o) => (o.id === id ? { ...o, selected: !o.selected } : o))
    );
  };

  const saveObservations = async () => {
    if (!activeTeam || !coach) return;
    const selected = observations.filter((o) => o.selected);
    if (selected.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const players = await queryClient.fetchQuery({
        queryKey: queryKeys.players.all(activeTeam.id),
        queryFn: () =>
          query<{ id: string; name: string; nickname: string | null; name_variants: string[] | null }[]>({
            table: 'players',
            filters: { team_id: activeTeam.id, is_active: true },
            select: 'id,name,nickname,name_variants',
          }),
      });

      const findPlayerId = (name: string): string | null => {
        if (preselectedPlayerId) return preselectedPlayerId;
        return findPlayerByName(name, players ?? []);
      };

      const rows = selected.map((o) => ({
        team_id: activeTeam.id,
        coach_id: coach.id,
        session_id: null,
        player_id: o.isTeam ? null : findPlayerId(o.player_name),
        category: o.category,
        sentiment: o.sentiment,
        text: o.text,
        raw_text: o.text,
        source: 'text' as const,
        ai_parsed: true,
        coach_edited: false,
        skill_id: o.skill_id ?? null,
      }));

      await mutate({ table: 'observations', operation: 'insert', data: rows });

      await queryClient.invalidateQueries({
        queryKey: queryKeys.observations.all(activeTeam.id),
      });

      setSavedCount(rows.length);
    } catch (err: any) {
      setError(err.message || 'Failed to save observations');
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageBase64(null);
    setCustomFocus('');
    setAnalyzed(false);
    setObservations([]);
    setImageDescription('');
    setSavedCount(null);
    setError(null);
  };

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Camera className="mb-4 h-12 w-12 text-zinc-600" />
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-1 text-sm text-zinc-500">Select a team to start capturing observations.</p>
      </div>
    );
  }

  // Saved state
  if (savedCount !== null) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Saved!</h2>
        <p className="mt-2 text-zinc-400">
          {savedCount} observation{savedCount !== 1 ? 's' : ''} added from photo.
        </p>
        <div className="mt-6 flex gap-3">
          <Button variant="outline" onClick={reset}>
            <Camera className="h-4 w-4" />
            Snap Another
          </Button>
          <Button onClick={() => router.push('/observations')}>View Observations</Button>
        </div>
      </div>
    );
  }

  const selectedCount = observations.filter((o) => o.selected).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 lg:p-8 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/capture"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-zinc-100">Snap Observation</h1>
          <p className="text-xs text-zinc-500">{activeTeam.name}</p>
        </div>
      </div>

      {/* Photo upload */}
      {!analyzed ? (
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleImageSelect}
            className="hidden"
          />

          {imagePreview ? (
            <Card>
              <CardContent className="p-3">
                <div className="relative overflow-hidden rounded-lg border border-zinc-700">
                  <img
                    src={imagePreview}
                    alt="Practice photo"
                    className="max-h-72 w-full object-contain bg-zinc-900"
                  />
                  <button
                    type="button"
                    onClick={reset}
                    className="absolute right-2 top-2 rounded-full bg-zinc-900/80 p-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
                    aria-label="Remove photo"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Optional focus note */}
                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-zinc-400">
                    Focus (optional)
                  </label>
                  <input
                    type="text"
                    value={customFocus}
                    onChange={(e) => setCustomFocus(e.target.value)}
                    placeholder="e.g. defensive positioning, footwork..."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500/60 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
                  />
                </div>

                <Button
                  onClick={analyzePhoto}
                  disabled={analyzing}
                  className="mt-3 w-full bg-orange-500 hover:bg-orange-600 text-white"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Analyze Photo
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 p-10 text-center transition-colors hover:border-orange-500/50 hover:bg-zinc-900/50 touch-manipulation active:scale-[0.98]"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800">
                <Camera className="h-7 w-7 text-zinc-500" />
              </div>
              <div>
                <p className="font-semibold text-zinc-300">Tap to take or upload a photo</p>
                <p className="mt-1 text-xs text-zinc-500">
                  AI will analyze player technique and positioning
                </p>
              </div>
            </button>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      ) : (
        /* Results */
        <div className="space-y-4">
          {/* Photo thumbnail + description */}
          <Card>
            <CardContent className="p-3">
              <div className="flex gap-3">
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Practice photo"
                    className="h-16 w-16 shrink-0 rounded-lg border border-zinc-700 object-cover bg-zinc-900"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                    <span className="text-xs font-medium text-orange-400">AI Analysis</span>
                  </div>
                  {imageDescription && (
                    <p className="mt-1 text-xs text-zinc-400 leading-relaxed">{imageDescription}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observation chips */}
          {observations.length > 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-300">
                  Select observations to save
                </p>
                <span className="text-xs text-zinc-500">
                  {selectedCount}/{observations.length} selected
                </span>
              </div>

              {observations.map((obs) => {
                const sent = SENTIMENT_CONFIG[obs.sentiment];
                return (
                  <button
                    key={obs.id}
                    onClick={() => toggleObservation(obs.id)}
                    className={`w-full rounded-xl border p-3 text-left transition-all touch-manipulation active:scale-[0.99] ${
                      obs.selected
                        ? 'border-orange-500/40 bg-orange-500/10'
                        : 'border-zinc-800 bg-zinc-900/50 opacity-50'
                    }`}
                    aria-pressed={obs.selected}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
                          obs.selected
                            ? 'border-orange-500 bg-orange-500'
                            : 'border-zinc-600 bg-transparent'
                        }`}
                      >
                        {obs.selected && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-zinc-300">
                            {obs.isTeam ? 'Team' : obs.player_name}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${sent.cls}`}>
                            {sent.icon}
                            {sent.label}
                          </span>
                          <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            {obs.category}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-300 leading-relaxed">{obs.text}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center p-6 text-center">
                <ImageIcon className="mb-2 h-8 w-8 text-zinc-600" />
                <p className="text-sm text-zinc-400">No observations could be generated from this photo.</p>
                <p className="mt-1 text-xs text-zinc-500">Try a clearer photo or add a focus note.</p>
              </CardContent>
            </Card>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={reset}
              className="flex-1"
            >
              <RotateCcw className="h-4 w-4" />
              New Photo
            </Button>
            <Button
              onClick={saveObservations}
              disabled={saving || selectedCount === 0}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-40"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save {selectedCount > 0 ? `${selectedCount} ` : ''}
                  {selectedCount === 1 ? 'Observation' : 'Observations'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
