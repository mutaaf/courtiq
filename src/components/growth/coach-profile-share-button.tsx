'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { UserRound, Check, Loader2 } from 'lucide-react';

interface CoachCardResponse {
  token: string;
  url: string;
}

// "Share my coaching profile" one-tap control (ticket 0026).
//
// POSTs /api/coach-card/create (the dedicated authed route — never direct
// Supabase, AGENTS.md rule 3) to mint-or-reuse the coach's public profile token,
// then shares the resulting /coach/<token> link via navigator.share / clipboard.
// The route is reuse-or-create, so repeated taps return the same stable link.
//
// The exact URL is exposed on data-share-url because navigator.share renders no
// <a href> (docs/LESSONS.md 2026-05-21), so the link stays assertable in tests.
export function CoachProfileShareButton() {
  const [shared, setShared] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const shareText = 'Here is how I coach on SportsIQ.';

  const { mutateAsync, isPending } = useMutation<CoachCardResponse>({
    mutationFn: async () => {
      const res = await fetch('/api/coach-card/create', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to create coach card');
      return (await res.json()) as CoachCardResponse;
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

    const shareData = { title: 'My coaching profile — SportsIQ', text: shareText, url };
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
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.98] touch-manipulation text-white text-sm font-semibold py-3 px-4 transition-all disabled:opacity-60"
      aria-label="Share my coaching profile"
    >
      {isPending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Preparing link…
        </>
      ) : shared ? (
        <>
          <Check className="h-4 w-4" />
          {'share' in (typeof navigator !== 'undefined' ? navigator : {}) ? 'Shared!' : 'Link copied!'}
        </>
      ) : (
        <>
          <UserRound className="h-4 w-4" />
          Share my coaching profile
        </>
      )}
    </button>
  );
}
