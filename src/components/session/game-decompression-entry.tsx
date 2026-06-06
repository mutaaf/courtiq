'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, Mic, Square, RefreshCw, Check } from 'lucide-react';
import { useTier } from '@/hooks/use-tier';
import { UpgradeGate } from '@/components/ui/upgrade-gate';

// Ticket 0069 — the coach-facing post-loss decompression entry. Mounts on
// the session detail page ABOVE the existing 0027 game-recap-card for any
// session whose type is game/scrimmage/tournament AND whose effective
// played-at is within the last 24 hours. ONE big mic button — the coach
// holds the steering wheel with one hand and taps with the other.
//
// Live transcript is the user-feedback path (Web Speech API). The
// persisted ground truth is the same string the coach saw on the
// preview when they tapped Save — the route's voice-scan reads it
// directly (no parallel Gemini upload in v1; the long-session audio
// pipeline is reserved for full-practice recordings).
//
// Voice (AGENTS.md): no banned words ("journey", "amazing", "exciting",
// "elevate", "empower", "synergy", "unlock your potential"). Positive
// instruction only.

interface SessionMini {
  id: string;
  type: 'practice' | 'game' | 'scrimmage' | 'tournament' | 'training';
  date: string;
  start_time: string | null;
  created_at: string;
}

interface Props {
  session: SessionMini;
  /** For testing: inject a deterministic "now". */
  nowMs?: number;
}

type Phase = 'idle' | 'recording' | 'preview' | 'saving' | 'success' | 'error';

interface Recommendation {
  drillName: string;
  setupLines: string[];
  why: string | null;
}

function isGameLikeType(type: string): boolean {
  return type === 'game' || type === 'scrimmage' || type === 'tournament';
}

/** Composes a played-at timestamp from (date, start_time), falls back to
 *  created_at. Mirrors the route's `isWithinDecompressionWindow` so the
 *  UI never opens the sheet when the route would reject it. */
function playedAtMs(session: SessionMini): number | null {
  // Mirror the route util: bare DATE / TIME → UTC composition so the
  // local TZ doesn't flip a "today" game into a "future" UTC timestamp.
  if (session.date) {
    const dt = session.start_time
      ? `${session.date}T${session.start_time}Z`
      : `${session.date}T00:00:00Z`;
    const ms = Date.parse(dt);
    if (!Number.isNaN(ms)) return ms;
  }
  if (session.created_at) {
    const ms = Date.parse(session.created_at);
    if (!Number.isNaN(ms)) return ms;
  }
  return null;
}

function isWithinWindow(session: SessionMini, nowMs: number): boolean {
  const played = playedAtMs(session);
  if (played === null) return false;
  const elapsed = nowMs - played;
  // Mirror the route's window budget (60 minutes future-side skew, 24h
  // past-side budget) so the UI never opens the sheet when the route
  // would reject it.
  if (elapsed < -60 * 60 * 1000) return false;
  return elapsed <= 24 * 60 * 60 * 1000;
}

