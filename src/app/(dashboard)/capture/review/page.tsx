'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  Check,
  X,
  Pencil,
  Save,
  Loader2,
  CheckCircle2,
  CloudOff,
  Mic,
  Keyboard,
  AlertCircle,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { findPlayerByName } from '@/lib/player-match';
import { localDB } from '@/lib/storage/local-db';
import type { Sentiment, ObservationSource } from '@/types/database';

interface ParsedObservation {
  id: string;
  player_name: string;
  category: string;
  sentiment: Sentiment;
  text: string;
  skill_id?: string | null;
  status: 'pending' | 'confirmed' | 'editing' | 'discarded';
  editText?: string;
}

const sentimentVariant: Record<Sentiment, 'success' | 'destructive' | 'secondary'> = {
  positive: 'success',
  'needs-work': 'destructive',
  neutral: 'secondary',
};

const sentimentLabel: Record<Sentiment, string> = {
  positive: 'Positive',
  'needs-work': 'Needs Work',
  neutral: 'Neutral',
};

export default function ReviewPage() {
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();

  const [observations, setObservations] = useState<ParsedObservation[]>([]);
  const [transcript, setTranscript] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [source, setSource] = useState<ObservationSource>('voice');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const isApiKeyError = (msg: string): boolean => {
    const lower = msg.toLowerCase();
    return lower.includes('api key') || lower.includes('not configured') || lower.includes('no api');
  };

  useEffect(() => {
    // Load pending observations from sessionStorage
    const raw = sessionStorage.getItem('pending_observations');
    if (raw) {
      try {
        const data = JSON.parse(raw);
        setRecordingId(data.recording_id || null);
        setTranscript(data.transcript || '');
        setSource(data.source === 'typed' ? 'typed' : 'voice');

        // Read error field
        if (data.error) {
          setAiError(data.error);
        }

        // Read unmatched_names field
        if (data.unmatched_names && Array.isArray(data.unmatched_names) && data.unmatched_names.length > 0) {
          setUnmatchedNames(data.unmatched_names);
        }

        const parsed: ParsedObservation[] = (data.observations || []).map(
          (obs: any, i: number) => ({
            id: `obs-${i}-${Date.now()}`,
            player_name: obs.player_name || 'Unknown',
            category: obs.category || 'General',
            sentiment: obs.sentiment || 'neutral',
            text: obs.text || '',
            skill_id: obs.skill_id || null,
            status: 'pending' as const,
          })
        );
        setObservations(parsed);
      } catch {
        // Malformed data
      }
    }
    setLoading(false);
  }, []);

  const confirmObservation = (id: string) => {
    setObservations((prev) =>
      prev.map((obs) => (obs.id === id ? { ...obs, status: 'confirmed' } : obs))
    );
  };

  const discardObservation = (id: string) => {
    setObservations((prev) =>
      prev.map((obs) => (obs.id === id ? { ...obs, status: 'discarded' } : obs))
    );
  };

  const startEditing = (id: string) => {
    setObservations((prev) =>
      prev.map((obs) =>
        obs.id === id ? { ...obs, status: 'editing', editText: obs.text } : obs
      )
    );
  };

  const saveEdit = (id: string) => {
    setObservations((prev) =>
      prev.map((obs) =>
        obs.id === id
          ? { ...obs, text: obs.editText || obs.text, status: 'confirmed', editText: undefined }
          : obs
      )
    );
  };

  const cancelEdit = (id: string) => {
    setObservations((prev) =>
      prev.map((obs) =>
        obs.id === id ? { ...obs, status: 'pending', editText: undefined } : obs
      )
    );
  };

  const updateEditText = (id: string, text: string) => {
    setObservations((prev) =>
      prev.map((obs) => (obs.id === id ? { ...obs, editText: text } : obs))
    );
  };

  const updateSentiment = (id: string, sentiment: Sentiment) => {
    setObservations((prev) =>
      prev.map((obs) => (obs.id === id ? { ...obs, sentiment } : obs))
    );
  };

  const confirmAll = () => {
    setObservations((prev) =>
      prev.map((obs) =>
        obs.status === 'pending' ? { ...obs, status: 'confirmed' } : obs
      )
    );
  };

  const handleSaveAll = async () => {
    if (!activeTeam) return;

    const toSave = observations.filter(
      (obs) => obs.status === 'confirmed' || obs.status === 'pending'
    );

    if (toSave.length === 0) {
      setError('No observations to save. Confirm at least one observation.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (!coach) throw new Error('Not authenticated');

      // Resolve player names to player IDs
      const players = await query<{ id: string; name: string; nickname: string | null; name_variants: string[] | null }[]>({
        table: 'players',
        select: 'id, name, nickname, name_variants',
        filters: { team_id: activeTeam.id, is_active: true },
      });

      const findPlayerId = (name: string): string | null =>
        findPlayerByName(name, players ?? []);

      const rows = toSave.map((obs) => ({
        team_id: activeTeam.id,
        coach_id: coach.id,
        player_id: findPlayerId(obs.player_name),
        recording_id: recordingId,
        category: obs.category,
        sentiment: obs.sentiment,
        text: obs.text,
        raw_text: obs.text,
        source,
        ai_parsed: true,
        coach_edited: obs.status === 'confirmed',
        skill_id: obs.skill_id || null,
        is_synced: true,
      }));

      await mutate({
        table: 'observations',
        operation: 'insert',
        data: rows,
      });

      // Update recording status if applicable
      if (recordingId) {
        await mutate({
          table: 'recordings',
          operation: 'update',
          data: { status: 'reviewed' },
          filters: { id: recordingId },
        });
      }

      // Invalidate relevant queries
      await queryClient.invalidateQueries({
        queryKey: queryKeys.observations.all(activeTeam.id),
      });

      // Clean up sessionStorage
      sessionStorage.removeItem('pending_observations');

      setSavedCount(toSave.length);
    } catch (err: any) {
      // If offline, fall back to local IndexedDB so the coach doesn't lose work.
      // The sync engine will push these to the server when connectivity returns.
      if (!navigator.onLine && localDB && coach) {
        try {
          // Re-resolve players from whatever we have (may be empty array offline)
          const cachedPlayers = await query<{ id: string; name: string; nickname: string | null; name_variants: string[] | null }[]>({
            table: 'players',
            select: 'id, name, nickname, name_variants',
            filters: { team_id: activeTeam.id, is_active: true },
          }).catch(() => []);

          for (const obs of toSave) {
            await localDB.observations.add({
              localId: crypto.randomUUID(),
              playerId: findPlayerByName(obs.player_name, cachedPlayers ?? []),
              teamId: activeTeam.id,
              coachId: coach.id,
              sessionId: null,
              recordingId,
              category: obs.category,
              sentiment: obs.sentiment,
              text: obs.text,
              rawText: obs.text,
              source,
              aiParsed: true,
              skillId: obs.skill_id || null,
              result: null,
              isSynced: false,
              syncedAt: null,
              createdAt: new Date().toISOString(),
            });
          }

          // Register BackgroundSync so observations upload the moment network returns
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            await (reg as any).sync?.register('sync-observations').catch(() => {});
          }

          sessionStorage.removeItem('pending_observations');
          setSavedOffline(true);
          setSavedCount(toSave.length);
        } catch {
          setError('Failed to save observations locally. Please try again.');
        }
      } else {
        setError(err.message || 'Failed to save observations.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  // Offline success state
  if (savedCount !== null && savedOffline) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
        <Card className="max-w-md border-amber-500/30">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/20">
              <CloudOff className="h-8 w-8 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Saved Locally</h2>
            <p className="mt-2 text-zinc-400">
              {savedCount} observation{savedCount !== 1 ? 's' : ''} saved to your device.
              They&apos;ll sync automatically when you&apos;re back online.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => router.push('/capture')}>
                <Mic className="h-4 w-4" />
                Capture More
              </Button>
              <Button onClick={() => router.push('/home')}>Go Home</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Online success state
  if (savedCount !== null) {
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
              <CheckCircle2 className="h-8 w-8 text-emerald-400" />
            </div>
            <h2 className="text-xl font-bold text-zinc-100">Observations Saved</h2>
            <p className="mt-2 text-zinc-400">
              {savedCount} observation{savedCount !== 1 ? 's' : ''} saved successfully.
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="outline" onClick={() => router.push('/capture')}>
                <Mic className="h-4 w-4" />
                Capture More
              </Button>
              <Button onClick={() => router.push('/roster')}>View Roster</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const activeObs = observations.filter((obs) => obs.status !== 'discarded');
  const confirmedCount = observations.filter(
    (obs) => obs.status === 'confirmed'
  ).length;
  const pendingCount = observations.filter((obs) => obs.status === 'pending').length;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8 pb-8">
      {/* Back link */}
      <Link
        href="/capture"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Capture
      </Link>

      {/* AI Error Banner */}
      {aiError && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">AI Processing Error</p>
              <p className="mt-1 text-sm text-red-400/80">{aiError}</p>
              {isApiKeyError(aiError) && (
                <Link
                  href="/settings/ai"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-orange-500/20 border border-orange-500/30 px-3 py-1.5 text-sm font-medium text-orange-400 hover:bg-orange-500/30 transition-colors"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Configure AI Provider
                </Link>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Unmatched Names Warning */}
      {unmatchedNames.length > 0 && (
        <Card className="border-yellow-500/30 bg-yellow-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Unmatched Player Names</p>
              <p className="mt-1 text-sm text-yellow-400/80">
                These names weren&apos;t matched to your roster:{' '}
                <span className="font-medium">{unmatchedNames.join(', ')}</span>.
                You can add them as players in{' '}
                <Link href="/settings/sport" className="underline hover:text-yellow-300">
                  Settings &rarr; Roster
                </Link>.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100">Review Observations</h1>
          <p className="text-sm text-zinc-400">
            {activeObs.length} observation{activeObs.length !== 1 ? 's' : ''} parsed
            {source === 'typed' && (
              <span className="ml-2 inline-flex items-center gap-1">
                <Keyboard className="h-3 w-3" /> from note
              </span>
            )}
          </p>
        </div>
        {pendingCount > 0 && (
          <Button variant="ghost" size="sm" onClick={confirmAll}>
            <Check className="h-4 w-4" />
            Confirm All
          </Button>
        )}
      </div>

      {/* Transcript */}
      {transcript && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              {source === 'voice' ? (
                <Mic className="h-4 w-4 text-zinc-500" />
              ) : (
                <Keyboard className="h-4 w-4 text-zinc-500" />
              )}
              {source === 'voice' ? 'Transcript' : 'Original Note'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-zinc-400">{transcript}</p>
          </CardContent>
        </Card>
      )}

      {/* Observation Cards */}
      {observations.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <p className="text-zinc-400">
              No observations were parsed. Try recording again with more specific feedback.
            </p>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() => router.push('/capture')}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Capture
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {observations.map((obs) => {
            if (obs.status === 'discarded') return null;

            return (
              <Card
                key={obs.id}
                className={
                  obs.status === 'confirmed'
                    ? 'border-emerald-500/30 bg-emerald-500/5'
                    : undefined
                }
              >
                <CardContent className="p-4">
                  {/* Player & Category */}
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">{obs.player_name}</span>
                    <Badge variant="outline">{obs.category}</Badge>
                    <button
                      type="button"
                      onClick={() => {
                        const sentiments: Sentiment[] = ['positive', 'needs-work', 'neutral'];
                        const currentIdx = sentiments.indexOf(obs.sentiment);
                        updateSentiment(
                          obs.id,
                          sentiments[(currentIdx + 1) % sentiments.length]
                        );
                      }}
                    >
                      <Badge variant={sentimentVariant[obs.sentiment]}>
                        {sentimentLabel[obs.sentiment]}
                      </Badge>
                    </button>
                    {obs.status === 'confirmed' && (
                      <Check className="ml-auto h-4 w-4 text-emerald-400" />
                    )}
                  </div>

                  {/* Text / Edit */}
                  {obs.status === 'editing' ? (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        value={obs.editText || ''}
                        onChange={(e) => updateEditText(obs.id, e.target.value)}
                        rows={3}
                      />
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => cancelEdit(obs.id)}
                        >
                          Cancel
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(obs.id)}>
                          <Save className="h-3 w-3" />
                          Save
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-300">{obs.text}</p>
                  )}

                  {/* Actions */}
                  {obs.status !== 'editing' && (
                    <div className="mt-3 flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(obs.id)}
                        className="text-zinc-400"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                      {obs.status !== 'confirmed' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => confirmObservation(obs.id)}
                          className="text-emerald-400"
                        >
                          <Check className="h-3 w-3" />
                          Confirm
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => discardObservation(obs.id)}
                        className="text-red-400"
                      >
                        <X className="h-3 w-3" />
                        Discard
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Save All */}
      {activeObs.length > 0 && (
        <div className="sticky bottom-4 flex justify-end">
          <Button size="lg" onClick={handleSaveAll} disabled={saving} className="shadow-xl">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save {activeObs.length} Observation{activeObs.length !== 1 ? 's' : ''}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
