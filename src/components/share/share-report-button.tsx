'use client';

import { useState } from 'react';
import { Share2, Check, Link } from 'lucide-react';

interface ShareReportButtonProps {
  firstName: string;
  teamName?: string;
  coachName?: string;
  sportEmoji?: string;
}

export function ShareReportButton({ firstName, teamName, coachName, sportEmoji = '🏆' }: ShareReportButtonProps) {
  const [state, setSharedState] = useState<'idle' | 'shared' | 'copied'>('idle');

  async function handleShare() {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const text = coachName && teamName
      ? `Check out ${firstName}'s progress report from ${coachName} at ${teamName}! ${sportEmoji}`
      : `Check out ${firstName}'s progress report! ${sportEmoji}`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${firstName}'s Progress Report`, text, url });
        setSharedState('shared');
        setTimeout(() => setSharedState('idle'), 3000);
        return;
      } catch {
        // User cancelled or not supported — fall through
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setSharedState('copied');
      setTimeout(() => setSharedState('idle'), 3000);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={handleShare}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 active:scale-[0.98] touch-manipulation transition-all"
      aria-label={`Share ${firstName}'s progress report`}
    >
      {state === 'shared' ? (
        <>
          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-emerald-600">Shared!</span>
        </>
      ) : state === 'copied' ? (
        <>
          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-emerald-600">Link copied!</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 text-gray-500 shrink-0" />
          Share {firstName}&apos;s Report
          <Link className="h-3 w-3 text-gray-400 shrink-0 ml-auto" aria-hidden="true" />
        </>
      )}
    </button>
  );
}
