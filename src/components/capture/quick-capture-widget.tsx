'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Mic, X, CheckCircle2, Loader2, AlertCircle, Square, Zap, Keyboard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { findPlayerByName } from '@/lib/player-match';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { mutate, query } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { useAppStore } from '@/lib/store';
import {
  OBSERVATION_TEMPLATES,
  getTemplatesBySentiment,
  type ObservationTemplate,
} from '@/lib/observation-templates';

type WidgetState = 'idle' | 'recording' | 'processing' | 'success' | 'error';
type WidgetTab = 'voice' | 'templates';
type TemplateStep = 'pick' | 'player' | 'saved';

export function QuickCaptureWidget() {
  const pathname = usePathname();
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();
  const practiceActive = useAppStore((s) => s.practiceActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);

  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<WidgetTab>('voice');

  // ── Voice tab state ──────────────────────────────────────────────────────
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

  // ── Templates tab state ──────────────────────────────────────────────────
  const [templateStep, setTemplateStep] = useState<TemplateStep>('pick');
  const [templateSentiment, setTemplateSentiment] = useState<'positive' | 'needs-work'>('positive');
  const [selectedTemplate, setSelectedTemplate] = useState<ObservationTemplate | null>(null);
  const [roster, setRoster] = useState<{ id: string; name: string }[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSavedCount, setTemplateSavedCount] = useState(0);

  const trapRef = useFocusTrap<HTMLDivElement>({
    enabled: isOpen,
    onEscape: () => {
      const busy = widgetState === 'recording' || widgetState === 'processing' || savingTemplate;
      if (!busy) close();
    },
  });

  // Load roster when templates tab is opened
  useEffect(() => {
    if (!isOpen || activeTab !== 'templates' || !activeTeam?.id || roster.length > 0) return;
    setRosterLoading(true);
    query<{ id: string; name: string }[]>({
      table: 'players',
      select: 'id, name',
      filters: { team_id: activeTeam.id, is_active: true },
    }).then((data) => {
      setRoster(data || []);
      setRosterLoading(false);
    });
  }, [isOpen, activeTab, activeTeam?.id, roster.length]);

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

  const resetVoiceState = useCallback(() => {
    setWidgetState('idle');
    setLiveTranscript('');
    setErrorMsg(null);
    setSavedCount(0);
    transcriptRef.current = '';
    audioChunksRef.current = [];
  }, []);

  const resetTemplateState = useCallback(() => {
    setTemplateStep('pick');
    setSelectedTemplate(null);
    setTemplateSentiment('positive');
    setTemplateSavedCount(0);
  }, []);

  const close = useCallback(() => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    cleanupMedia();
    setIsOpen(false);
    resetVoiceState();
    resetTemplateState();
  }, [cleanupMedia, resetVoiceState, resetTemplateState]);

  // ── Voice: start recording ─────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (!activeTeam) return;
    resetVoiceState();
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
  }, [activeTeam, resetVoiceState]);

  // ── Voice: stop and process ────────────────────────────────────────────
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

        const players = await query<
          { id: string; name: string; nickname: string | null; name_variants: string[] | null }[]
        >({
          table: 'players',
          select: 'id, name, nickname, name_variants',
          filters: { team_id: activeTeam.id, is_active: true },
        });

        const findPlayerId = (name: string): string | null =>
          findPlayerByName(name, players ?? []);

        const sessionId = practiceActive && practiceSessionId ? practiceSessionId : null;
        const rows = observations.map((obs) => ({
          team_id: activeTeam.id,
          coach_id: coach.id,
          player_id: findPlayerId(obs.player_name),
          session_id: sessionId,
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
        if (sessionId) {
          queryClient.invalidateQueries({ queryKey: ['session-obs-count', sessionId] });
        }

        setSavedCount(rows.length);
        setWidgetState('success');

        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        autoCloseTimerRef.current = setTimeout(() => {
          setIsOpen(false);
          resetVoiceState();
        }, 2500);
      } catch (err: any) {
        setWidgetState('error');
        setErrorMsg(err.message || 'Failed to save observations.');
      }
    };

    recorder.stop();
  }, [activeTeam, coach, queryClient, resetVoiceState]);

  // ── Templates: pick a template ────────────────────────────────────────
  function handlePickTemplate(tpl: ObservationTemplate) {
    setSelectedTemplate(tpl);
    setTemplateStep('player');
  }

  // ── Templates: save observation for chosen player ─────────────────────
  async function saveTemplateObservation(playerId: string) {
    if (!selectedTemplate || !activeTeam || !coach) return;
    setSavingTemplate(true);
    const sessionId = practiceActive && practiceSessionId ? practiceSessionId : null;
    try {
      await mutate({
        table: 'observations',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          player_id: playerId,
          session_id: sessionId,
          text: selectedTemplate.text,
          sentiment: selectedTemplate.sentiment,
          category: selectedTemplate.category,
          source: 'template',
          ai_parsed: false,
          coach_edited: false,
          is_synced: true,
        },
      });

      if (navigator.vibrate) navigator.vibrate([80, 40, 80]);

      queryClient.invalidateQueries({ queryKey: queryKeys.observations.all(activeTeam.id) });
      queryClient.invalidateQueries({ queryKey: ['home-stats', activeTeam.id] });
      queryClient.invalidateQueries({ queryKey: ['home-pulse', activeTeam.id] });
      if (sessionId) {
        queryClient.invalidateQueries({ queryKey: ['session-obs-count', sessionId] });
      }

      setTemplateSavedCount((n) => n + 1);
      // Stay on player step so coach can save the same observation for more players
    } catch {
      // fall back to pick so coach can retry
      setTemplateStep('pick');
    } finally {
      setSavingTemplate(false);
    }
  }

  // Don't render on the full capture page or when no team is active
  if (pathname.startsWith('/capture') || !activeTeam) return null;

  const isBusy = widgetState === 'recording' || widgetState === 'processing' || savingTemplate;

  const positiveTemplates = getTemplatesBySentiment('positive');
  const needsWorkTemplates = getTemplatesBySentiment('needs-work');
  const shownTemplates = templateSentiment === 'positive' ? positiveTemplates : needsWorkTemplates;

  return (
    <>
      {/* Floating trigger button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => {
            resetVoiceState();
            resetTemplateState();
            setIsOpen(true);
          }}
          className={cn(
            'fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] right-4 z-40 lg:bottom-6',
            'flex h-11 w-11 lg:h-12 lg:w-12 items-center justify-center rounded-full',
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

          {/* Bottom sheet — raised above tab bar */}
          <div className="animate-quick-capture-enter relative w-full max-w-md rounded-t-2xl border-t border-zinc-700 bg-zinc-900 px-5 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-5 mb-[calc(4rem+env(safe-area-inset-bottom))] lg:mb-0 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {/* Handle bar */}
            <div className="absolute left-1/2 top-2 h-1 w-8 -translate-x-1/2 rounded-full bg-zinc-700" />

            {/* Header */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-orange-500" />
                <span id="quick-capture-title" className="text-sm font-semibold text-zinc-100">
                  Quick Capture
                </span>
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

            {/* Tab switcher */}
            <div className="mb-4 flex rounded-xl bg-zinc-800 p-1">
              <button
                type="button"
                onClick={() => setActiveTab('voice')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors',
                  activeTab === 'voice'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
                aria-pressed={activeTab === 'voice'}
              >
                <Mic className="h-3.5 w-3.5" />
                Voice
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('templates')}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition-colors',
                  activeTab === 'templates'
                    ? 'bg-zinc-700 text-zinc-100'
                    : 'text-zinc-400 hover:text-zinc-200'
                )}
                aria-pressed={activeTab === 'templates'}
              >
                <Keyboard className="h-3.5 w-3.5" />
                Templates
              </button>
            </div>

            {/* ── Voice Tab ─────────────────────────────────────────────── */}
            {activeTab === 'voice' && (
              <>
                {(widgetState === 'idle' || widgetState === 'recording') && (
                  <div className="flex flex-col items-center gap-4 pb-20 lg:pb-2">
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
              </>
            )}

            {/* ── Templates Tab ─────────────────────────────────────────── */}
            {activeTab === 'templates' && (
              <>
                {/* Step 1: pick template */}
                {templateStep === 'pick' && (
                  <div className="flex flex-col gap-3">
                    {/* Sentiment toggle */}
                    <div className="flex rounded-xl bg-zinc-800 p-1">
                      <button
                        type="button"
                        onClick={() => setTemplateSentiment('positive')}
                        className={cn(
                          'flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-medium transition-colors',
                          templateSentiment === 'positive'
                            ? 'bg-emerald-600 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        )}
                        aria-pressed={templateSentiment === 'positive'}
                      >
                        👍 Positive
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplateSentiment('needs-work')}
                        className={cn(
                          'flex flex-1 items-center justify-center rounded-lg py-2 text-xs font-medium transition-colors',
                          templateSentiment === 'needs-work'
                            ? 'bg-amber-600 text-white'
                            : 'text-zinc-400 hover:text-zinc-200'
                        )}
                        aria-pressed={templateSentiment === 'needs-work'}
                      >
                        🔧 Needs Work
                      </button>
                    </div>

                    {/* Template chips */}
                    <div className="grid grid-cols-2 gap-2 pb-20 lg:pb-1">
                      {shownTemplates.map((tpl) => (
                        <button
                          key={tpl.id}
                          type="button"
                          onClick={() => handlePickTemplate(tpl)}
                          className={cn(
                            'flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-colors',
                            'active:scale-[0.97] touch-manipulation',
                            templateSentiment === 'positive'
                              ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60'
                              : 'bg-amber-900/40 text-amber-300 hover:bg-amber-900/60'
                          )}
                        >
                          <span className="shrink-0 text-base leading-none">{tpl.emoji}</span>
                          <span className="leading-snug">{tpl.text}</span>
                        </button>
                      ))}
                    </div>

                    <p className="text-center text-xs text-zinc-600">
                      Tap a template, then pick the player — saved instantly
                    </p>
                  </div>
                )}

                {/* Step 2: pick player */}
                {templateStep === 'player' && (
                  <div className="flex flex-col gap-3">
                    {/* Selected template preview */}
                    {selectedTemplate && (
                      <div className={cn(
                        'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
                        selectedTemplate.sentiment === 'positive'
                          ? 'bg-emerald-900/40 text-emerald-300'
                          : 'bg-amber-900/40 text-amber-300'
                      )}>
                        <span className="text-lg">{selectedTemplate.emoji}</span>
                        <span className="flex-1">{selectedTemplate.text}</span>
                        {templateSavedCount > 0 && (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-600/30 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            <CheckCircle2 className="h-3 w-3" />
                            {templateSavedCount}
                          </span>
                        )}
                      </div>
                    )}

                    <p className="text-xs font-medium text-zinc-400">Who was this for?</p>

                    {rosterLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                      </div>
                    ) : roster.length === 0 ? (
                      <p className="py-3 text-center text-xs text-zinc-500">
                        No active players on roster yet
                      </p>
                    ) : (
                      <div className="grid max-h-52 grid-cols-2 gap-1.5 overflow-y-auto pb-1">
                        {roster.map((player) => (
                          <button
                            key={player.id}
                            type="button"
                            disabled={savingTemplate}
                            onClick={() => saveTemplateObservation(player.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-xl bg-zinc-800 px-3 py-2.5 text-left text-sm font-medium text-zinc-200',
                              'hover:bg-zinc-700 active:scale-[0.97] touch-manipulation transition-colors',
                              savingTemplate && 'pointer-events-none opacity-50'
                            )}
                          >
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">
                              {player.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate">{player.name.split(' ')[0]}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => { setTemplateStep('pick'); setSelectedTemplate(null); setTemplateSavedCount(0); }}
                        className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        ← Back
                      </button>
                      {templateSavedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setTemplateStep('saved')}
                          className="flex items-center gap-1.5 rounded-full border border-emerald-600/40 bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-400 active:scale-95 touch-manipulation"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Done · {templateSavedCount}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Step 3: done confirmation */}
                {templateStep === 'saved' && (
                  <div className="flex flex-col items-center gap-4 py-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                      <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-zinc-100">
                        {templateSavedCount} observation{templateSavedCount !== 1 ? 's' : ''} saved!
                      </p>
                    </div>
                    <div className="flex w-full gap-2">
                      <button
                        type="button"
                        onClick={() => setTemplateStep('player')}
                        className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors active:scale-[0.97] touch-manipulation"
                      >
                        Another player
                      </button>
                      <button
                        type="button"
                        onClick={resetTemplateState}
                        className="flex-1 rounded-xl bg-zinc-800 py-2.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors active:scale-[0.97] touch-manipulation"
                      >
                        New template
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
