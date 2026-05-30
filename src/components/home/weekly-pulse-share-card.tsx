'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Share2, Copy, Check, X, MessageSquare } from 'lucide-react';
import { formatWeekHeader } from '@/lib/weekly-pulse-utils';

// Ticket 0057 — the home-card publish surface for the weekly-pulse share.
// One tap opens a sheet showing a preview of the public card, a Copy button
// that fires navigator.clipboard, and an "Edit caption" textarea that
// re-POSTs /api/weekly-pulse/create (idempotent) to update the caption in
// place without minting a new token.
//
// Rendering rules (from the AC):
//   - On a coach with no observations this week, the card renders NULL
//     (silence beats nag — the ticket decision is explicit on this).
//   - When the coach has ALREADY shared this week, the button reads "Copy
//     link" instead of "Share this week" (the preview already includes the
//     existingToken; tapping POSTs /create, which short-circuits to the
//     idempotent reuse branch).
//   - The card is dark-themed zinc-950 with orange accent (the dashboard
//     surface aesthetic, NOT the parent-portal gray/orange — that's only
//     the public /week page).
//
// Mobile-first: 44px tap targets, simple shapes, the preview mirrors the
// public card's content shape (week label · coach first name · session count
// · top categories · focus line) so the publisher trusts what they're sending.

interface WeeklyPulsePreview {
  coachFirstName: string | null;
  teamName: string;
  sportName: string | null;
  ageGroup: string | null;
  isoWeek: string;
  sessionCount: number;
  topCategories: string[];
  focusLine: string | null;
  caption: string | null;
  /** Set when the coach has already shared this ISO week. */
  existingToken: string | null;
}

interface CreateResponse {
  token: string;
  url: string;
}

interface WeeklyPulseShareCardProps {
  teamId: string;
}

