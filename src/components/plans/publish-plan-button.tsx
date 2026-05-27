'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Share2, Check, Loader2, Copy, X } from 'lucide-react';

interface PublishResponse {
  token: string;
  url: string;
}

interface PublishPlanButtonProps {
  planId: string;
}

// "Publish" one-tap control on a saved practice plan (ticket 0049).
//
// Opens a small sheet, lets the coach add an optional one-line note, and POSTs
// /api/practice-plan-shares/create with the planId. On success the resolved
// /plan/<token> URL renders with a Copy control so the coach can drop it in a
// text. Idempotent on the server — re-tapping Publish reuses the existing
// active token rather than minting a second one.
//
// Voice: clipboard, not consumer-SaaS. No banned tokens (AGENTS.md). Copy is
// written positively per LESSONS#0023: short, factual, no breathless adjectives.
export function PublishPlanButton({ planId }: PublishPlanButtonProps) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { mutateAsync, isPending, isError } = useMutation<PublishResponse>({
    mutationFn: async () => {
      const res = await fetch('/api/practice-plan-shares/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId, note: note.trim() || undefined }),
      });
      if (!res.ok) throw new Error('Failed to publish practice plan');
      return (await res.json()) as PublishResponse;
    },
  });

  function absoluteUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sportsiq.app';
    return `${origin}${path}`;
  }

  async function handlePublish() {
    try {
      const data = await mutateAsync();
      setShareUrl(absoluteUrl(data.url));
    } catch {
      // surfaced via isError below; the sheet stays open so the coach can retry.
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // ignore — fall back to plain selection on browsers without clipboard
    }
  }

  function handleClose() {
    setOpen(false);
    setNote('');
    setShareUrl(null);
    setCopied(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/15 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-500/25 active:scale-95 transition-all touch-manipulation"
        aria-label="Publish"
      >
        <Share2 className="h-3 w-3" aria-hidden="true" />
        Publish
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Publish practice plan"
        >
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-zinc-100">Publish this plan</h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Get a link you can text to another coach. Free for every tier.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="rounded-md p-1 text-zinc-500 hover:text-zinc-300"
                aria-label="Close publish sheet"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!shareUrl && (
              <>
                <label htmlFor="publish-note" className="mb-1.5 block text-xs font-medium text-zinc-300">
                  Note for the other coach (optional)
                </label>
                <textarea
                  id="publish-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={280}
                  rows={3}
                  placeholder="Worked great with our U12s on Tuesday."
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
                />

                <button
                  onClick={handlePublish}
                  disabled={isPending}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] touch-manipulation transition-all disabled:opacity-50"
                  aria-label="Publish this plan"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Publishing…
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      Publish
                    </>
                  )}
                </button>
                {isError && (
                  <p className="mt-2 text-xs text-red-400">Could not publish. Try again.</p>
                )}
              </>
            )}

            {shareUrl && (
              <>
                <p className="text-xs text-zinc-400">Your link:</p>
                <div className="mt-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5">
                  <p className="break-all text-sm text-orange-300">{shareUrl}</p>
                </div>
                <button
                  onClick={handleCopy}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-3 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 active:scale-[0.98] touch-manipulation transition-all"
                  aria-label="Copy link"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-400" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy link
                    </>
                  )}
                </button>
                <p className="mt-3 text-[11px] text-zinc-500">
                  Anyone with this link can clone the plan to their team. You can revoke later from this plan.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
