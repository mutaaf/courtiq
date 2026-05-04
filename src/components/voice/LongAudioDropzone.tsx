'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Upload, FileAudio, AlertCircle, CheckCircle2, Sparkles, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { trackEvent } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import {
  initRecording,
  uploadResumable,
  finalizeRecording,
  watchRecording,
  type InitError,
  type RecordingPollState,
} from '@/lib/voice/long-session-upload';

type Stage = 'idle' | 'uploading' | 'transcribing' | 'done' | 'error';

interface Props {
  teamId: string;
  sessionId?: string | null;
  /** Called after the transcript is saved. By default, navigates to /capture/review. */
  onComplete?: (recordingId: string) => void;
  /** Optional file to start uploading immediately on mount (skips the picker). */
  initialFile?: File | null;
  /** Called when the user dismisses/cancels — useful when rendered as a step in another flow. */
  onCancel?: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function detectAudioDuration(file: File): Promise<number | null> {
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
}

function LongAudioDropzoneInner({ teamId, sessionId, onComplete, initialFile, onCancel }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [progress, setProgress] = useState(0); // 0-1 upload progress
  const [error, setError] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [pollState, setPollState] = useState<RecordingPollState | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStage('idle');
    setFile(null);
    setDuration(null);
    setProgress(0);
    setError(null);
    setRecordingId(null);
    setPollState(null);
    onCancel?.();
  }, [onCancel]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const startedForInitialRef = useRef(false);

  const handleFile = useCallback(async (picked: File) => {
    setError(null);
    setFile(picked);
    const dur = await detectAudioDuration(picked);
    setDuration(dur);

    setStage('uploading');
    const ctl = new AbortController();
    abortRef.current = ctl;

    try {
      const init = await initRecording({
        teamId,
        sessionId,
        file: picked,
        estimatedDurationSec: dur ?? undefined,
      });

      if ('error' in init) {
        const initErr = init as InitError;
        setStage('error');
        setError(initErr.error);
        if (initErr.upgrade) {
          trackEvent('long_session_upload_blocked', { reason: 'tier', tier: initErr.currentTier });
        }
        return;
      }

      setRecordingId(init.recordingId);
      trackEvent('long_session_upload_started', {
        recording_id: init.recordingId,
        size_bytes: picked.size,
        duration_sec: dur,
      });

      await uploadResumable({
        init,
        file: picked,
        signal: ctl.signal,
        onProgress: (uploaded, total) => {
          setProgress(total > 0 ? uploaded / total : 0);
        },
      });

      setStage('transcribing');
      await finalizeRecording(init.recordingId);

      const finalState = await watchRecording(init.recordingId, {
        signal: ctl.signal,
        onUpdate: (s) => setPollState(s),
      });

      if (finalState.status === 'failed') {
        setStage('error');
        setError(finalState.last_error || 'Transcription failed');
        return;
      }

      setStage('done');
      trackEvent('long_session_upload_completed', {
        recording_id: init.recordingId,
        status: finalState.status,
        duration_sec: finalState.total_duration_seconds,
      });
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
      console.error('long-session upload error:', e);
      setStage('error');
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  }, [teamId, sessionId]);

  // Auto-start when an initialFile is provided.
  useEffect(() => {
    if (initialFile && !startedForInitialRef.current) {
      startedForInitialRef.current = true;
      handleFile(initialFile);
    }
  }, [initialFile, handleFile]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  const onPicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) handleFile(picked);
    e.target.value = '';
  }, [handleFile]);

  const goReview = useCallback(() => {
    if (!recordingId) return;
    if (onComplete) {
      onComplete(recordingId);
    } else {
      const params = new URLSearchParams({ recordingId });
      if (sessionId) params.set('sessionId', sessionId);
      router.push(`/capture/review?${params.toString()}`);
    }
  }, [recordingId, sessionId, onComplete, router]);

  const stageLabel = useMemo(() => {
    switch (stage) {
      case 'uploading': return 'Uploading';
      case 'transcribing': return pollState?.status === 'transcribing'
        ? `Transcribing${duration ? ` your ${formatDuration(duration)} recording` : ''}`
        : 'Finishing up';
      case 'done': return 'Transcript ready';
      case 'error': return 'Something went wrong';
      default: return '';
    }
  }, [stage, pollState, duration]);

  // ---------- Render ----------

  if (stage === 'idle') {
    return (
      <Card className={cn(
        'border-dashed transition-colors',
        dragOver ? 'border-orange-500 bg-orange-500/5' : 'border-zinc-700',
      )}>
        <CardContent
          className="flex flex-col items-center gap-3 p-8 text-center"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/15 ring-1 ring-orange-500/30">
            <Upload className="h-6 w-6 text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-100">Upload a long voice memo</p>
            <p className="mt-1 text-xs text-zinc-400">
              Drop an audio file or pick one — m4a, mp3, wav, webm. Up to 4 hours.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-1"
          >
            Choose file
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.mov,.aac,.flac"
            className="hidden"
            onChange={onPicked}
          />
          <p className="text-[11px] text-zinc-500">
            We&apos;ll transcribe in the background — close the tab if you want, the result will be
            waiting on your next visit.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'uploading') {
    const pct = Math.round(progress * 100);
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <FileAudio className="h-4 w-4 text-orange-400" />
            <p className="flex-1 truncate text-sm font-medium text-zinc-100">{file?.name}</p>
            <button onClick={reset} className="text-zinc-500 hover:text-zinc-300" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">{stageLabel}</span>
              <span className="font-mono text-zinc-300">{pct}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>{file ? formatBytes(file.size) : ''}</span>
              {duration && <span>{formatDuration(duration)} of audio</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'transcribing') {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <FileAudio className="h-4 w-4 text-orange-400" />
            <p className="flex-1 truncate text-sm font-medium text-zinc-100">{file?.name}</p>
            <button onClick={reset} className="text-zinc-500 hover:text-zinc-300" aria-label="Cancel">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3 rounded-lg bg-zinc-900/60 px-3 py-3 ring-1 ring-zinc-800">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-orange-400" />
            <div className="text-xs text-zinc-300">
              <p className="font-medium">{stageLabel}…</p>
              <p className="text-zinc-500">
                Usually 1–3 minutes. You can close this tab — we&apos;ll keep going.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (stage === 'done') {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            <p className="text-sm font-semibold text-zinc-100">Transcript ready</p>
          </div>
          <p className="text-xs text-zinc-400">
            {pollState?.total_duration_seconds
              ? `Transcribed ${formatDuration(pollState.total_duration_seconds)} of audio. `
              : ''}
            Review and confirm the AI-extracted observations.
          </p>
          <div className="flex gap-2">
            <Button onClick={goReview} className="flex-1">
              <Sparkles className="h-4 w-4" /> Review observations
            </Button>
            <Button variant="ghost" onClick={reset}>
              Upload another
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // error
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start gap-2">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
          <div className="flex-1">
            <p className="text-sm font-medium text-zinc-100">Upload failed</p>
            <p className="mt-1 text-xs text-zinc-400">{error}</p>
          </div>
        </div>
        <Button variant="outline" onClick={reset} className="w-full">
          Try again
        </Button>
      </CardContent>
    </Card>
  );
}

export function LongAudioDropzone(props: Props) {
  return (
    <UpgradeGate feature="long_session_audio" featureLabel="Long-Session Voice Memos">
      <LongAudioDropzoneInner {...props} />
    </UpgradeGate>
  );
}
