'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, Loader2, CheckCircle2, Sparkles, AlertCircle, ChevronRight } from 'lucide-react';
import { useVoiceInput } from '@/hooks/use-voice-input';
import { trackEvent } from '@/lib/analytics';

type Phase = 'idle' | 'recording' | 'processing' | 'success' | 'error' | 'unsupported';

interface Observation {
  player_name: string;
  category: string;
  sentiment: string;
  text: string;
}

export default function FirstCapturePage() {
  const router = useRouter();
  const voice = useVoiceInput();
  const [phase, setPhase] = useState<Phase>('idle');
  const [observations, setObservations] = useState<Observation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const startedAtRef = useRef<number | null>(null);

  // Detect support after first render
  useEffect(() => {
    if (!voice.isSupported && phase === 'idle') {
      // Don't flip to 'unsupported' immediately — wait for the support check to settle
      const t = setTimeout(() => {
        if (!voice.isSupported) setPhase('unsupported');
      }, 600);
      return () => clearTimeout(t);
    }
  }, [voice.isSupported, phase]);

  useEffect(() => {
    trackEvent('onboarding_first_capture_viewed');
  }, []);

  async function complete() {
    setFinishing(true);
    try {
      await fetch('/api/auth/complete-onboarding', { method: 'POST' });
    } catch {}
    trackEvent('onboarding_completed', {
      via: 'first_capture',
      had_observation: observations.length > 0,
    });
    router.push('/home');
    router.refresh();
  }

  async function handleStart() {
    setError(null);
    startedAtRef.current = Date.now();
    voice.start();
    setPhase('recording');
    trackEvent('onboarding_first_capture_started');
  }

  async function handleStop() {
    const transcript = voice.stop();
    const durationMs = startedAtRef.current ? Date.now() - startedAtRef.current : 0;

    if (!transcript || transcript.trim().length < 3) {
      setError("We didn't catch that. Try again — speak naturally for 5–10 seconds.");
      setPhase('idle');
      trackEvent('onboarding_first_capture_failed', { reason: 'empty_transcript', duration_ms: durationMs });
      return;
    }

    setPhase('processing');

    try {
      // Find the coach's first team for the segmentation context.
      const teamRes = await fetch('/api/auth/me-team').catch(() => null);
      const teamData = teamRes && teamRes.ok ? await teamRes.json() : null;
      const teamId: string | null = teamData?.teamId ?? null;

      if (!teamId) {
        // No team yet — this shouldn't happen if /onboarding/setup ran. Skip
        // gracefully into the dashboard so the coach isn't blocked.
        setError(null);
        await complete();
        return;
      }

      const res = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, teamId }),
      });

      if (!res.ok) {
        throw new Error('Segmentation failed');
      }

      const data = await res.json();
      const obs: Observation[] = data.observations || [];

      if (obs.length === 0) {
        setError("We heard you, but couldn't pull out a clear observation. Try mentioning a player by name and what they did.");
        setPhase('idle');
        trackEvent('onboarding_first_capture_failed', { reason: 'no_observations', duration_ms: durationMs });
        return;
      }

      setObservations(obs);
      setPhase('success');
      trackEvent('onboarding_first_capture_succeeded', {
        observation_count: obs.length,
        duration_ms: durationMs,
        transcript_chars: transcript.length,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('error');
      trackEvent('onboarding_first_capture_failed', {
        reason: 'api_error',
        duration_ms: durationMs,
      });
    }
  }

  function handleSkip() {
    trackEvent('onboarding_first_capture_skipped');
    complete();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          {/* Headline */}
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-orange-500/10 border border-orange-500/30 px-3 py-1 text-[11px] font-medium text-orange-400">
            <Sparkles className="h-3 w-3" />
            One quick try
          </div>

          {phase === 'success' ? (
            <SuccessView
              observations={observations}
              onContinue={complete}
              loading={finishing}
            />
          ) : (
            <RecordingView
              phase={phase}
              error={error}
              voiceInterim={voice.interimTranscript || voice.transcript}
              onStart={handleStart}
              onStop={handleStop}
              onSkip={handleSkip}
              skipDisabled={finishing}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Recording / idle / error view ─────────────────────────────────────────────

function RecordingView({
  phase,
  error,
  voiceInterim,
  onStart,
  onStop,
  onSkip,
  skipDisabled,
}: {
  phase: Phase;
  error: string | null;
  voiceInterim: string;
  onStart: () => void;
  onStop: () => void;
  onSkip: () => void;
  skipDisabled: boolean;
}) {
  const isRecording = phase === 'recording';
  const isProcessing = phase === 'processing';
  const isUnsupported = phase === 'unsupported';

  return (
    <>
      <h1 className="mt-2 text-2xl font-bold text-zinc-100">Say something about a player.</h1>
      <p className="mt-2 text-sm text-zinc-400 max-w-sm leading-relaxed">
        Try: <em className="text-zinc-300">&ldquo;Sarah&apos;s footwork looked sharp on closeouts today.&rdquo;</em>{' '}
        We&apos;ll segment it into a real observation in a few seconds.
      </p>

      {/* The mic */}
      <button
        type="button"
        onClick={isRecording ? onStop : onStart}
        disabled={isProcessing || isUnsupported}
        aria-label={isRecording ? 'Stop recording' : 'Start recording'}
        className={`mt-8 flex h-32 w-32 items-center justify-center rounded-full border-4 transition-all touch-manipulation disabled:opacity-60 ${
          isRecording
            ? 'border-red-500 bg-red-500/10 ring-8 ring-red-500/20 animate-pulse'
            : 'border-orange-500 bg-orange-500/10 ring-8 ring-orange-500/20 hover:bg-orange-500/20'
        }`}
      >
        {isProcessing ? (
          <Loader2 className="h-12 w-12 text-orange-400 animate-spin" />
        ) : (
          <Mic className={`h-14 w-14 ${isRecording ? 'text-red-400' : 'text-orange-400'}`} />
        )}
      </button>

      <p className="mt-4 text-xs text-zinc-500">
        {isRecording
          ? 'Tap to stop'
          : isProcessing
          ? 'Listening to your observation…'
          : isUnsupported
          ? 'Voice capture not supported on this browser — skip ahead and try it on the Capture tab.'
          : 'Tap to record'}
      </p>

      {/* Live transcript preview */}
      {isRecording && voiceInterim && (
        <div className="mt-4 w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-left">
          <p className="text-xs text-zinc-500 mb-0.5">Hearing…</p>
          <p className="text-sm text-zinc-300 italic line-clamp-3">{voiceInterim}</p>
        </div>
      )}

      {error && (
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-left text-xs text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      <button
        onClick={onSkip}
        disabled={skipDisabled || isProcessing}
        className="mt-8 text-xs text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline disabled:opacity-50"
      >
        Skip — take me to the dashboard
      </button>
    </>
  );
}

// ─── Success view ──────────────────────────────────────────────────────────────

function SuccessView({
  observations,
  onContinue,
  loading,
}: {
  observations: Observation[];
  onContinue: () => void;
  loading: boolean;
}) {
  return (
    <>
      <div className="mt-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30">
        <CheckCircle2 className="h-9 w-9 text-emerald-400" />
      </div>
      <h1 className="mt-4 text-2xl font-bold text-zinc-100">You just made an observation.</h1>
      <p className="mt-2 text-sm text-zinc-400 max-w-sm">
        That&apos;s the entire workflow. Do this during practice and the rest of SportsIQ
        builds on top of it — plans, reports, parent updates.
      </p>

      <div className="mt-6 w-full space-y-2 text-left">
        {observations.slice(0, 3).map((obs, i) => (
          <div
            key={i}
            className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3"
          >
            <div className="flex items-center gap-2 mb-1">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  obs.sentiment === 'positive'
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : obs.sentiment === 'needs-work'
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-zinc-700 text-zinc-300'
                }`}
              >
                {obs.sentiment}
              </span>
              <span className="text-[11px] text-zinc-500">{obs.player_name || 'Team'}</span>
              <span className="text-[11px] text-zinc-600">·</span>
              <span className="text-[11px] text-zinc-500">{obs.category}</span>
            </div>
            <p className="text-sm text-zinc-200">{obs.text}</p>
          </div>
        ))}
        {observations.length > 3 && (
          <p className="text-[11px] text-zinc-500 text-center">
            +{observations.length - 3} more — review them on the Capture tab.
          </p>
        )}
      </div>

      <Button
        size="lg"
        onClick={onContinue}
        disabled={loading}
        className="mt-6 w-full"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        You&apos;re all set
        <ChevronRight className="h-4 w-4" />
      </Button>
    </>
  );
}
