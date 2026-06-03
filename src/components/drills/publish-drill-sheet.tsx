'use client';

import { useEffect, useState } from 'react';
import { Loader2, Check, X, Share2 } from 'lucide-react';

// Ticket 0064 — the publish-this-drill sheet that opens off the
// existing drill detail page (`src/app/(dashboard)/drills/[drillId]`).
// Tap "Publish" → the sheet opens → caption textarea + Publish button
// → POST /api/drill-shares/create → success state with the public URL +
// Copy button. If the drill is already published, the sheet opens with
// the existing caption pre-filled + an Unpublish action.
//
// data-testid="publish-drill-sheet" on the container per LESSONS#0056 /
// #0082; data-share-url={publicUrl} on the Copy button so the e2e +
// component test can read the URL the sheet forwards. The trigger
// button (the one INSIDE the drill detail page next to the favorite
// heart) is the parent's responsibility.
//
// Voice: clipboard, not consumer-SaaS. The placeholder instructs
// POSITIVELY ("what made this drill work for your team?") rather than
// enumerating the banned tokens (LESSONS#0023 — the prompt itself must
// never list the words it's avoiding, or the voice scan would trip).

interface PublishDrillSheetProps {
  open: boolean;
  onClose: () => void;
  drillId: string;
  drillName: string;
  // The existing share row for this drill (if any) — pre-fills the
  // caption and switches the sheet into edit-existing mode.
  existingShare: {
    token: string;
    caption: string | null;
    isActive: boolean;
  } | null;
}

interface PublishResponse {
  token?: string;
  url?: string;
  caption?: string | null;
  alreadyPublished?: boolean;
  reason?: string;
  field?: string;
  error?: string;
}

const APP_ORIGIN =
  typeof window !== 'undefined' ? window.location.origin : '';

const MAX_CAPTION = 240;

export function PublishDrillSheet({
  open,
  onClose,
  drillId,
  drillName,
  existingShare,
}: PublishDrillSheetProps) {
  const [caption, setCaption] = useState('');
  // `published` is true once the sheet has a token to surface; `mutating`
  // is true during the in-flight publish/unpublish (separates "render the
  // success branch" from "spin a loader on the button"). TS narrows `phase`
  // inside the success-branch render, so the in-flight bool stays in its
  // own state to avoid an impossible-overlap warning.
  const [phase, setPhase] = useState<'idle' | 'published' | 'error'>('idle');
  const [mutating, setMutating] = useState<null | 'publishing' | 'unpublishing'>(null);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setCaption(existingShare?.caption ?? '');
      setPublicToken(existingShare && existingShare.isActive ? existingShare.token : null);
      setPhase(existingShare && existingShare.isActive ? 'published' : 'idle');
      setMutating(null);
      setErrorMessage(null);
      setCopied(false);
    }
  }, [open, existingShare]);

  if (!open) return null;

  const publicUrl = publicToken
    ? `${APP_ORIGIN}/drill/${publicToken}`
    : '';

  async function publish() {
    setMutating('publishing');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/drill-shares/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drillId,
          caption: caption.trim().length > 0 ? caption.trim() : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as PublishResponse;
      if (!res.ok) {
        if (res.status === 400 && body.reason === 'voice') {
          throw new Error(
            'Try rephrasing the caption like a clipboard note — short and concrete.',
          );
        }
        throw new Error(body.error || 'Could not publish drill');
      }
      setPublicToken(body.token ?? null);
      setPhase('published');
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not publish drill');
      setPhase('error');
    } finally {
      setMutating(null);
    }
  }

  async function unpublish() {
    if (!publicToken) return;
    setMutating('unpublishing');
    setErrorMessage(null);
    try {
      const res = await fetch(
        `/api/drill-shares/${encodeURIComponent(publicToken)}/unpublish`,
        { method: 'POST' },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not unpublish drill');
      }
      setPublicToken(null);
      setPhase('idle');
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not unpublish drill');
      setPhase('error');
    } finally {
      setMutating(null);
    }
  }

  async function copyLink() {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may be unavailable (Safari permissions etc.) — fall
      // back to a hidden input + execCommand, but a failed copy is silent.
    }
  }

  const captionLength = caption.length;
  const captionTooLong = captionLength > MAX_CAPTION;

  return (
    <div
      data-testid="publish-drill-sheet"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Publish this drill"
    >
      <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-zinc-950 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-zinc-100">
              Publish this drill
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400 truncate">{drillName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {phase === 'published' && publicToken ? (
          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-green-500/30 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              <p className="flex items-center gap-2">
                <Check className="h-4 w-4" />
                <span>Published. Share the link.</span>
              </p>
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <p
                data-testid="publish-drill-public-url"
                className="break-all text-xs text-zinc-400"
              >
                {publicUrl}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyLink}
                data-testid="publish-drill-copy-button"
                data-share-url={publicUrl}
                aria-label="Copy link"
                className="inline-flex flex-1 min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] touch-manipulation transition-all"
              >
                <Share2 className="h-4 w-4" />
                {copied ? 'Link copied' : 'Copy link'}
              </button>
              <button
                type="button"
                onClick={unpublish}
                disabled={mutating === 'unpublishing'}
                data-testid="publish-drill-unpublish-button"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-60 transition-all"
              >
                {mutating === 'unpublishing' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Unpublish
              </button>
            </div>
            {/* Allow editing the caption from the success state — POST the
                same create endpoint, which UPDATEs the existing row. */}
            <details className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2">
              <summary className="cursor-pointer text-xs text-zinc-400">
                Edit caption
              </summary>
              <div className="mt-2 space-y-2">
                <textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="what made this drill work for your team?"
                  maxLength={MAX_CAPTION + 1}
                  rows={3}
                  data-testid="publish-drill-caption"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                />
                <div className="flex items-center justify-between">
                  <span
                    className={
                      'text-[11px] ' +
                      (captionTooLong ? 'text-red-400' : 'text-zinc-500')
                    }
                  >
                    {captionLength} / {MAX_CAPTION}
                  </span>
                  <button
                    type="button"
                    onClick={publish}
                    disabled={mutating === 'publishing' || captionTooLong}
                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
                  >
                    Save caption
                  </button>
                </div>
              </div>
            </details>
            {errorMessage && (
              <p className="text-xs text-red-400" role="alert">
                {errorMessage}
              </p>
            )}
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs text-zinc-400">
                Caption (optional, 240 chars)
              </span>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="what made this drill work for your team?"
                maxLength={MAX_CAPTION + 1}
                rows={3}
                data-testid="publish-drill-caption"
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
              />
            </label>
            <div className="flex items-center justify-between">
              <span
                className={
                  'text-[11px] ' +
                  (captionTooLong ? 'text-red-400' : 'text-zinc-500')
                }
              >
                {captionLength} / {MAX_CAPTION}
              </span>
              <button
                type="button"
                onClick={publish}
                disabled={mutating === 'publishing' || captionTooLong}
                data-testid="publish-drill-publish-button"
                aria-label="Publish drill"
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 touch-manipulation transition-all"
              >
                {mutating === 'publishing' ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Publishing…
                  </>
                ) : (
                  'Publish'
                )}
              </button>
            </div>
            {errorMessage && (
              <p className="text-xs text-red-400" role="alert">
                {errorMessage}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
