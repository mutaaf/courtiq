'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Gift, Share2, Copy, Check, X, Users } from 'lucide-react';

interface InviteCoachCardProps {
  coachId: string;
  coachName: string | null;
  teamName: string;
  observations: number;
  players: number;
  sessions: number;
}

interface ReferralData {
  code: string;
  referralCount: number;
  rewardEarned: boolean;
}

function getDismissKey(coachId: string): string {
  return `sportsiq-invite-dismiss-${coachId}`;
}

function isDismissed(coachId: string): boolean {
  if (typeof window === 'undefined') return false;
  const stored = localStorage.getItem(getDismissKey(coachId));
  if (!stored) return false;
  return Date.now() < Number(stored);
}

function doDismisc(coachId: string): void {
  if (typeof window !== 'undefined') {
    const expires = Date.now() + 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(getDismissKey(coachId), String(expires));
  }
}

export function InviteCoachCard({
  coachId,
  coachName,
  teamName,
  observations,
  players,
  sessions,
}: InviteCoachCardProps) {
  const [dismissed, setDismissed] = useState(() => isDismissed(coachId));
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'shared'>('idle');

  const { data } = useQuery<ReferralData>({
    queryKey: ['referrals'],
    queryFn: async () => {
      const res = await fetch('/api/referrals');
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30 * 60_000,
    enabled: !dismissed && sessions >= 2,
  });

  if (dismissed || sessions < 2 || observations < 10) return null;
  if (!data?.code) return null;

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://sportsiq.app';
  const referralUrl = `${origin}/signup?ref=${data.code}`;
  const firstName = coachName?.split(' ')[0] ?? 'Coach';
  const msg = `Hey! I've been using SportsIQ to track my ${teamName} coaching — I've captured ${observations} observations across ${players} player${players !== 1 ? 's' : ''} this season. It auto-generates parent progress reports and practice plans. Try it free: ${referralUrl}\n\n(Full disclosure: I get a free month when you sign up with my link 😊)`;

  function handleDismiss() {
    doDismisc(coachId);
    setDismissed(true);
  }

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: msg });
        setShareState('shared');
        setTimeout(() => setShareState('idle'), 2500);
        return;
      } catch {
        // fall through
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    setShareState('shared');
    setTimeout(() => setShareState('idle'), 2500);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(msg);
    } catch {
      // ignore
    }
    setShareState('copied');
    setTimeout(() => setShareState('idle'), 2500);
  }

  return (
    <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 via-rose-500/5 to-transparent p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/20">
          <Gift className="h-5 w-5 text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-400">
            Invite a Coach
          </p>
          <p className="text-sm font-bold text-zinc-100 mt-0.5 leading-snug">
            {firstName}, know a coach who'd love this?
          </p>
        </div>
        <button
          onClick={handleDismiss}
          className="shrink-0 rounded-md p-1 text-zinc-600 hover:text-zinc-400 transition-colors"
          aria-label="Dismiss invite card"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Social proof */}
      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300">
          <Users className="h-3 w-3" />
          {players} player{players !== 1 ? 's' : ''} coached
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300">
          {observations} observations
        </span>
        {data.referralCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2.5 py-1 text-xs text-rose-400">
            🎉 {data.referralCount} coach{data.referralCount > 1 ? 'es' : ''} referred
          </span>
        )}
      </div>

      {/* Message preview */}
      <div className="rounded-xl bg-zinc-900/60 border border-zinc-800 px-3 py-2.5">
        <p className="text-xs text-zinc-500 mb-1">Your personalised message</p>
        <p className="text-xs text-zinc-300 leading-relaxed line-clamp-3">{msg}</p>
      </div>

      {/* Reward note */}
      <p className="text-[11px] text-zinc-500 leading-snug">
        🎁 You get <span className="text-rose-400 font-medium">1 free month</span> for each coach who signs up with your link.
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.97] touch-manipulation text-white text-sm font-semibold py-2.5 px-4 transition-all"
          aria-label="Share invite with a coach"
        >
          {shareState === 'shared' ? (
            <>
              <Check className="h-4 w-4" />
              Sent!
            </>
          ) : (
            <>
              <Share2 className="h-4 w-4" />
              Share with a Coach
            </>
          )}
        </button>
        <button
          onClick={handleCopy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 hover:border-zinc-600 active:scale-[0.97] touch-manipulation text-zinc-300 text-sm py-2.5 px-3 transition-all"
          aria-label="Copy invite link to clipboard"
        >
          {shareState === 'copied' ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
