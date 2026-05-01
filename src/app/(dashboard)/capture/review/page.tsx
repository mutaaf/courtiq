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
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import { findPlayerByName } from '@/lib/player-match';
import { localDB } from '@/lib/storage/local-db';
import { trackEvent } from '@/lib/analytics';
import type { Sentiment, ObservationSource } from '@/types/database';
import { AIUpgradePrompt } from '@/components/ui/ai-upgrade-prompt';

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

const SKILL_CATEGORIES = [
  'awareness', 'attitude', 'defense', 'dribbling', 'effort',
  'footwork', 'general', 'hustle', 'iq', 'leadership',
  'offense', 'passing', 'rebounding', 'shooting', 'teamwork',
];

export default function ReviewPage() {
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();

  const [observations, setObservations] = useState<ParsedObservation[]>([]);
  const [transcript, setTranscript] = useState('');
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [source, setSource] = useState<ObservationSource>('voice');
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiUpgrade, setAiUpgrade] = useState<{ message: string } | null>(null);
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<Array<{ id: string; name: string }>>([]);
  const [editingPlayerFor, setEditingPlayerFor] = useState<string | null>(null);
  const [editingCategoryFor, setEditingCategoryFor] = useState<string | null>(null);

  const isApiKeyError = (msg: string): boolean => {
    const lower = msg.toLowerCase();
    return lower.includes('api key') || lower.includes('not configured') || lower.includes('no api');
  };

  useEffect(() => {
    let cancelled = false;

    const hydrateFromAI = (data: {
      recording_id?: string | null;
      session_id?: string | null;
      transcript?: string;
      source?: string;
      upgrade?: boolean;
      error?: string;
      unmatched_names?: string[];
      observations?: Array<{
        player_name?: string;
        category?: string;
        sentiment?: Sentiment;
        text?: string;
        skill_id?: string | null;
      }>;
    }) => {
      if (cancelled) return;
      setRecordingId(data.recording_id || null);
      setSessionId(data.session_id || null);
      setTranscript(data.transcript || '');
      setSource(data.source === 'typed' ? 'typed' : 'voice');

      if (data.upgrade && data.error) {
        setAiUpgrade({ message: data.error });
        setLoading(false);
        return;
      }
      if (data.error) setAiError(data.error);
      if (data.unmatched_names?.length) setUnmatchedNames(data.unmatched_names);

      const parsed: ParsedObservation[] = (data.observations || []).map(
        (obs, i) => ({
          id: `obs-${i}-${Date.now()}`,
          player_name: obs.player_name || 'Unknown',
          category: obs.category || 'General',
          sentiment: obs.sentiment || 'neutral',
          text: obs.text || '',
          skill_id: obs.skill_id || null,
          status: 'pending' as const,
        }),
      );
      setObservations(parsed);
    };

    // Path 1: in-flight pending_observations from the live capture / short-form upload flow.
    const raw = sessionStorage.getItem('pending_observations');
    if (raw) {
      try {
        hydrateFromAI(JSON.parse(raw));
      } catch {
        // Malformed data — fall through.
      }
      setLoading(false);
      return;
    }

    // Path 2: long-session pipeline — ?recordingId=<id> handed to us from LongAudioDropzone.
    // The webhook caches segmentation_result on the row, so the common case is a
    // single read with no AI roundtrip.
    const params = new URLSearchParams(window.location.search);
    const ridFromUrl = params.get('recordingId');
    if (ridFromUrl && activeTeam) {
      (async () => {
        try {
          const rec = await query<{
            id: string;
            session_id: string | null;
            raw_transcript: string | null;
            status: string;
            segmentation_result: {
              observations?: Array<{
                player_name?: string;
                category?: string;
                sentiment?: Sentiment;
                text?: string;
                skill_id?: string | null;
              }>;
              unmatched_names?: string[];
              warning?: string;
            } | null;
          } | null>({
            table: 'recordings',
            select: 'id, session_id, raw_transcript, status, segmentation_result',
            filters: { id: ridFromUrl },
            single: true,
          });
          if (cancelled) return;
          if (!rec || !rec.raw_transcript) {
            setError('Transcript not ready yet. Please wait a moment and refresh.');
            setLoading(false);
            return;
          }

          // Fast path — webhook already cached the segmentation.
          if (rec.segmentation_result?.observations) {
            hydrateFromAI({
              recording_id: rec.id,
              session_id: rec.session_id,
              transcript: rec.raw_transcript,
              observations: rec.segmentation_result.observations,
              unmatched_names: rec.segmentation_result.unmatched_names,
              source: 'voice',
            });
            setLoading(false);
            return;
          }

          // Fallback — webhook hit a segmentation error; re-segment client-side.
          const res = await fetch('/api/ai/segment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transcript: rec.raw_transcript,
              teamId: activeTeam.id,
              sessionId: rec.session_id,
            }),
          });
          const seg = await res.json().catch(() => ({}));
          if (cancelled) return;
          if (!res.ok) {
            const msg = seg.error || 'AI processing failed';
            if (seg.upgrade) setAiUpgrade({ message: msg });
            else setAiError(msg);
            setRecordingId(rec.id);
            setSessionId(rec.session_id);
            setTranscript(rec.raw_transcript);
            setLoading(false);
            return;
          }
          hydrateFromAI({
            recording_id: rec.id,
            session_id: rec.session_id,
            transcript: rec.raw_transcript,
            observations: seg.observations,
            unmatched_names: seg.unmatched_names,
            source: 'voice',
          });
          setLoading(false);
        } catch (e) {
          if (cancelled) return;
          console.error('long-session review hydrate failed:', e);
          setError('Failed to load transcript. Please try again.');
          setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }

    setLoading(false);
    return () => { cancelled = true; };
  }, [activeTeam]);

  // Fetch roster so coaches can reassign observations to a different player
  useEffect(() => {
    if (!activeTeam) return;
    query<Array<{ id: string; name: string }>>({
      table: 'players',
      select: 'id, name',
      filters: { team_id: activeTeam.id, is_active: true },
    }).then((players) => {
      if (players) setRoster(players.sort((a, b) => a.name.localeCompare(b.name)));
    });
  }, [activeTeam]);

  const reassignPlayer = (obsId: string, playerName: string) => {
    setObservations((prev) =>
      prev.map((o) => (o.id === obsId ? { ...o, player_name: playerName } : o))
    );
    setEditingPlayerFor(null);
  };

  const reassignCategory = (obsId: string, category: string) => {
    setObservations((prev) =>
      prev.map((o) => (o.id === obsId ? { ...o, category } : o))
    );
    setEditingCategoryFor(null);
  };

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
        session_id: sessionId,
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

      const matchedPlayers = rows.filter((r) => r.player_id !== null).length;
      trackEvent('capture_observations_saved', {
        count: toSave.length,
        matched_to_player: matchedPlayers,
        unmatched: toSave.length - matchedPlayers,
        source,
        from_session: !!sessionId,
      });

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
              sessionId,
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

  // Monthly AI tier limit — show upgrade prompt in place of review content
  if (aiUpgrade) {
    return (
      <div className="mx-auto max-w-lg space-y-6 p-4 lg:p-8 pb-8">
        <Link
          href="/capture"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Capture
        </Link>
        <AIUpgradePrompt
          message={aiUpgrade.message}
          feature="Observation AI Processing"
        />
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
    const savedObs = observations.filter((o) => o.status !== 'discarded');
    const positiveObs = savedObs.filter((o) => o.sentiment === 'positive');
    const needsWorkObs = savedObs.filter((o) => o.sentiment === 'needs-work');
    const uniquePlayers = new Set(savedObs.map((o) => o.player_name)).size;
    const topHighlights = positiveObs.slice(0, 2);

    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-4">
        <Card className="w-full max-w-md border-emerald-500/20">
          <CardContent className="p-6 space-y-5">
            {/* Celebration header */}
            <div className="text-center">
              <div className="mb-3 mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-zinc-100">Nice work, Coach! 🎉</h2>
              <p className="mt-1.5 text-zinc-400">
                {savedCount} observation{savedCount !== 1 ? 's' : ''} saved
                {uniquePlayers > 1 ? ` across ${uniquePlayers} players` : uniquePlayers === 1 ? ` for ${savedObs[0]?.player_name}` : ''}
              </p>
            </div>

            {/* Sentiment summary pills */}
            {savedCount > 0 && (
              <div className="flex justify-center gap-3">
                {positiveObs.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-3 py-1 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="h-3 w-3" />
                    {positiveObs.length} positive
                  </span>
                )}
                {needsWorkObs.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 border border-amber-500/25 px-3 py-1 text-xs font-medium text-amber-300">
                    <AlertCircle className="h-3 w-3" />
                    {needsWorkObs.length} to work on
                  </span>
                )}
              </div>
            )}

            {/* Top highlights */}
            {topHighlights.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Session Highlights
                </p>
                {topHighlights.map((obs, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 rounded-lg border border-emerald-500/15 bg-emerald-500/10 px-3 py-2.5"
                  >
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <p className="text-sm text-zinc-300 leading-snug">
                      <span className="font-semibold text-zinc-100">{obs.player_name}</span>
                      {' — '}
                      <span className="text-zinc-400">{obs.text}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* CTAs */}
            <div className="flex flex-col gap-2.5 pt-1">
              {sessionId ? (
                <>
                  <Button
                    className="w-full"
                    onClick={() => router.push(`/sessions/${sessionId}?fromPractice=1&obsCount=${savedCount ?? 0}&playerCount=${uniquePlayers}`)}
                  >
                    <Sparkles className="h-4 w-4" />
                    AI Debrief &amp; Parent Updates
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/capture?sessionId=${sessionId}`)}
                  >
                    <Mic className="h-4 w-4" />
                    Capture More
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push('/capture')}
                  >
                    <Mic className="h-4 w-4" />
                    Capture More
                  </Button>
                  <Button className="w-full" onClick={() => router.push('/roster')}>
                    View Roster
                  </Button>
                </>
              )}
            </div>

            {!sessionId && savedCount > 0 && (
              <p className="text-center text-xs text-zinc-600">
                Tip: Start a session before practice to unlock AI debrief and parent messages.
              </p>
            )}
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
                <Link href="/roster/add" className="underline hover:text-yellow-300">
                  Roster &rarr; Add Player
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
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Player name — tap to reassign to a different roster player */}
                    {editingPlayerFor === obs.id ? (
                      <select
                        autoFocus
                        className="rounded border border-orange-500/50 bg-zinc-800 px-2 py-0.5 text-sm font-semibold text-zinc-100 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        defaultValue={obs.player_name}
                        onChange={(e) => reassignPlayer(obs.id, e.target.value)}
                        onBlur={() => setEditingPlayerFor(null)}
                      >
                        {roster.map((p) => (
                          <option key={p.id} value={p.name}>{p.name}</option>
                        ))}
                        {!roster.some((p) => p.name === obs.player_name) && (
                          <option value={obs.player_name}>{obs.player_name} (unmatched)</option>
                        )}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => roster.length > 0 && setEditingPlayerFor(obs.id)}
                        className={`font-semibold text-zinc-100 transition-colors ${roster.length > 0 ? 'hover:text-orange-400 active:text-orange-300 cursor-pointer' : 'cursor-default'}`}
                        title={roster.length > 0 ? 'Tap to reassign player' : ''}
                      >
                        {obs.player_name}
                        {roster.length > 0 && (
                          <span className="ml-1 text-[10px] text-zinc-600">▾</span>
                        )}
                      </button>
                    )}

                    {/* Category badge — tap to change skill category */}
                    {editingCategoryFor === obs.id ? (
                      <select
                        autoFocus
                        className="rounded border border-zinc-600 bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        defaultValue={obs.category}
                        onChange={(e) => reassignCategory(obs.id, e.target.value)}
                        onBlur={() => setEditingCategoryFor(null)}
                      >
                        {SKILL_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        {!SKILL_CATEGORIES.includes(obs.category) && (
                          <option value={obs.category}>{obs.category}</option>
                        )}
                      </select>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingCategoryFor(obs.id)}
                        title="Tap to change skill category"
                      >
                        <Badge
                          variant="outline"
                          className="cursor-pointer hover:border-orange-400/60 hover:text-orange-300 transition-colors"
                        >
                          {obs.category}
                        </Badge>
                      </button>
                    )}

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
        <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:bottom-4 flex justify-end">
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