export function WeeklyPulseShareCard({ teamId }: WeeklyPulseShareCardProps) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [savingCaption, setSavingCaption] = useState(false);
  const [copied, setCopied] = useState(false);

  // Live preview the home card reads. Returns null on a brand-new coach so
  // the card stays absent until they have something to share.
  const { data: preview, refetch } = useQuery<WeeklyPulsePreview>({
    queryKey: ['weekly-pulse-preview', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/weekly-pulse/preview?teamId=${encodeURIComponent(teamId)}`);
      if (!res.ok) throw new Error('Failed to load preview');
      return res.json();
    },
    staleTime: 5 * 60_000,
    enabled: !!teamId,
  });

  useEffect(() => {
    // If the coach has already shared this week, surface the existing token
    // immediately so the button can read "Copy link" without a roundtrip.
    if (preview?.existingToken) {
      setToken(preview.existingToken);
    }
  }, [preview?.existingToken]);

  // No observations + no sessions this week → silence beats nag.
  if (!preview) return null;
  const hasContent = preview.sessionCount > 0 || preview.topCategories.length > 0;
  if (!hasContent) return null;

  const weekHeader = formatWeekHeader(preview.isoWeek);
  const alreadyShared = !!preview.existingToken || !!token;

  async function ensureToken(): Promise<string | null> {
    if (token) return token;
    const res = await fetch('/api/weekly-pulse/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as CreateResponse;
    setToken(body.token);
    return body.token;
  }

  async function handleShare() {
    setOpen(true);
    await ensureToken();
  }

  async function handleCopy() {
    const t = await ensureToken();
    if (!t) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const url = `${origin}/week/${t}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // No-op: clipboard can fail under user denial; the URL is still visible
      // in the sheet so the publisher can long-press to copy it manually.
    }
  }

  async function handleSaveCaption() {
    if (savingCaption) return;
    setSavingCaption(true);
    try {
      const res = await fetch('/api/weekly-pulse/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, caption: caption.trim() || undefined }),
      });
      if (res.ok) {
        await refetch();
      }
    } finally {
      setSavingCaption(false);
    }
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const publicUrl = token ? `${origin}/week/${token}` : '';

  return (
    <div
      className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-4 space-y-3"
      data-testid="weekly-pulse-share-card"
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
          <Share2 className="h-5 w-5 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Share this week
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            {weekHeader} · {preview.sessionCount} session
            {preview.sessionCount === 1 ? '' : 's'}
            {preview.topCategories.length > 0 ? ` · ${preview.topCategories.join(' + ')}` : ''}
          </p>
          {preview.focusLine && (
            <p className="text-xs text-zinc-400 mt-0.5">Focus: {preview.focusLine}</p>
          )}
        </div>
      </div>

      {/* Action row */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.97] touch-manipulation text-white text-sm font-semibold py-2.5 px-4 transition-all min-h-[44px]"
          data-testid="weekly-pulse-share-button"
          aria-label={alreadyShared ? 'Open share sheet' : 'Share this week with the league'}
        >
          {alreadyShared ? (
            <>
              <Copy className="h-4 w-4" />
              Copy link
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              Share this week
            </>
          )}
        </button>
      </div>

      {/* The sheet — rendered inline, mirroring the public card layout the
          receiver will see. A real bottom-sheet component is overkill for a
          one-tap copy/edit flow; a panel anchored to the card is enough. */}
      {open && (
        <div
          className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-3"
          data-testid="weekly-pulse-sheet"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs uppercase tracking-wider text-zinc-500">Preview</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-zinc-600 hover:text-zinc-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Close share sheet"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* The same content the public page renders, mirrored small so the
              publisher trusts what they're sending. */}
          <div className="rounded-lg bg-zinc-900 p-3 space-y-1.5">
            <p className="text-xs text-zinc-500">
              {weekHeader}
              {preview.coachFirstName ? ` · Coach ${preview.coachFirstName}` : ''}
            </p>
            <p className="text-sm font-semibold text-zinc-100">{preview.teamName}</p>
            {(preview.sportName || preview.ageGroup) && (
              <p className="text-xs text-zinc-400">
                {[preview.sportName, preview.ageGroup].filter(Boolean).join(' · ')}
              </p>
            )}
            {preview.topCategories.length > 0 && (
              <p className="text-xs text-zinc-300">
                Working on: {preview.topCategories.join(', ')}
              </p>
            )}
            {preview.focusLine && (
              <p className="text-xs text-zinc-300">Focus: {preview.focusLine}</p>
            )}
            <p className="text-xs text-zinc-500">
              {preview.sessionCount} session{preview.sessionCount === 1 ? '' : 's'} this week
            </p>
          </div>

          {/* The URL line + Copy button */}
          {publicUrl && (
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={publicUrl}
                className="flex-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-300 font-mono"
                data-testid="weekly-pulse-url"
                aria-label="Public weekly pulse URL"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg border border-zinc-700 hover:border-zinc-600 active:scale-[0.97] touch-manipulation text-zinc-300 text-xs py-1.5 px-3 transition-all min-h-[44px]"
                data-testid="weekly-pulse-copy-button"
                aria-label="Copy weekly pulse link"
              >
                {copied ? <Check className="h-4 w-4 text-emerald-400" /> : 'Copy'}
              </button>
            </div>
          )}

          {/* Edit caption */}
          <div className="space-y-1.5">
            <label
              htmlFor="weekly-pulse-caption"
              className="text-xs uppercase tracking-wider text-zinc-500 flex items-center gap-1"
            >
              <MessageSquare className="h-3 w-3" /> Add a note (optional)
            </label>
            <textarea
              id="weekly-pulse-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value.slice(0, 280))}
              maxLength={280}
              placeholder="anyone want to swap closeout drills?"
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
              rows={2}
              data-testid="weekly-pulse-caption-textarea"
            />
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveCaption}
                disabled={savingCaption}
                className="rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 text-xs py-1.5 px-3 transition-all min-h-[44px]"
                data-testid="weekly-pulse-save-caption-button"
              >
                {savingCaption ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
