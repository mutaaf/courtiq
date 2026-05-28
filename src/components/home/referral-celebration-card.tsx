'use client';

// Ticket 0047 — home-feed referral-conversion celebration card.
//
// Fires only when GET /api/referrals/celebration returns show:true. On view,
// POSTs /api/referrals/celebration/seen exactly once so subsequent renders
// return show:false until the next conversion. Tapping "Invite another coach"
// opens the SAME share sheet the InviteCoachCard surfaces today, via the
// shared openInviteShareSheet primitive in @/lib/invite-coach-utils — we
// never duplicate the share logic.

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PartyPopper, Send } from 'lucide-react';
import { openInviteShareSheet, buildReferralUrl } from '@/lib/invite-coach-utils';

interface CelebrationResponse {
  show: boolean;
  message: string | null;
  currentCount: number;
  latestFirstName: string | null;
}

interface ReferralData {
  code: string;
  referralCount: number;
  rewardEarned: boolean;
}

export function ReferralCelebrationCard() {
  const seenPosted = useRef(false);

  const { data } = useQuery<CelebrationResponse>({
    queryKey: ['referral-celebration'],
    queryFn: async () => {
      const res = await fetch('/api/referrals/celebration');
      if (!res.ok) throw new Error('Failed to load celebration state');
      return (await res.json()) as CelebrationResponse;
    },
    staleTime: 5 * 60_000,
  });

  // The referrals code is fetched lazily, only when the card has show:true,
  // so coaches with no fresh conversions never make this call.
  const { data: referralData } = useQuery<ReferralData>({
    queryKey: ['referrals'],
    queryFn: async () => {
      const res = await fetch('/api/referrals');
      if (!res.ok) throw new Error('Failed to load referrals');
      return (await res.json()) as ReferralData;
    },
    staleTime: 30 * 60_000,
    enabled: Boolean(data?.show),
  });

  // Advance the bookmark once per mount when there's a fresh conversion to
  // show. Best-effort: a failed POST just means the card may show again on
  // the next /home load, but never blocks render.
  useEffect(() => {
    if (!data) return;
    if (seenPosted.current) return;
    if (!data.show) return;
    seenPosted.current = true;
    fetch('/api/referrals/celebration/seen', { method: 'POST' }).catch(() => {
      // ignore — best-effort write
    });
  }, [data]);

  if (!data) return null;
  if (!data.show) return null;

  async function handleInviteAnother() {
    const code = referralData?.code ?? '';
    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'https://sportsiq.app';
    const url = code ? buildReferralUrl(origin, code) : `${origin}/signup`;
    const msg =
      `Hey! I've been using SportsIQ to track my coaching. ` +
      `Try it free: ${url}`;
    await openInviteShareSheet(msg);
  }

  return (
    <div
      data-testid="referral-celebration-card"
      className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-4 space-y-3"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
          <PartyPopper className="h-5 w-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Your invite landed
          </p>
          <p className="mt-0.5 text-sm font-bold text-zinc-100 leading-snug">
            {data.message}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={handleInviteAnother}
        className="w-full flex items-center justify-center gap-2 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-[0.97] touch-manipulation text-white text-sm font-semibold py-2.5 px-4 transition-all min-h-[44px]"
        aria-label="Invite another coach"
      >
        <Send className="h-4 w-4" />
        Invite another coach
      </button>
    </div>
  );
}
