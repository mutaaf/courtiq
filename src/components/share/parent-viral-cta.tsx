'use client';

import { useState } from 'react';
import { Share2, Check, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ParentViralCTAProps {
  coachName?: string;
  teamName?: string;
}

export function ParentViralCTA({ coachName, teamName }: ParentViralCTAProps) {
  const [shared, setShared] = useState(false);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
  const shareText = coachName
    ? `${coachName} uses SportsIQ to track player development and share progress reports with parents. Check it out!`
    : 'SportsIQ helps coaches track player development and share progress reports with parents. Check it out!';

  async function handleShare() {
    const shareData = {
      title: 'SportsIQ — Coaching Intelligence Platform',
      text: shareText,
      url: appUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share(shareData);
        setShared(true);
        setTimeout(() => setShared(false), 3000);
      } catch {
        // User cancelled share — no-op
      }
    } else {
      // Fallback: copy link to clipboard
      try {
        await navigator.clipboard.writeText(`${shareText}\n\n${appUrl}`);
        setShared(true);
        setTimeout(() => setShared(false), 3000);
      } catch {
        // Clipboard unavailable — open link
        window.open(appUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }

  return (
    <div className="rounded-2xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-zinc-900/50 to-zinc-900/80 p-5">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/20">
          <Sparkles className="h-4 w-4 text-orange-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            {coachName
              ? `${coachName} built this with SportsIQ`
              : teamName
              ? `${teamName}'s coach built this with SportsIQ`
              : 'This report was built with SportsIQ'}
          </p>
          <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
            Does your child have another coach? SportsIQ helps coaches track development,
            generate AI practice plans, and share progress with you — all in one place.
          </p>
        </div>
      </div>

      <Button
        size="sm"
        variant="outline"
        className="w-full gap-2 border-orange-500/30 text-orange-400 hover:bg-orange-500/10 hover:text-orange-300 hover:border-orange-500/50 touch-manipulation active:scale-[0.98] h-11"
        onClick={handleShare}
      >
        {shared ? (
          <>
            <Check className="h-4 w-4" />
            {'share' in navigator ? 'Shared!' : 'Link copied!'}
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" />
            Share SportsIQ with a Coach
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-60" />
          </>
        )}
      </Button>
    </div>
  );
}
