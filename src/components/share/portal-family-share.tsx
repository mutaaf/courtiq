'use client';

import { useState } from 'react';
import { Share2, Check } from 'lucide-react';

interface PortalFamilyShareProps {
  playerName: string;
  teamName: string;
  coachName?: string | null;
  shareToken: string;
}

export function PortalFamilyShare({
  playerName,
  teamName,
  coachName,
  shareToken,
}: PortalFamilyShareProps) {
  const [state, setState] = useState<'idle' | 'shared' | 'copied'>('idle');

  async function handleShare() {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/share/${shareToken}`
        : `/share/${shareToken}`;

    const coachFirst = coachName?.split(' ')[0];
    const text = coachFirst
      ? `Check out ${playerName}'s progress report from Coach ${coachFirst} at ${teamName}! 🎉`
      : `Check out ${playerName}'s progress report with ${teamName}! 🎉`;

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: `${playerName}'s Progress Report`, text, url });
        setState('shared');
        setTimeout(() => setState('idle'), 2500);
      } catch {
        // user cancelled — no-op
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(`${text}\n\n${url}`);
      setState('copied');
      setTimeout(() => setState('idle'), 2500);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={handleShare}
      aria-label={`Share ${playerName}'s progress report with family`}
      className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 shadow-sm hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all touch-manipulation"
    >
      {state === 'shared' ? (
        <>
          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-emerald-600">Report shared!</span>
        </>
      ) : state === 'copied' ? (
        <>
          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
          <span className="text-emerald-600">Link copied to clipboard!</span>
        </>
      ) : (
        <>
          <Share2 className="h-4 w-4 text-gray-400 shrink-0" />
          <span>Share this report with family</span>
        </>
      )}
    </button>
  );
}
