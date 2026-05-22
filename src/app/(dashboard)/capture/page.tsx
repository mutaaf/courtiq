'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { mutate, query } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecordingButton } from '@/components/capture/recording-button';
import { AIUsageMeter, type AIUsageStatus } from '@/components/capture/ai-usage-meter';
import { CarryoverStrip } from '@/components/capture/carryover-strip';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Keyboard, Mic, AlertCircle, Sparkles, Upload, FileAudio, Camera, Lock } from 'lucide-react';
import { generateId } from '@/lib/utils';
import { localDB } from '@/lib/storage/local-db';
import Link from 'next/link';
import { QuickTemplates } from '@/components/capture/quick-templates';
import { LongAudioDropzone } from '@/components/voice/LongAudioDropzone';
import { useAppStore } from '@/lib/store';
import { Check } from 'lucide-react';
import { useTier } from '@/hooks/use-tier';
import { trackEvent } from '@/lib/analytics';

type CaptureState = 'idle' | 'recording' | 'processing' | 'error';

function getCapturePlaceholder(sportSlug: string): string {
  switch (sportSlug) {
    case 'soccer':       return 'e.g., Marcus great first touch · Sofia needs work on passing';
    case 'volleyball':   return 'e.g., Marcus great serve · Sofia needs work on setting';
    case 'flag_football':return 'e.g., Marcus sharp route running · Sofia needs work on blocking';
    case 'baseball':     return 'e.g., Marcus good contact at plate · Sofia needs work on fielding';
    case 'lacrosse':     return 'e.g., Marcus quick stick work · Sofia needs work on cradling';
    case 'tennis':       return 'e.g., Marcus consistent groundstrokes · Sofia needs work on net play';
    default:             return 'e.g., Marcus great ball handling · Sofia needs work on spacing';
  }
}

