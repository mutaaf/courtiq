'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Gift,
  Copy,
  Check,
  Share2,
  Users,
  Trophy,
  Mail,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

interface ReferralData {
  code: string;
  referralCount: number;
  rewardEarned: boolean;
}

// ─── Step card ────────────────────────────────────────────────────────────────

function HowItWorksStep({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-4 items-start">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-rose-400 text-sm font-bold">
        {number}
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-100">{title}</p>
        <p className="text-xs text-zinc-400 mt-0.5">{description}</p>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery<ReferralData>({
    queryKey: ['referrals'],
    queryFn: async () => {
      const res = await fetch('/api/referrals');
      if (!res.ok) throw new Error('Failed to load referral data');
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });

  const referralUrl = data?.code
    ? `${typeof window !== 'undefined' ? window.location.origin : 'https://sportsiq.app'}/signup?ref=${data.code}`
    : '';

  function handleCopy() {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleNativeShare() {
    if (!referralUrl || typeof navigator === 'undefined') return;
    if (navigator.share) {
      navigator.share({
        title: 'Join me on SportsIQ',
        text: "I've been using SportsIQ to track player development — it's changed how I coach. Join me!",
        url: referralUrl,
      });
    } else {
      handleCopy();
    }
  }

  function handleEmailShare() {
    if (!referralUrl) return;
    const subject = encodeURIComponent('Try SportsIQ — coaching intelligence platform');
    const body = encodeURIComponent(
      `Hey Coach,\n\nI've been using SportsIQ to track player development with AI-powered observations and practice plans. It's been a game changer.\n\nJoin me here: ${referralUrl}\n\nSee you on the platform!`
    );
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Refer a Coach</h1>
          <p className="text-zinc-400 text-sm">Invite a colleague — get 1 month free</p>
        </div>
      </div>

      {/* Reward banner */}
      {data?.rewardEarned && (
        <Card className="border-amber-500/40 bg-amber-500/10">
          <CardContent className="flex items-center gap-4 p-4">
            <Trophy className="h-8 w-8 text-amber-400 shrink-0" />
            <div>
              <p className="font-semibold text-amber-300">Reward earned!</p>
              <p className="text-xs text-amber-400/80">
                You&apos;ve referred {data.referralCount} coach{data.referralCount !== 1 ? 'es' : ''}.
                Your next billing month is on us — reach out to support to claim.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-500/20">
              <Users className="h-5 w-5 text-rose-400" />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-7 w-8 mb-1" />
              ) : (
                <p className="text-2xl font-bold">{data?.referralCount ?? 0}</p>
              )}
              <p className="text-xs text-zinc-400">Coaches referred</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20">
              <Gift className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              {isLoading ? (
                <Skeleton className="h-7 w-12 mb-1" />
              ) : (
                <div className="flex items-center gap-1.5">
                  <p className="text-2xl font-bold">
                    {data?.rewardEarned ? '1' : '0'}
                  </p>
                  {data?.rewardEarned && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                      Earned
                    </Badge>
                  )}
                </div>
              )}
              <p className="text-xs text-zinc-400">Free months earned</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Referral link */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-rose-400" />
            Your referral link
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 p-3">
              <ExternalLink className="h-4 w-4 text-zinc-500 shrink-0" />
              <span className="flex-1 text-sm text-zinc-300 truncate font-mono">{referralUrl}</span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button
              onClick={handleCopy}
              variant="outline"
              className="h-12 flex-col gap-1 py-2"
              disabled={isLoading}
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              <span className="text-xs">{copied ? 'Copied!' : 'Copy'}</span>
            </Button>
            <Button
              onClick={handleEmailShare}
              variant="outline"
              className="h-12 flex-col gap-1 py-2"
              disabled={isLoading}
            >
              <Mail className="h-4 w-4" />
              <span className="text-xs">Email</span>
            </Button>
            <Button
              onClick={handleNativeShare}
              variant="outline"
              className="h-12 flex-col gap-1 py-2"
              disabled={isLoading}
            >
              <Share2 className="h-4 w-4" />
              <span className="text-xs">Share</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* How it works */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">How it works</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <HowItWorksStep
            number={1}
            title="Share your link"
            description="Send your unique referral link to any coach who might benefit from SportsIQ."
          />
          <HowItWorksStep
            number={2}
            title="They sign up"
            description="When a coach creates an account using your link, the referral is automatically tracked."
          />
          <HowItWorksStep
            number={3}
            title="You earn 1 month free"
            description="For every coach who joins, you earn 1 month free on your current plan. Contact support to claim."
          />
        </CardContent>
      </Card>

      {/* Referral code fallback */}
      {data?.code && (
        <p className="text-xs text-zinc-600 text-center">
          Referral code: <span className="font-mono text-zinc-500">{data.code}</span>
        </p>
      )}
    </div>
  );
}
