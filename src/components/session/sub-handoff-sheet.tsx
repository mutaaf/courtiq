'use client';

import { useState } from 'react';
import { Loader2, Copy as CopyIcon, Check } from 'lucide-react';

// Ticket 0067 — the regular coach's sub-handoff sheet on the session
// detail page. Sits above the existing 0029 observer-link button. Three
// include checkboxes (all on by default), one optional sub-name input,
// Generate → Copy. Total interaction the AC targets: 22 seconds.
//
// The copy button exposes `data-share-url={publicUrl}` so the unit test
// AND the e2e can assert the constructed URL without a real <a href>
// (LESSONS#0056 / #0082).
//
// Voice: clipboard, not consumer-SaaS. Positive prompts, no banned words.

interface Props {
  sessionId: string;
  open: boolean;
  onClose: () => void;
}

type Phase = 'idle' | 'loading' | 'success' | 'error';

export function SubHandoffSheet({ sessionId, open, onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [subFirstName, setSubFirstName] = useState('');
  const [includeQueuedDrills, setIncludeQueuedDrills] = useState(true);
  const [includeWeeklyFocus, setIncludeWeeklyFocus] = useState(true);
  const [includeEyesOnPlayers, setIncludeEyesOnPlayers] = useState(true);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  async function handleGenerate() {
    setPhase('loading');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/sub-handoff/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          subFirstName: subFirstName.trim() || undefined,
          includeQueuedDrills,
          includeWeeklyFocus,
          includeEyesOnPlayers,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorMessage(
          body?.reason === 'voice'
            ? 'Pick a simpler name (no marketing words).'
            : body?.error || 'Could not generate the link. Try again.',
        );
        setPhase('error');
        return;
      }
      const body = (await res.json()) as { url?: string };
      setShareUrl(body.url ?? null);
      setPhase('success');
    } catch {
      setErrorMessage('Network error. Try again in a moment.');
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
    <div
      data-testid="sub-handoff-sheet"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-t-2xl bg-zinc-950 p-5 text-zinc-100 sm:rounded-2xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Hand off practice to a sub</h3>
            <p className="mt-1 text-sm text-zinc-400">
              Pick what your sub needs tonight. The link works for 24 hours and
              does not need an account.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-zinc-400 hover:bg-zinc-800"
            aria-label="Close"
            data-testid="sub-handoff-close-btn"
          >
            Close
          </button>
        </div>

        {phase === 'success' && shareUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-zinc-300">
              Link ready. Paste it into your group chat with a one-line note of
              your own.
            </p>
            <div className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs break-all text-zinc-200">
              {shareUrl}
            </div>
            <button
              type="button"
              onClick={handleCopy}
              data-testid="sub-handoff-copy-btn"
              data-share-url={shareUrl}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
            >
              {copied ? <Check className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="text-zinc-300">Sub&apos;s first name (optional)</span>
              <input
                type="text"
                value={subFirstName}
                onChange={(e) => setSubFirstName(e.target.value)}
                maxLength={40}
                placeholder="Mark"
                data-testid="sub-handoff-name-input"
                className="mt-1 block w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100 focus:border-orange-500 focus:outline-none"
              />
            </label>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-300">
                What to include
              </legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeQueuedDrills}
                  onChange={(e) => setIncludeQueuedDrills(e.target.checked)}
                  data-testid="sub-handoff-include-drills"
                  className="mt-1"
                />
                <span>The drills queued for tonight</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeWeeklyFocus}
                  onChange={(e) => setIncludeWeeklyFocus(e.target.checked)}
                  data-testid="sub-handoff-include-focus"
                  className="mt-1"
                />
                <span>What we&apos;re working on this week</span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeEyesOnPlayers}
                  onChange={(e) => setIncludeEyesOnPlayers(e.target.checked)}
                  data-testid="sub-handoff-include-eyes"
                  className="mt-1"
                />
                <span>Two kids to give extra eyes to</span>
              </label>
            </fieldset>

            {phase === 'error' && errorMessage ? (
              <p className="text-sm text-red-400">{errorMessage}</p>
            ) : null}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={phase === 'loading'}
              data-testid="sub-handoff-generate-btn"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400 disabled:opacity-60"
            >
              {phase === 'loading' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              {phase === 'loading' ? 'Generating' : 'Generate link'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
