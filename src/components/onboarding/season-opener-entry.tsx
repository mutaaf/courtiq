'use client';

import { useState } from 'react';
import { Check, Copy as CopyIcon, Loader2, Share2 } from 'lucide-react';

// Ticket 0068 — the season-opener entry point.
//
// One orange button ("Share your season opener") that opens a sheet with
// ONE textarea (the focus line, 80-char max), a "Make my season opener"
// button, and a success state showing the public URL + a Copy button
// carrying `data-share-url` per LESSONS#0056 / #0082 (so vitest + the
// Playwright e2e can assert the constructed URL without a real <a href>).
//
// Voice: clipboard, not consumer-SaaS. Positive prompts only; no banned
// words enumerated in the label or the textarea placeholder (LESSONS#0023).
// The voice-scan rejection text is a single plain line.

interface Props {
  teamId: string;
}

type Phase = 'idle' | 'sheet' | 'loading' | 'success' | 'error';

export function SeasonOpenerEntry({ teamId }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [focusLine, setFocusLine] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function openSheet() {
    setPhase('sheet');
    setErrorMessage(null);
  }

  function closeSheet() {
    setPhase('idle');
    setShareUrl(null);
    setFocusLine('');
    setErrorMessage(null);
    setCopied(false);
  }

  async function handleMake() {
    if (focusLine.trim().length === 0) {
      setErrorMessage('what are you starting the season on?');
      return;
    }
    setPhase('loading');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/season-opener/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          focusLine: focusLine.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.reason === 'voice') {
          setErrorMessage(
            'write it like a text to a friend — keep it short and concrete',
          );
        } else if (typeof body?.error === 'string') {
          setErrorMessage(body.error);
        } else {
          setErrorMessage('could not make the link — try once more.');
        }
        setPhase('error');
        return;
      }
      const body = (await res.json()) as { url?: string };
      setShareUrl(body.url ?? null);
      setPhase('success');
    } catch {
      setErrorMessage('network hiccup — try once more.');
      setPhase('error');
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard?.writeText?.(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* swallow — the URL is still on the button via data-share-url */
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        data-testid="season-opener-entry-btn"
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 active:scale-[0.98] touch-manipulation"
      >
        <Share2 className="h-4 w-4" />
        Share your season opener with parents
      </button>

      {(phase === 'sheet' ||
        phase === 'loading' ||
        phase === 'success' ||
        phase === 'error') && (
        <div
          data-testid="season-opener-sheet"
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
        >
          <div className="w-full max-w-md rounded-t-2xl bg-zinc-950 p-5 text-zinc-100 sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Your season opener</h3>
                <p className="mt-1 text-sm text-zinc-400">
                  One line on what you&apos;re starting the season on. The
                  parents see this on day 1.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
                aria-label="Close"
                data-testid="season-opener-close-btn"
              >
                Close
              </button>
            </div>

            {phase === 'success' && shareUrl ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-300">
                  Link ready. Paste it into your team group chat with a one-line
                  hello of your own.
                </p>
                <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs break-all text-zinc-200">
                  {shareUrl}
                </div>
                <button
                  type="button"
                  onClick={handleCopy}
                  data-testid="season-opener-copy-btn"
                  data-share-url={shareUrl}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <CopyIcon className="h-4 w-4" />
                  )}
                  {copied ? 'Copied' : 'Copy link'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <label className="block text-sm">
                  <span className="text-zinc-300">
                    What you&apos;re starting the season on
                  </span>
                  <textarea
                    value={focusLine}
                    onChange={(e) => setFocusLine(e.target.value)}
                    maxLength={80}
                    rows={3}
                    placeholder="what are you starting the season on?"
                    data-testid="season-opener-focus-input"
                    className="mt-1 block w-full resize-none rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
                  />
                  <span className="mt-1 block text-right text-xs text-zinc-500">
                    {focusLine.length}/80
                  </span>
                </label>

                {phase === 'error' && errorMessage ? (
                  <p className="text-sm text-red-400" role="alert">
                    {errorMessage}
                  </p>
                ) : null}

                <button
                  type="button"
                  onClick={handleMake}
                  disabled={phase === 'loading'}
                  data-testid="season-opener-make-btn"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-60"
                >
                  {phase === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {phase === 'loading' ? 'Making' : 'Make my season opener'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
