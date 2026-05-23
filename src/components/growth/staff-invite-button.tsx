'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, Check, Building2 } from 'lucide-react';

interface OrgInviteData {
  url: string | null;
}

// "Bring your coaching staff" one-tap share control (ticket 0024).
//
// Fetches the program director's single org-scoped staff-invite link from
// GET /api/org/invite (via the client query() pattern — never direct Supabase,
// AGENTS.md rule 3) and exposes it via copy / navigator.share. The link sends
// every coach who follows it to the branded /org/<slug>?invite=staff page, and
// they sign up attached to the program.
//
// The exact URL is exposed on data-share-url because navigator.share renders no
// <a href> (docs/LESSONS.md 2026-05-21). When the coach has no org slug the
// route returns { url: null }; we render a "create your program first" hint
// instead of a broken share button (this is an ungated growth surface — gated on
// whether the coach HAS an org, not on tier, per ticket 0024).
export function StaffInviteButton() {
  const [shared, setShared] = useState(false);

  const { data } = useQuery<OrgInviteData>({
    queryKey: ['org-invite'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/org/invite');
        if (!res.ok) return { url: null };
        return (await res.json()) as OrgInviteData;
      } catch {
        // A failed fetch is treated as "no link yet" (show the hint), never a crash.
        return { url: null };
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const shareUrl = data?.url ?? null;
  const shareText = 'Join our program on SportsIQ — one place for the whole coaching staff.';

  async function handleShare() {
    if (!shareUrl) return;
    const shareData = { title: 'SportsIQ — Join our program', text: shareText, url: shareUrl };
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
      await navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`);
      setShared(true);
      setTimeout(() => setShared(false), 3000);
    } catch {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
    }
  }

  // No org slug → no link to share yet. Surface a hint, not a dead button.
  if (data && shareUrl === null) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        <Building2 className="h-5 w-5 shrink-0 text-zinc-500" />
        <span>Create your program first to invite your coaching staff.</span>
      </div>
    );
  }

  return (
    <button
      onClick={handleShare}
      data-share-url={shareUrl ?? undefined}
      disabled={!shareUrl}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.98] touch-manipulation text-white text-sm font-semibold py-3 px-4 transition-all disabled:opacity-60"
      aria-label="Bring your coaching staff"
    >
      {shared ? (
        <>
          <Check className="h-4 w-4" />
          {'share' in (typeof navigator !== 'undefined' ? navigator : {}) ? 'Shared!' : 'Link copied!'}
        </>
      ) : (
        <>
          <Users className="h-4 w-4" />
          Bring your coaching staff
        </>
      )}
    </button>
  );
}
