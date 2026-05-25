'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Share2, Check, Loader2 } from 'lucide-react';

interface RecapCardResponse {
  token: string;
  url: string;
}

// "Share this recap" one-tap control (ticket 0027).
//
// Lives on a generated game recap. POSTs /api/recap-card/create with the recap's
// planId (the dedicated authed route — never direct Supabase, AGENTS.md rule 3) to
// mint a public /recap/<token> link, then shares it via navigator.share /
// clipboard so the coach can paste it into the team group chat on the drive home.
//
// The exact URL is exposed on data-share-url because navigator.share renders no
// <a href> (docs/LESSONS.md 2026-05-21), so the link stays assertable in tests.
export function RecapShareButton({ planId }: { planId: string }) {
  const [shared, setShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const shareText = "Here's our game recap.";

  const { mutateAsync, isPending } = useMutation<RecapCardResponse>({
    mutationFn: async () => {
      const res = await fetch('/api/recap-card/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId }),
      });
      if (!res.ok) throw new Error('Failed to create recap card');
      return (await res.json()) as RecapCardResponse;
    },
  });

  function absoluteUrl(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sportsiq.app';
    return `${origin}${path}`;
  }

  async function handleShare() {
    let url = shareUrl;
    if (!url) {
      try {
        const data = await mutateAsync();
        url = absoluteUrl(data.url);
        setShareUrl(url);
      } catch {
        return; // surfaced as a no-op; the button simply doesn't share
      }
    }
    if (!url) return;

    const shareData = { title: 'Game recap — SportsIQ', text: shareText, url };
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 3000);
        return;
      } catch {
        // User cancelled — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText}\n\n${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <button
      onClick={handleShare}
      data-share-url={shareUrl ?? undefined}
      disabled={isPending}
      className="flex items-center gap-1.5 rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-medium text-rose-300 hover:bg-rose-500/25 active:scale-95 transition-all touch-manipulation disabled:opacity-40"
      aria-label="Share this recap"
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : shared ? (
        <Check className="h-3 w-3 text-emerald-400" />
      ) : (
        <Share2 className="h-3 w-3" />
      )}
      {isPending ? 'Preparing…' : shared ? 'Link ready!' : 'Share this recap'}
    </button>
  );
}
