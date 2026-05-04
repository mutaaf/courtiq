'use client';

import * as tus from 'tus-js-client';
import { createClient } from '@/lib/supabase/client';
import { query } from '@/lib/api';

// Supabase Storage tus implementation requires this exact chunk size.
const TUS_CHUNK_SIZE = 6 * 1024 * 1024;

export interface InitParams {
  teamId: string;
  sessionId?: string | null;
  file: File;
  estimatedDurationSec?: number;
}

export interface InitResponse {
  recordingId: string;
  bucket: string;
  storagePath: string;
  uploadEndpoint: string;
}

export interface InitError {
  error: string;
  upgrade?: boolean;
  currentTier?: string;
  maxMinutesPerUpload?: number;
  maxLongSessionsPerMonth?: number;
  status: number;
}

/**
 * Step 1 — Reserve a recording row + storage path. Server-side tier checks happen here.
 */
export async function initRecording(params: InitParams): Promise<InitResponse | InitError> {
  const res = await fetch('/api/voice/recordings/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      teamId: params.teamId,
      sessionId: params.sessionId ?? null,
      fileName: params.file.name,
      mimeType: params.file.type,
      sizeBytes: params.file.size,
      estimatedDurationSec: params.estimatedDurationSec ?? null,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ...(data as object), error: data.error || 'init failed', status: res.status } as InitError;
  }
  return data as InitResponse;
}

export interface UploadParams {
  init: InitResponse;
  file: File;
  onProgress?: (uploaded: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Step 2 — Resumable upload directly to Supabase Storage via tus.
 * Survives network drops; tus stores upload offset in localStorage keyed by fingerprint.
 */
export async function uploadResumable(params: UploadParams): Promise<void> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(params.file, {
      endpoint: params.init.uploadEndpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: TUS_CHUNK_SIZE,
      metadata: {
        bucketName: params.init.bucket,
        objectName: params.init.storagePath,
        contentType: params.file.type || 'application/octet-stream',
        cacheControl: '3600',
      },
      onError(error) {
        reject(error);
      },
      onProgress(bytesUploaded, bytesTotal) {
        params.onProgress?.(bytesUploaded, bytesTotal);
      },
      onSuccess() {
        resolve();
      },
    });

    if (params.signal) {
      params.signal.addEventListener('abort', () => {
        upload.abort().catch(() => {});
        reject(new DOMException('Upload aborted', 'AbortError'));
      });
    }

    // Resume any prior partial upload for the same file before starting fresh.
    upload.findPreviousUploads().then((prev) => {
      if (prev.length > 0) upload.resumeFromPreviousUpload(prev[0]);
      upload.start();
    });
  });
}

export interface FinalizeResponse {
  recordingId: string;
  requestId: string | null;
  status: string;
  alreadySubmitted?: boolean;
}

/**
 * Step 3 — Tell the server the upload is complete. Server submits the file
 * URL to Deepgram for async transcription and returns immediately.
 */
export async function finalizeRecording(recordingId: string): Promise<FinalizeResponse> {
  const res = await fetch(`/api/voice/recordings/${recordingId}/finalize`, {
    method: 'POST',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'finalize failed');
  return data as FinalizeResponse;
}

export type RecordingStage =
  | 'uploading'
  | 'transcribing'
  | 'parsing'
  | 'transcribed'
  | 'parsed'
  | 'failed';

export interface RecordingPollState {
  status: RecordingStage;
  raw_transcript: string | null;
  total_duration_seconds: number | null;
  last_error: string | null;
}

const TERMINAL: RecordingStage[] = ['parsed', 'failed', 'transcribed'];
const SELECT = 'status, raw_transcript, total_duration_seconds, last_error';

async function fetchOnce(recordingId: string): Promise<RecordingPollState | null> {
  return query<RecordingPollState | null>({
    table: 'recordings',
    select: SELECT,
    filters: { id: recordingId },
    single: true,
  });
}

/**
 * Step 4 — Watch a recording until it reaches a terminal state.
 *
 * Subscribes to Postgres changes via Supabase Realtime for instant updates.
 * Falls back to exponential-backoff polling if Realtime is unavailable
 * (e.g. publication missing, websocket blocked, env without Realtime).
 *
 * Always issues one initial fetch on subscribe to catch updates that landed
 * before the channel was joined.
 */
export async function watchRecording(
  recordingId: string,
  options: {
    timeoutMs?: number;
    onUpdate?: (state: RecordingPollState) => void;
    signal?: AbortSignal;
  } = {},
): Promise<RecordingPollState> {
  const { timeoutMs = 30 * 60 * 1000, onUpdate, signal } = options;
  const supabase = createClient();

  return new Promise<RecordingPollState>((resolve, reject) => {
    let settled = false;
    let pollHandle: ReturnType<typeof setTimeout> | null = null;
    let pollDelay = 2000;
    const startedAt = Date.now();

    const cleanup = () => {
      if (pollHandle) clearTimeout(pollHandle);
      supabase.removeChannel(channel).catch(() => {});
    };

    const finish = (state: RecordingPollState) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(state);
    };

    const fail = (e: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(e);
    };

    const onState = (state: RecordingPollState) => {
      onUpdate?.(state);
      if (TERMINAL.includes(state.status)) finish(state);
    };

    if (signal) {
      if (signal.aborted) {
        fail(new DOMException('Watch aborted', 'AbortError'));
        return;
      }
      signal.addEventListener('abort', () => fail(new DOMException('Watch aborted', 'AbortError')));
    }

    const channel = supabase
      .channel(`recording:${recordingId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'recordings', filter: `id=eq.${recordingId}` },
        (payload) => {
          const row = payload.new as Partial<RecordingPollState> | undefined;
          if (row && row.status) onState(row as RecordingPollState);
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Catch any update that landed before subscribe completed.
          fetchOnce(recordingId).then((row) => row && onState(row)).catch(() => {});
        }
      });

    // Backoff poll loop runs in parallel as a safety net — if Realtime delivers
    // first, finish() cancels the timer; if Realtime is broken, polling resolves.
    const tick = async () => {
      if (settled) return;
      if (Date.now() - startedAt > timeoutMs) {
        fail(new Error('Watch timed out'));
        return;
      }
      try {
        const row = await fetchOnce(recordingId);
        if (row) onState(row);
      } catch (e) {
        console.warn('watch poll error:', e);
      }
      pollDelay = Math.min(pollDelay * 1.5, 15000);
      pollHandle = setTimeout(tick, pollDelay);
    };
    pollHandle = setTimeout(tick, pollDelay);
  });
}

/** @deprecated Use watchRecording — uses Realtime when available, polls as fallback. */
export const pollRecordingStatus = watchRecording;