export function GameDecompressionEntry({ session, nowMs }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const now = nowMs ?? Date.now();

  if (!isGameLikeType(session.type)) return null;
  if (!isWithinWindow(session, now)) return null;

  return (
    <>
      <div className="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
            <Mic className="h-5 w-5 text-orange-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-zinc-100">
              Quick voice note — what hurt?
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Hit record on the drive home. Tuesday&apos;s practice will start with the drill that fits.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="mt-3 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-orange-500/20 active:scale-[0.98]"
          data-testid="decompression-open-btn"
        >
          Record 30 seconds
        </button>
      </div>
      {sheetOpen && (
        <DecompressionSheet
          sessionId={session.id}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </>
  );
}

function DecompressionSheet({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [transcript, setTranscript] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  // Lifted from the Web Speech recognizer — null until the coach taps
  // record. Test mocks override globalThis.webkitSpeechRecognition / .SpeechRecognition.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognizerRef = useRef<any>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { tier } = useTier();
  const isFree = tier === 'free';

  // Hard 60s stop — fire even if the recognizer doesn't auto-stop.
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      try {
        recognizerRef.current?.stop?.();
      } catch {
        /* ignore */
      }
    };
  }, []);

  function startRecognition() {
    setPhase('recording');
    setErrorMsg(null);
    setTranscript('');
    setSeconds(0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = globalThis as any;
    const Recog = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Recog) {
      setPhase('preview');
      return;
    }
    const r = new Recog();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'en-US';
    r.onresult = (event: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => {
      let finalText = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        finalText += result[0].transcript;
      }
      setTranscript(finalText.trim().slice(0, 1200));
    };
    r.onend = () => {
      // Coach stopped (or the recognizer auto-ended). Roll to preview.
      setPhase((p) => (p === 'recording' ? 'preview' : p));
    };
    recognizerRef.current = r;
    try {
      r.start();
    } catch {
      setPhase('preview');
    }

    tickRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= 60) {
          stopRecognition();
          return 60;
        }
        return s + 1;
      });
    }, 1000);
  }

  function stopRecognition() {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    try {
      recognizerRef.current?.stop?.();
    } catch {
      /* ignore */
    }
    setPhase('preview');
  }

  async function handleSave() {
    if (!transcript || transcript.length === 0) {
      setErrorMsg('Say a few words about the loss.');
      return;
    }
    setPhase('saving');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/game-decompression/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          transcript,
          durationSeconds: Math.max(1, Math.min(60, seconds || 1)),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 402) {
        // Free tier — the transcript persisted; the AI step is gated. The
        // success state surfaces the UpgradeGate below.
        setPhase('success');
        setRecommendation(null);
        return;
      }
      if (!res.ok) {
        const reason = (body as { reason?: string }).reason;
        if (reason === 'voice') {
          setErrorMsg('Say it like you would tell your assistant. Short and concrete.');
        } else if (reason === 'window') {
          setErrorMsg('This game is more than 24 hours old.');
        } else if (reason === 'type') {
          setErrorMsg('This works on a game session, not a practice.');
        } else {
          setErrorMsg('Could not save. Try again in a moment.');
        }
        setPhase('error');
        return;
      }
      const rec = (body as { recommendation?: Recommendation | null }).recommendation;
      setRecommendation(rec ?? null);
      setPhase('success');
    } catch {
      setErrorMsg('Network error. Try again in a moment.');
      setPhase('error');
    }
  }

  function handleRerecord() {
    setTranscript('');
    setSeconds(0);
    setRecommendation(null);
    setPhase('idle');
  }

  return (
    <div
      data-testid="decompression-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-zinc-950 p-5 text-zinc-100 sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">What hurt today?</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Tap record, talk for 30 seconds, tap save. The drill picks itself.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
            aria-label="Close"
            data-testid="decompression-close-btn"
          >
            Close
          </button>
        </div>

        {phase === 'idle' && (
          <div className="space-y-4 py-4 text-center">
            <button
              type="button"
              onClick={startRecognition}
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-orange-500 text-white shadow-xl shadow-orange-500/30 active:scale-95"
              aria-label="Start recording"
              data-testid="decompression-record-btn"
            >
              <Mic className="h-10 w-10" />
            </button>
            <p className="text-xs text-zinc-500">Up to 60 seconds. Tap stop when you&apos;re done.</p>
          </div>
        )}

        {phase === 'recording' && (
          <div className="space-y-4 py-2 text-center">
            <button
              type="button"
              onClick={stopRecognition}
              className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-zinc-200 text-zinc-900 shadow-xl active:scale-95"
              aria-label="Stop recording"
              data-testid="decompression-stop-btn"
            >
              <Square className="h-8 w-8 fill-current" />
            </button>
            <p className="text-sm tabular-nums text-orange-300">{seconds}s · listening</p>
            {transcript && (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-left text-xs text-zinc-300">
                {transcript}
              </p>
            )}
          </div>
        )}

        {phase === 'preview' && (
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Your voice note</p>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-3 text-sm text-zinc-200">
              {transcript || <span className="text-zinc-500">No words picked up. Try once more.</span>}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRerecord}
                className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 active:scale-[0.98]"
                data-testid="decompression-rerecord-btn"
              >
                <RefreshCw className="mr-2 inline h-4 w-4" />
                Re-record
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!transcript}
                className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-40"
                data-testid="decompression-save-btn"
              >
                Save it
              </button>
            </div>
            {errorMsg && <p className="text-xs text-amber-400">{errorMsg}</p>}
          </div>
        )}

        {phase === 'saving' && (
          <div className="flex items-center justify-center gap-3 py-8 text-zinc-300">
            <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
            Saving
          </div>
        )}

        {phase === 'success' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-400">
              <Check className="h-5 w-5" />
              <span className="text-sm font-semibold">Saved.</span>
            </div>
            {isFree ? (
              <UpgradeGate feature="feature_game_decompression">
                {/* free tier never reaches this child — the gate renders the
                    upgrade panel since canAccess('feature_game_decompression')
                    is false on free */}
                <div />
              </UpgradeGate>
            ) : recommendation ? (
              <div className="space-y-2 rounded-xl border border-orange-500/30 bg-orange-500/5 p-4">
                <p className="text-xs uppercase tracking-wider text-orange-400">First drill for Tuesday</p>
                <p className="text-sm font-semibold text-zinc-100" data-testid="decompression-recommendation-name">
                  {recommendation.drillName}
                </p>
                {recommendation.setupLines.length > 0 && (
                  <ul className="space-y-0.5 text-xs text-zinc-300">
                    {recommendation.setupLines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )}
                {recommendation.why && (
                  <p className="text-xs italic text-zinc-400">
                    Why this is first today — {recommendation.why}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-zinc-300">
                Your next practice plan will start with the drill that fits this.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100 active:scale-[0.98]"
              data-testid="decompression-got-it-btn"
            >
              Got it
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3">
            <p className="text-sm text-amber-300">{errorMsg ?? 'Could not save. Try again.'}</p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRerecord}
                className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 active:scale-[0.98]"
              >
                Re-record
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="flex-1 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white active:scale-[0.98]"
              >
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
