'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Share2, Check } from 'lucide-react';

interface ReferralData {
  code: string | null;
  referralCount: number;
  rewardEarned: boolean;
}

// "Invite your assistant coach" one-tap share button (ticket 0015).
// Fetches the coach's referral code from GET /api/referrals and builds
// /signup?ref=<code>; falls back to the bare app URL when the code is absent
// or the fetch fails. Exposes the exact forwarded URL via data-share-url for
// component and e2e testability (navigator.share renders no <a href>).
export function InviteCoachButton() {
  const [shared, setShared] = useState(false);

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

  const { data } = useQuery<ReferralData | null>({
    queryKey: ['referrals'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/referrals');
        if (!res.ok) return null;
        return (await res.json()) as ReferralData;
      } catch {
        return null;
      }
    },
    retry: false,
    staleTime: 5 * 60_000,
  });

  const shareUrl = data?.code ? `${base}/signup?ref=${data.code}` : base;
  const shareText =
    "I've been using SportsIQ to track player development with my team — it's built for volunteer coaches. Join me!";

  async function handleShare() {
    const shareData = { title: 'SportsIQ — Coaching Intelligence', text: shareText, url: shareUrl };
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

  return (
    <button
      onClick={handleShare}
      data-share-url={shareUrl}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.98] touch-manipulation text-white text-sm font-semibold py-3 px-4 transition-all"
      aria-label="Invite your assistant coach"
    >
      {shared ? (
        <>
          <Check className="h-4 w-4" />
          {'share' in (typeof navigator !== 'undefined' ? navigator : {}) ? 'Shared!' : 'Link copied!'}
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4" />
          Invite your assistant coach
        </>
      )}
    </button>
  );
}
