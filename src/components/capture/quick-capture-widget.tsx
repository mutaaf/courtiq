'use client';

import { useState, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { Mic, X, CheckCircle2, Loader2, AlertCircle, Square, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findPlayerByName } from '@/lib/player-match';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { mutate, query } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';

type WidgetState = 'idle' | 'recording' | 'processing' | 'success' | 'error';

export function QuickCaptureWidget() {
  const pathname = usePathname();
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [widgetState, setWidgetState] = useState<WidgetState>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const transcriptRef = useRef('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const autoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trapRef = useFocusTrap<HTMLDivElement>({
    enabled: isOpen,
    onEscape: () => {
      const busy = widgetState === 'recording' || widgetState === 'processing';
      if (!busy) close();
    },
  });

  const cleanupMedia = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    setWidgetState('idle');
    setLiveTranscript('');
    setErrorMsg(null);
    setSavedCount(0);
    transcriptRef.current = '';
    audioChunksRef.current = [];
  }, []);

  const close = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    cleanupMedia();
    setIsOpen(false);
    resetState();
  }, [cleanupMedia, resetState]);

  const startRecording = useCallback(async () => {
    if (!activeTeam) return;
    resetState();
    transcriptRef.current = '';
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start(1000);

      if (navigator.vibrate) navigator.vibrate(50);

      // Live transcript via Web Speech API
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let final = '';
          let interim = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          const full = final + interim;
          setLiveTranscript(full);
          transcriptRef.current = full;
        };

        recognition.onerror = () => {};

        try {
          recognition.start();
          recognitionRef.current = recognition;
        } catch {}
      }

      setWidgetState('recording');
    } catch (err: any) {
      setWidgetState('error');
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Microphone access denied. Please allow microphone access.'
          : 'Failed to start recording. Check your microphone.'
      );
    }
  }, [activeTeam, resetState]);

  const stopAndProcess = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }

    if (navigator.vibrate) navigator.vibrate([50, 30, 50]);

    setWidgetState('processing');

    const finalTranscript = transcriptRef.current.trim();

    recorder.onstop = async () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      if (!finalTranscript) {
        setWidgetState('error');
        setErrorMsg('No speech detected. Please try again.');
        return;
      }

      if (!activeTeam || !coach) {
        setWidgetState('error');
        setErrorMsg('No active team selected.');
        return;
      }

      try {
        // Segment with AI
        const res = await fetch('/api/ai/segment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transcript: finalTranscript, teamId: activeTeam.id }),
        });

        const data = res.ok ? await res.json() : { observations: [], error: 'AI processing failed' };
        const observations: any[] = data.observations || [];

        if (observations.length === 0) {
          setWidgetState('error');
          setErrorMsg(
            data.error ||
              'No observations found. Try speaking more specifically, e.g. "Marcus showed great passing today."'
          );
          return;
        }

        // Resolve player names to IDs
        const players = await query<
          { id: string; name: string; nickname: string | null; name_variants: string[] | null }[]
        >({
          table: 'players',
          select: 'id, name, nickname, name_variants',
          filters: { team_id: activeTeam.id, is_active: true },
        });

        const findPlayerId = (name: string): string | null =>
          findPlayerByName(name, players ?? []);

        const rows = observations.map((obs) => ({
          team_id: activeTeam.id,
          coach_id: coach.id,
          player_id: findPlayerId(obs.player_name),
          recording_id: null,
          category: obs.category || 'General',
          sentiment: obs.sentiment || 'neutral',
          text: obs.text || '',
          raw_text: obs.text || '',
          source: 'voice' as const,
          ai_parsed: true,
          coach_edited: false,
          skill_id: obs.skill_id || null,
          is_synced: true,
        }));

        await mutate({
          table: 'observations',
          operation: 'insert',
          data: rows,
        });

        await queryClient.invalidateQueries({
          queryKey: queryKeys.observations.all(activeTeam.id),
        });

        setSavedCount(rows.length);
        setWidgetState('success');

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        // Auto-close after 2.5s
        autoCloseTimerRef.current = setTimeout(() => {
          setIsOpen(false);
          resetState();
        }, 2500);
      } catch (err: any) {
        setWidgetState('error');
        setErrorMsg(err.message || 'Failed to save observations.');
      }
    };

    recorder.stop();
  }, [activeTeam, coach, queryClient, resetState]);

  // Don't render on the full capture page or when no team is active
  if (pathname.startsWith('/capture') || !activeTeam) return null;

  const isBusy = widgetState === 'recording' || widgetState === 'processing';

  return (
    <>
      {/* Floating trigger button — hidden when modal is open */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            resetState();
            setIsOpen(true);
          }}
          className={cn(
            'fixed bottom-[5.5rem] right-4 z-40 lg:bottom-6',
            'flex h-12 w-12 items-center justify-center rounded-full',
            'bg-orange-500 shadow-lg shadow-orange-500/25',
            'hover:bg-orange-600 active:scale-95 touch-manipulation transition-transform duration-150',
            'ring-4 ring-orange-500/20'
          )}
          aria-label="Quick Capture observation"
          title="Quick Capture"
        >
          <Zap className="h-5 w-5 text-white" />
        </button>
      )}

      {/* Modal overlay */}
      {isOpen && (
        <div
          ref={trapRef}
          className="fixed inset-0 z-50 flex items-end justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-capture-title"
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={!isBusy ? close : undefined}
          />

          {/* Bottom sheet */}
          <div className="animate-quick-capture-enter relative w-full max-w-md rounded-t-2xl border-t border-zinc-700 bg-zinc-900 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            {/* Handle bar */}
            <div className="absolute left-1/2 top-2 h-1 w-8 -translate-x-1/2 rounded-full bg-zinc-700" />

            {/* Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                <span id="quick-capture-title" className="text-sm font-semibold text-zinc-100">Quick Capture</span>
                {activeTeam && (
                  <span className="text-xs text-zinc-500">· {activeTeam.name}</span>
                )}
              </div>
              {!isBusy && (
                <button
                  type="button"
                  onClick={close}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 transition-colors hover:text-zinc-100"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Idle / Recording */}
            {(widgetState === 'idle' || widgetState === 'recording') && (
              <div className="flex flex-col items-center gap-4 pb-2">
                {/* Big mic / stop button */}
                <button
                  type="button"
                  onClick={widgetState === 'recording' ? stopAndProcess : startRecording}
                  className={cn(
                    'relative flex h-20 w-20 items-center justify-center rounded-full transition-all duration-200',
                    'active:scale-95 touch-manipulation',
                    widgetState === 'recording'
                      ? 'bg-red-500 shadow-[0_0_40px_rgba(239,68,68,0.45)]'
                      : 'bg-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.35)]'
                  )}
                  aria-label={widgetState === 'recording' ? 'Stop recording' : 'Start recording'}
                >
                  {widgetState === 'recording' && (
                    <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-20" />
                  )}
                  {widgetState === 'recording' ? (
                    <Square className="relative z-10 h-7 w-7 text-white" fill="white" />
                  ) : (
                    <Mic className="relative z-10 h-8 w-8 text-white" />
                  )}
                </button>

                <p className="text-sm text-zinc-400">
                  {widgetState === 'recording' ? 'Tap to stop & save' : 'Tap to start recording'}
                </p>

                {/* Live transcript */}
                {liveTranscript && (
                  <div className="w-full rounded-xl bg-zinc-800 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
                      <span className="text-xs text-zinc-500">Live transcript</span>
                    </div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-zinc-300">
                      {liveTranscript}
                    </p>
                  </div>
                )}

                <p className="text-center text-xs text-zinc-600">
                  Observations saved automatically — no review needed
                </p>
              </div>
            )}

            {/* Processing */}
            {widgetState === 'processing' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800">
                  <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-zinc-300">Analyzing with AI…</p>
                  <p className="mt-1 text-xs text-zinc-500">Parsing your observations</p>
                </div>
              </div>
            )}

            {/* Success */}
            {widgetState === 'success' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                  <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-zinc-100">
                    {savedCount} observation{savedCount !== 1 ? 's' : ''} saved!
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">Closing in a moment…</p>
                </div>
              </div>
            )}

            {/* Error */}
            {widgetState === 'error' && (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10">
                  <AlertCircle className="h-7 w-7 text-red-400" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-red-400">{errorMsg}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setWidgetState('idle')}
                  className="rounded-lg bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-700 active:scale-95 touch-manipulation"
                >
                  Try Again
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