export default function CapturePage() {
  const router = useRouter();
  const { activeTeam, coach, sportSlug } = useActiveTeam();
  const { canAccess } = useTier();
  const canUsePhoto = canAccess('media_upload');

  // URL context params — read client-side to avoid Suspense requirement
  const [urlSessionId, setUrlSessionId] = useState<string | null>(null);
  const [urlPlayerId, setUrlPlayerId] = useState<string | null>(null);
  const [urlPlayerName, setUrlPlayerName] = useState<string | null>(null);
  const [urlLoaded, setUrlLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUrlSessionId(params.get('sessionId'));
    setUrlPlayerId(params.get('playerId') || params.get('player'));
    // `player` param carries the display name when coming from coverage grid
    const playerParam = params.get('player');
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (playerParam && !UUID_RE.test(playerParam)) {
      setUrlPlayerName(playerParam);
      // On mobile (<640px), auto-open the quick note so the coach can type immediately
      if (typeof window !== 'undefined' && window.innerWidth < 640) {
        setShowQuickNote(true);
      }
    }
    setUrlLoaded(true);
  }, []);

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApiKeyError, setIsApiKeyError] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [quickNoteSending, setQuickNoteSending] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'transcribing' | 'editing'>('idle');
  const [uploadTranscript, setUploadTranscript] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [uploadDuration, setUploadDuration] = useState<number | null>(null);
  const [durationWarning, setDurationWarning] = useState<string | null>(null);
  const [longSessionFile, setLongSessionFile] = useState<File | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef('');
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const segmentIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingIdRef = useRef<string>('');
  const segmentCountRef = useRef(0);
  const accumulatedObsRef = useRef<any[]>([]);
  const startTimeRef = useRef<number>(0);
  const [segmentCount, setSegmentCount] = useState(0);
  const [segmentStatus, setSegmentStatus] = useState<string | null>(null);
  const [recoveryData, setRecoveryData] = useState<any>(null);

  const setIsRecording = useAppStore((s) => s.setIsRecording);
  const setGlobalRecordingDuration = useAppStore((s) => s.setRecordingDuration);
  const practiceActive = useAppStore((s) => s.practiceActive);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);

  // Resolve the session ID for photo capture — prefer URL param, fall back to active practice
  const resolvedSessionId = urlSessionId ?? (practiceActive ? practiceSessionId : null);

  // Fetch session metadata when entering capture during an active practice (no URL session param)
  const { data: activePracticeMeta } = useQuery<{ date: string; type: string } | null>({
    queryKey: ['capture-active-session-meta', practiceSessionId],
    queryFn: () =>
      query<{ date: string; type: string }[]>({
        table: 'sessions',
        select: 'date, type',
        filters: { id: practiceSessionId! },
        limit: 1,
      }).then((r) => r?.[0] ?? null),
    enabled: !!practiceSessionId && practiceActive && !urlSessionId,
    staleTime: 10 * 60_000,
  });

  // Best-effort AI usage meter (ticket 0008): surfaces "N of 5 AI notes left this
  // month" for free-tier coaches so the monthly wall stops being a surprise. This
  // is a fire-and-forget read — it never gates capture. On failure/timeout the
  // query resolves undefined and the meter renders nothing; the record button is
  // unaffected. Re-reads on window focus so returning from review reflects a fresh
  // count. NOT a direct Supabase call (AGENTS.md rule 3) — it hits /api/ai/usage.
  const { data: aiUsage } = useQuery<AIUsageStatus | undefined>({
    queryKey: ['ai-usage'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/ai/usage');
        if (!res.ok) return undefined;
        return (await res.json()) as AIUsageStatus;
      } catch {
        return undefined; // degrade silently — capture must never be blocked by this read
      }
    },
    retry: false,
    staleTime: 60_000,
  });

  // Best-effort carryover strip (ticket 0014): surfaces last session's focus phrases
  // above the record button so the coach picks up where they left off. Never gates
  // capture — resolves undefined on any fetch failure and renders nothing.
  const { data: carryover } = useQuery<{ focus: string[] } | undefined>({
    queryKey: ['capture-carryover', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam?.id) return undefined;
      try {
        const res = await fetch(`/api/capture/carryover?teamId=${activeTeam.id}`);
        if (!res.ok) return undefined;
        return (await res.json()) as { focus: string[] };
      } catch {
        return undefined;
      }
    },
    enabled: !!activeTeam?.id,
    retry: false,
    staleTime: 5 * 60_000,
  });

  // Fetch player's recent observations for coaching brief when player is pre-selected
  const since30d = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString(), []);
  const { data: playerRecentObs } = useQuery({
    queryKey: ['capture-player-brief', urlPlayerId],
    queryFn: async () => {
      if (!urlPlayerId) return null;
      const obs = await query<{ id: string; text: string; sentiment: string; category: string | null; created_at: string }[]>({
        table: 'observations',
        select: 'id, text, sentiment, category, created_at',
        filters: { player_id: urlPlayerId, created_at: { op: 'gte', value: since30d } },
        order: { column: 'created_at', ascending: false },
        limit: 10,
      });
      return obs ?? null;
    },
    // Only run when urlPlayerId looks like a UUID (not a plain player name)
    enabled: !!urlPlayerId && urlPlayerId.includes('-') && urlPlayerId.length > 20,
    staleTime: 5 * 60_000,
  });

  // Derive coaching brief from recent observations
  const playerCoachingBrief = useMemo(() => {
    if (!playerRecentObs || playerRecentObs.length === 0) return null;
    const lastObs = playerRecentObs[0];
    // Top needs-work category
    const needsWorkCounts: Record<string, number> = {};
    for (const o of playerRecentObs) {
      if (o.sentiment === 'needs-work' && o.category && o.category !== 'general') {
        needsWorkCounts[o.category] = (needsWorkCounts[o.category] ?? 0) + 1;
      }
    }
    const topNeedsWork = Object.entries(needsWorkCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    // Time label
    const ageMs = Date.now() - new Date(lastObs.created_at).getTime();
    const ageDays = Math.floor(ageMs / 86_400_000);
    const ageLabel = ageDays === 0 ? 'Today' : ageDays === 1 ? 'Yesterday' : `${ageDays}d ago`;
    const obsCount30d = playerRecentObs.length;
    return { lastObs, topNeedsWork, ageLabel, obsCount30d };
  }, [playerRecentObs]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
      if (segmentIntervalRef.current) clearInterval(segmentIntervalRef.current);
    };
  }, []);

  // Check for interrupted recordings on page load
  useEffect(() => {
    const saved = localStorage.getItem('sportsiq-recording');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const startedAt = new Date(data.startedAt);
        const minutesAgo = Math.round((Date.now() - startedAt.getTime()) / 60000);
        if (minutesAgo < 120) {
          setRecoveryData({ ...data, minutesAgo });
        } else {
          localStorage.removeItem('sportsiq-recording');
        }
      } catch {
        localStorage.removeItem('sportsiq-recording');
      }
    }
  }, []);

  const checkApiKeyError = (errorText: string): boolean => {
    const lower = errorText.toLowerCase();
    return lower.includes('api key') || lower.includes('not configured') || lower.includes('no api');
  };

  async function processRecording(audioBlob: Blob, mimeType: string) {
    if (!activeTeam) return;

    try {
      if (!coach) throw new Error('Not authenticated');

      // Use ref for latest transcript (state may be stale in callback closure)
      const currentTranscript = transcriptRef.current;

      // Guard: empty transcript
      if (!currentTranscript || !currentTranscript.trim()) {
        setErrorMessage('No speech was detected. Please try recording again and speak clearly.');
        setCaptureState('error');
        return;
      }

      const recordingId = generateId();
      const storagePath = `recordings/${activeTeam.id}/${recordingId}.webm`;

      // Upload audio via API route (uses service role, bypasses RLS)
      let uploadSucceeded = false;
      try {
        const uploadForm = new FormData();
        uploadForm.append('audio', audioBlob);
        uploadForm.append('path', storagePath);
        const uploadRes = await fetch('/api/voice/upload-audio', { method: 'POST', body: uploadForm });
        if (uploadRes.ok) uploadSucceeded = true;
      } catch {
        // Storage upload failed, continue
      }

      // Create recording record — best-effort, don't block the AI call
      try {
        await mutate({
          table: 'recordings',
          operation: 'insert',
          data: {
            id: recordingId,
            team_id: activeTeam.id,
            coach_id: coach.id,
            storage_path: uploadSucceeded ? storagePath : null,
            mime_type: mimeType,
            file_size_bytes: audioBlob.size,
            status: 'uploaded' as const,
            raw_transcript: currentTranscript || null,
          },
        });
      } catch (e) {
        console.error('Recording insert failed:', e);
      }

      // Send for AI segmentation
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: currentTranscript, teamId: activeTeam.id }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || 'AI processing failed';

        // Monthly tier limit — send to review page with upgrade prompt
        if (response.status === 402 && errData.upgrade) {
          sessionStorage.setItem(
            'pending_observations',
            JSON.stringify({
              recording_id: recordingId,
              session_id: urlSessionId,
              observations: [],
              transcript: currentTranscript,
              unmatched_names: [],
              error: errMsg,
              upgrade: true,
            })
          );
          router.push(`/capture/review?recording_id=${recordingId}`);
          return;
        }

        if (checkApiKeyError(errMsg)) {
          setIsApiKeyError(true);
          setErrorMessage(errMsg);
          setCaptureState('error');
          return;
        }

        // If API isn't ready yet, redirect to review with recording_id
        router.push(`/capture/review?recording_id=${recordingId}`);
        return;
      }

      const result = await response.json();
      setTranscript(result.transcript || currentTranscript);

      // Check for API key error in response
      if (result.error && checkApiKeyError(result.error)) {
        setIsApiKeyError(true);
        setErrorMessage(result.error);
        setCaptureState('error');
        return;
      }

      // Store parsed observations in sessionStorage for review page
      sessionStorage.setItem(
        'pending_observations',
        JSON.stringify({
          recording_id: recordingId,
          session_id: urlSessionId,
          observations: result.observations || [],
          transcript: result.transcript || currentTranscript,
          unmatched_names: result.unmatched_names || [],
          error: result.error || null,
        })
      );

      router.push(`/capture/review?recording_id=${recordingId}`);
    } catch (err: any) {
      const msg = err.message || 'Failed to process recording.';
      if (checkApiKeyError(msg)) {
        setIsApiKeyError(true);
      }
      setErrorMessage(msg);
      setCaptureState('error');
    }
  }

  const startRecording = useCallback(async () => {
    if (!activeTeam) return;
    setErrorMessage(null);
    setIsApiKeyError(false);
    setTranscript('');
    setLiveTranscript('');
    transcriptRef.current = '';
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        // Wait a moment for final speech recognition results to arrive
        await new Promise(resolve => setTimeout(resolve, 500));

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processRecording(audioBlob, mimeType);
      };

      mediaRecorder.start(1000); // Collect data every second
      setCaptureState('recording');
      setIsRecording(true);
      setRecordingDuration(0);
      setDurationWarning(null);
      setSegmentCount(0);
      setSegmentStatus(null);
      startTimeRef.current = Date.now();

      const recId = generateId();
      recordingIdRef.current = recId;
      segmentCountRef.current = 0;
      accumulatedObsRef.current = [];

      trackEvent('capture_record_started', {
        team_id: activeTeam.id,
        from_session: !!urlSessionId,
      });

      // Save recording state to localStorage for recovery
      localStorage.setItem('sportsiq-recording', JSON.stringify({
        recordingId: recId,
        teamId: activeTeam.id,
        startedAt: new Date().toISOString(),
        segmentCount: 0,
      }));

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => {
          const next = prev + 1;
          if (next === 300) {
            setDurationWarning('Recording is over 5 minutes. Processing may take longer.');
          }
          return next;
        });
        setGlobalRecordingDuration((Date.now() - startTimeRef.current) / 1000);
      }, 1000);

      // Auto-save chunks every 30 seconds to IndexedDB
      autoSaveIntervalRef.current = setInterval(async () => {
        if (audioChunksRef.current.length > 0 && localDB) {
          try {
            const partialBlob = new Blob([...audioChunksRef.current], { type: mimeType });
            await localDB.recordings.put({
              localId: recId,
              teamId: activeTeam.id,
              coachId: coach?.id || '',
              sessionId: null,
              audioBlob: partialBlob,
              mimeType,
              duration: (Date.now() - startTimeRef.current) / 1000,
              rawTranscript: transcriptRef.current || null,
              status: 'recording',
              isSynced: false,
              createdAt: new Date().toISOString(),
            });
          } catch {
            // Auto-save failed — non-critical
          }
        }
      }, 30_000);

      // Process transcript segment every 5 minutes
      segmentIntervalRef.current = setInterval(async () => {
        const currentTranscript = transcriptRef.current;
        if (!currentTranscript || currentTranscript.trim().length < 20) return;

        try {
          const res = await fetch('/api/ai/segment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript: currentTranscript, teamId: activeTeam.id }),
          });
          if (res.ok) {
            const data = await res.json();
            const newObs = data.observations || [];
            accumulatedObsRef.current = [...accumulatedObsRef.current, ...newObs];
            segmentCountRef.current += 1;
            setSegmentCount(segmentCountRef.current);
            setSegmentStatus(`Segment ${segmentCountRef.current} analyzed`);

            // Update localStorage
            const saved = localStorage.getItem('sportsiq-recording');
            if (saved) {
              const parsed = JSON.parse(saved);
              parsed.segmentCount = segmentCountRef.current;
              localStorage.setItem('sportsiq-recording', JSON.stringify(parsed));
            }

            // Clear the segment status after 5 seconds
            setTimeout(() => setSegmentStatus(null), 5000);
          }
        } catch {
          // Segment analysis failed — non-critical
        }
      }, 300_000);

      // Request Wake Lock to prevent screen from locking during recording
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch {
        // Wake Lock not available or denied — non-critical
      }

      // Start live transcription via SpeechRecognition if available
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          const fullText = final + interim;
          setLiveTranscript(fullText);
          transcriptRef.current = fullText;
        };

        recognition.onerror = () => {
          // Silently fail - live transcript is a nice-to-have
        };

        try {
          recognition.start();
          (mediaRecorderRef.current as any)._recognition = recognition;
        } catch {
          // SpeechRecognition may not be available
        }
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setErrorMessage('Failed to start recording. Please check your microphone.');
      }
      setCaptureState('error');
    }
  }, [activeTeam, coach, setIsRecording, setGlobalRecordingDuration]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Stop live transcription
      const recognition = (recorder as any)._recognition;
      if (recognition) {
        try { recognition.stop(); } catch {}
      }
      recorder.stop();
      setCaptureState('processing');
      const elapsed = startTimeRef.current ? Math.round((Date.now() - startTimeRef.current) / 1000) : 0;
      trackEvent('capture_record_stopped', {
        duration_s: elapsed,
        segments: segmentCountRef.current,
        transcript_chars: transcriptRef.current.length,
      });
    }

    // Stop duration timer
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    // Clear auto-save and segment intervals
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
    if (segmentIntervalRef.current) {
      clearInterval(segmentIntervalRef.current);
      segmentIntervalRef.current = null;
    }
    localStorage.removeItem('sportsiq-recording');

    // Update global recording state
    setIsRecording(false);
    setGlobalRecordingDuration(0);

    // Release Wake Lock
    if (wakeLockRef.current) {
      wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }, [setIsRecording, setGlobalRecordingDuration]);

  const toggleRecording = useCallback(() => {
    if (captureState === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }, [captureState, startRecording, stopRecording]);

  const handleQuickNote = async () => {
    if (!activeTeam || !quickNote.trim()) return;
    setQuickNoteSending(true);
    setErrorMessage(null);
    setIsApiKeyError(false);

    try {
      // Send quick note for AI segmentation
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: quickNote.trim(), teamId: activeTeam.id }),
      });

      if (response.ok) {
        const result = await response.json();

        // Check for API key error in response
        if (result.error && checkApiKeyError(result.error)) {
          setIsApiKeyError(true);
          setErrorMessage(result.error);
          setQuickNoteSending(false);
          return;
        }

        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: null,
            session_id: urlSessionId,
            observations: result.observations || [],
            transcript: quickNote.trim(),
            unmatched_names: result.unmatched_names || [],
            error: result.error || null,
            source: 'typed',
          })
        );
      } else {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || '';

        if (checkApiKeyError(errMsg)) {
          setIsApiKeyError(true);
          setErrorMessage(errMsg);
          setQuickNoteSending(false);
          return;
        }

        // If API not available, pass raw text
        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: null,
            session_id: urlSessionId,
            observations: [],
            transcript: quickNote.trim(),
            unmatched_names: [],
            error: errMsg || null,
            source: 'typed',
          })
        );
      }

      router.push('/capture/review');
    } catch {
      // Fallback: pass raw text to review
      sessionStorage.setItem(
        'pending_observations',
        JSON.stringify({
          recording_id: null,
          session_id: urlSessionId,
          observations: [],
          transcript: quickNote.trim(),
          unmatched_names: [],
          error: null,
          source: 'typed',
        })
      );
      router.push('/capture/review');
    } finally {
      setQuickNoteSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!activeTeam) return;
    setUploadFile(file);
    setUploadState('transcribing');
    setErrorMessage(null);
    setDurationWarning(null);
    setUploadDuration(null);

    // Detect duration before uploading
    const duration = await detectAudioDuration(file);
    if (duration !== null) {
      setUploadDuration(duration);
      if (duration > 300) {
        setDurationWarning(`Audio is ${formatDuration(duration)} long. Transcription may take a while.`);
      }
    }

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('teamId', activeTeam.id);

      const res = await fetch('/api/voice/upload-transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.tooLong) {
        // Hand off to the resumable long-session upload rather than showing a dead-end error
        setUploadState('idle');
        setUploadFile(null);
        setLongSessionFile(file);
        return;
      }

      if (data.transcript) {
        setUploadTranscript(data.transcript);
        setUploadState('editing');
      } else if (data.needsManualTranscript) {
        setUploadTranscript('');
        setUploadState('editing');
        setErrorMessage('Could not auto-transcribe. Please type or paste the transcript below.');
      } else {
        setErrorMessage(data.error || 'Transcription failed');
        setUploadState('idle');
      }
    } catch {
      setErrorMessage('Failed to upload audio');
      setUploadState('idle');
    }
  };

  const handleUploadSubmit = async () => {
    if (!activeTeam || !uploadTranscript.trim()) return;
    setCaptureState('processing');
    setUploadState('idle');

    try {
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: uploadTranscript.trim(), teamId: activeTeam.id }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || 'AI processing failed';
        if (checkApiKeyError(errMsg)) {
          setIsApiKeyError(true);
          setErrorMessage(errMsg);
          setCaptureState('error');
          return;
        }
        setErrorMessage(errMsg);
        setCaptureState('error');
        return;
      }

      const result = await response.json();

      sessionStorage.setItem(
        'pending_observations',
        JSON.stringify({
          recording_id: null,
          session_id: urlSessionId,
          observations: result.observations || [],
          transcript: uploadTranscript.trim(),
          unmatched_names: result.unmatched_names || [],
          error: result.error || null,
          source: 'voice',
        })
      );

      router.push('/capture/review');
    } catch {
      setErrorMessage('AI processing failed');
      setCaptureState('error');
    }
  };

  /** Format seconds as m:ss or h:mm:ss */
  const formatDuration = (totalSeconds: number): string => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  /** Detect audio file duration using Web Audio API or HTML audio element */
  const detectAudioDuration = useCallback((file: File): Promise<number | null> => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        const duration = isFinite(audio.duration) ? Math.round(audio.duration) : null;
        URL.revokeObjectURL(url);
        resolve(duration);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      audio.src = url;
    });
  }, []);

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Mic className="mb-4 h-12 w-12 text-zinc-600" />
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-1 text-sm text-zinc-500">Select a team to start capturing observations.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center p-4 pb-8 lg:p-8">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Capture</h1>
          <p className="mt-1 text-sm text-zinc-400">{activeTeam.name}</p>
        </div>

        {/* Session context banner — shown when navigated from a session/player-specific link */}
        {urlSessionId && (
          <div className="flex items-center gap-2.5 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-3">
            <span className="text-blue-400 text-sm">📍</span>
            <p className="text-sm text-blue-300">
              {urlPlayerName
                ? <>Capturing for <span className="font-semibold text-blue-200">{urlPlayerName}</span> · linked to session</>
                : 'Observations will be linked to your session'}
            </p>
          </div>
        )}

        {/* Active practice banner — shown when practice is running but no session URL param */}
        {practiceActive && practiceSessionId && !urlSessionId && (
          <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <p className="text-sm text-emerald-300">
              Active practice
              {activePracticeMeta && (
                <> · <span className="font-semibold text-emerald-200">
                  {activePracticeMeta.type.charAt(0).toUpperCase() + activePracticeMeta.type.slice(1)}{' '}·{' '}
                  {new Date(activePracticeMeta.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span></>
              )}
              {' '}— observations will link automatically
            </p>
          </div>
        )}

        {/* No-session nudge — shown when no active practice and no session URL param */}
        {urlLoaded && !urlSessionId && !practiceActive && (
          <div className="flex items-start gap-2.5 rounded-xl border border-zinc-700/50 bg-zinc-900/60 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
            <p className="text-sm text-zinc-400">
              No active session — these observations won&apos;t link to a practice.{' '}
              <Link href="/sessions/new" className="text-orange-400 hover:text-orange-300 underline underline-offset-2 transition-colors">
                Start a session first
              </Link>{' '}
              to enable coverage tracking and AI debrief.
            </p>
          </div>
        )}

        {/* Coaching brief — player context when tapped from practice coverage chips */}
        {urlPlayerId && playerCoachingBrief && (
          <div className="rounded-xl border border-zinc-700/60 bg-zinc-900/60 px-4 py-3 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Coaching Brief</p>
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 text-sm leading-none">
                {playerCoachingBrief.lastObs.sentiment === 'positive' ? '✅' : playerCoachingBrief.lastObs.sentiment === 'needs-work' ? '⚠️' : '·'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm leading-snug ${playerCoachingBrief.lastObs.sentiment === 'positive' ? 'text-emerald-300' : playerCoachingBrief.lastObs.sentiment === 'needs-work' ? 'text-amber-300' : 'text-zinc-300'}`}>
                  {playerCoachingBrief.lastObs.text.length > 72 ? playerCoachingBrief.lastObs.text.slice(0, 72) + '…' : playerCoachingBrief.lastObs.text}
                </p>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  {playerCoachingBrief.ageLabel}
                  <span className="ml-1.5 text-zinc-600">· {playerCoachingBrief.obsCount30d} obs (30d)</span>
                </p>
              </div>
            </div>
            {playerCoachingBrief.topNeedsWork && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-zinc-500">Focus:</span>
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-400 capitalize">
                  {playerCoachingBrief.topNeedsWork.replace(/-/g, ' ')}
                </span>
              </div>
            )}
          </div>
        )}
        {urlPlayerId && playerRecentObs && playerRecentObs.length === 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-zinc-700/40 bg-zinc-900/40 px-4 py-2.5">
            <span className="text-zinc-500 text-xs">🌱</span>
            <p className="text-xs text-zinc-500">First observation for this player — what do you notice?</p>
          </div>
        )}

        {/* Recovery Banner */}
        {recoveryData && captureState === 'idle' && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-amber-300">Unfinished recording</p>
                <p className="text-xs text-zinc-400">
                  Started {recoveryData.minutesAgo}m ago · {recoveryData.segmentCount} segment{recoveryData.segmentCount !== 1 ? 's' : ''} saved
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => {
                  localStorage.removeItem('sportsiq-recording');
                  setRecoveryData(null);
                }}>Dismiss</Button>
                <Button size="sm" onClick={() => {
                  if (accumulatedObsRef.current.length > 0) {
                    sessionStorage.setItem('pending_observations', JSON.stringify({
                      recording_id: recoveryData.recordingId,
                      session_id: urlSessionId,
                      observations: accumulatedObsRef.current,
                      transcript: '',
                      source: 'voice',
                    }));
                    router.push('/capture/review');
                  }
                  localStorage.removeItem('sportsiq-recording');
                  setRecoveryData(null);
                }}>Review</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Recording Area */}
        {captureState !== 'processing' && (
          <div className="flex flex-col items-center gap-3">
            {/* Carryover strip — last session's focus areas (ticket 0014).
                Best-effort: absent when no prior debrief or fetch fails; never gates. */}
            {captureState !== 'recording' && (
              <CarryoverStrip focus={carryover?.focus} />
            )}

            <RecordingButton
              isRecording={captureState === 'recording'}
              onToggle={toggleRecording}
              disabled={false}
            />

            {/* AI usage meter — free-tier "N of 5 AI notes left" (ticket 0008).
                Best-effort: absent for paid tiers and when the read fails; never gates. */}
            {captureState !== 'recording' && <AIUsageMeter usage={aiUsage} />}

            {/* Segment progress during recording */}
            {captureState === 'recording' && segmentCount > 0 && (
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                <span>{segmentCount} segment{segmentCount !== 1 ? 's' : ''} analyzed</span>
              </div>
            )}

            {segmentStatus && (
              <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
                <Check className="h-3.5 w-3.5" />
                {segmentStatus}
              </div>
            )}

            {/* Player focus chip during recording */}
            {captureState === 'recording' && urlPlayerName && (
              <div className="flex items-center gap-2 rounded-full bg-blue-500/15 border border-blue-500/25 px-3 py-1.5 text-xs font-medium text-blue-300">
                <div className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                Capturing for {urlPlayerName}
              </div>
            )}

            {/* Coach guidance during recording */}
            {captureState === 'recording' && (
              <p className="text-xs text-zinc-500 text-center">
                Keep this screen visible during recording · Auto-saves every 30s
              </p>
            )}
          </div>
        )}

        {/* Processing State */}
        {captureState === 'processing' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800">
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
            </div>
            <p className="text-lg font-medium text-zinc-300">Processing...</p>
            <p className="text-sm text-zinc-500">Transcribing and parsing your observations</p>
          </div>
        )}

        {/* Live Transcript */}
        {(captureState === 'recording' || liveTranscript) && (
          <Card>
            <CardContent className="p-5 sm:p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                  <span className="text-sm sm:text-xs font-medium text-zinc-400">Live Transcript</span>
                </div>
                {captureState === 'recording' && (
                  <span className="text-sm sm:text-xs font-mono text-zinc-400">
                    {formatDuration(recordingDuration)}
                  </span>
                )}
              </div>
              {durationWarning && captureState === 'recording' && (
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
                  <p className="text-xs text-amber-400">{durationWarning}</p>
                </div>
              )}
              <p className="min-h-[4rem] text-base sm:text-sm leading-relaxed text-zinc-300">
                {liveTranscript || (
                  <span className="italic text-zinc-600">Listening...</span>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {captureState === 'error' && errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 sm:p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-6 w-6 sm:h-5 sm:w-5 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="text-base sm:text-sm font-semibold text-red-400">
                  {isApiKeyError ? 'AI Not Configured' : 'Recording Error'}
                </p>
                <p className="mt-1.5 text-sm text-red-400/80 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
            {isApiKeyError && (
              <Link
                href="/settings/ai"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500/20 border border-orange-500/30 px-4 py-3 text-sm font-medium text-orange-400 hover:bg-orange-500/30 transition-colors active:scale-[0.98] touch-manipulation"
              >
                <Sparkles className="h-4 w-4" />
                Configure AI Provider
              </Link>
            )}
            {!isApiKeyError && (
              <Button
                variant="outline"
                className="mt-4 w-full h-12 sm:h-10 text-base sm:text-sm"
                onClick={() => { setCaptureState('idle'); setErrorMessage(null); setIsApiKeyError(false); }}
              >
                Try Again
              </Button>
            )}
          </div>
        )}

        {/* Divider */}
        {captureState === 'idle' && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-600">or</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
        )}

        {/* Capture alternatives */}
        {captureState === 'idle' && uploadState === 'idle' && (
          <>
            {/* Mobile: compact text buttons */}
            <div className="flex justify-center gap-6 sm:hidden">
              <button
                type="button"
                onClick={() => setShowQuickNote(true)}
                className="text-sm text-zinc-400 flex items-center gap-1.5 hover:text-zinc-200 active:scale-95 touch-manipulation"
              >
                <Keyboard className="h-4 w-4" /> Type
              </button>
              <label className="text-sm text-zinc-400 flex items-center gap-1.5 hover:text-zinc-200 active:scale-95 touch-manipulation cursor-pointer">
                <Upload className="h-4 w-4" /> Upload
                <input
                  type="file"
                  accept="audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.mov"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <Link
                href={canUsePhoto ? (resolvedSessionId ? `/capture/photo?sessionId=${resolvedSessionId}` : '/capture/photo') : '/settings/upgrade'}
                className="text-sm text-zinc-400 flex items-center gap-1.5 hover:text-zinc-200 active:scale-95 touch-manipulation"
              >
                {canUsePhoto ? <Camera className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                Photo
                {!canUsePhoto && <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-400 bg-teal-500/15 px-1.5 py-0.5 rounded-full">Pro</span>}
              </Link>
            </div>
            {/* Desktop: full card grid */}
            <div className="hidden sm:grid sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setShowQuickNote(true)}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 active:scale-[0.98] touch-manipulation"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                  <Keyboard className="h-6 w-6 text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">Type a note</p>
                  <p className="text-xs text-zinc-500">Quick text observation</p>
                </div>
              </button>
              <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 active:scale-[0.98] touch-manipulation">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                  <Upload className="h-6 w-6 text-purple-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-200">Upload audio</p>
                  <p className="text-xs text-zinc-500">Voice memo or recording</p>
                </div>
                <input
                  type="file"
                  accept="audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.mov"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFileUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <Link
                href={canUsePhoto ? (resolvedSessionId ? `/capture/photo?sessionId=${resolvedSessionId}` : '/capture/photo') : '/settings/upgrade'}
                className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 active:scale-[0.98] touch-manipulation"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  {canUsePhoto ? (
                    <Camera className="h-6 w-6 text-amber-400" />
                  ) : (
                    <Lock className="h-6 w-6 text-amber-400" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-zinc-200">Snap photo</p>
                    {!canUsePhoto && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-400 bg-teal-500/15 px-1.5 py-0.5 rounded-full">Pro</span>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">AI analyzes practice photo</p>
                </div>
              </Link>
            </div>
          </>
        )}

        {/* Upload transcribing state */}
        {uploadState === 'transcribing' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-6">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              <p className="text-sm font-medium text-zinc-300">Transcribing audio...</p>
              <p className="text-xs text-zinc-500">{uploadFile?.name}</p>
              {uploadDuration !== null && (
                <p className="text-xs text-zinc-500">Duration: {formatDuration(uploadDuration)}</p>
              )}
              {durationWarning && (
                <div className="mt-1 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-400" />
                  <p className="text-xs text-amber-400">{durationWarning}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Upload transcript editing */}
        {uploadState === 'editing' && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-zinc-300">Voice Memo Transcript</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setUploadState('idle'); setUploadTranscript(''); setUploadFile(null); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >Cancel</button>
              </div>
              {uploadFile && (
                <p className="text-xs text-zinc-500">{uploadFile.name}</p>
              )}
              <Textarea
                value={uploadTranscript}
                onChange={(e) => setUploadTranscript(e.target.value)}
                placeholder="Edit the transcript if needed, or paste your own..."
                rows={6}
              />
              <p className="text-xs text-zinc-500">Review and edit the transcript, then submit for AI analysis.</p>
              <Button onClick={handleUploadSubmit} disabled={!uploadTranscript.trim()} className="w-full">
                <Sparkles className="h-4 w-4" /> Analyze with AI
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Long Session Upload — shown when a file is too long for quick transcription */}
        {longSessionFile && captureState === 'idle' && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
              <FileAudio className="h-4 w-4 shrink-0 text-amber-400" />
              <p className="text-xs text-amber-300">
                <span className="font-semibold">Recording too long for quick upload.</span>{' '}
                Using resumable upload so nothing gets lost.
              </p>
            </div>
            <LongAudioDropzone
              teamId={activeTeam?.id ?? ''}
              sessionId={urlSessionId}
              initialFile={longSessionFile}
              onCancel={() => setLongSessionFile(null)}
            />
          </div>
        )}

        {/* Quick Note Toggle */}
        {captureState === 'idle' && uploadState === 'idle' && !longSessionFile && (
          <>
            {!showQuickNote ? (
              <div className="hidden">
                {/* Buttons moved to combined row above */}
              </div>
            ) : (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-300">Quick Note</span>
                      {urlPlayerName && (
                        <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-medium text-blue-300">
                          {urlPlayerName}
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { setShowQuickNote(false); setQuickNote(''); }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder={urlPlayerName ? `What did ${urlPlayerName} do?` : getCapturePlaceholder(sportSlug)}
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && quickNote.trim()) handleQuickNote();
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={handleQuickNote}
                      disabled={!quickNote.trim() || quickNoteSending}
                      aria-label="Submit note"
                    >
                      {quickNoteSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-600">
                    AI will parse your note into individual player observations.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* Quick Templates — one-tap observations, shown in idle state */}
        {captureState === 'idle' && uploadState === 'idle' && coach && (
          <>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-xs text-zinc-600">or use templates</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <QuickTemplates
              teamId={activeTeam.id}
              coachId={coach.id}
              sessionId={urlSessionId}
              preselectPlayerId={urlPlayerId}
              sportSlug={sportSlug}
            />
          </>
        )}
      </div>
    </div>
  );
}
