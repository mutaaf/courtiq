'use client';

import { useState } from 'react';
import { Share2, Check, Sparkles, ArrowRight } from 'lucide-react';

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
      try {
        await navigator.clipboard.writeText(`${shareText}\n\n${appUrl}`);
        setShared(true);
        setTimeout(() => setShared(false), 3000);
      } catch {
        window.open(appUrl, '_blank', 'noopener,noreferrer');
      }
    }
  }

  return (
    <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-5 shadow-sm">
      <div className="flex items-start gap-3 mb-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
          <Sparkles className="h-4 w-4 text-orange-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">
            {coachName
              ? `${coachName} built this with SportsIQ`
              : teamName
              ? `${teamName}'s coach built this with SportsIQ`
              : 'This report was built with SportsIQ'}
          </p>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            Does your child have another coach? Share this app with them — it takes 20 seconds to capture an observation.
          </p>
        </div>
      </div>

      <button
        onClick={handleShare}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-orange-300 bg-white px-4 py-3 text-sm font-medium text-orange-600 shadow-sm hover:bg-orange-50 hover:border-orange-400 active:scale-[0.98] transition-all touch-manipulation"
      >
        {shared ? (
          <>
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-emerald-600">{'share' in navigator ? 'Shared!' : 'Link copied!'}</span>
          </>
        ) : (
          <>
            <Share2 className="h-4 w-4" />
            Share with your other coach
            <ArrowRight className="h-3.5 w-3.5 ml-auto opacity-50" />
          </>
        )}
      </button>
    </div>
  );
}
