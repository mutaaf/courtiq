'use client';

import { useState } from 'react';
import { Share2, Check, X } from 'lucide-react';
import { buildParentShareMessage, getFirstName } from '@/lib/parent-share-utils';

interface ParentShareButtonProps {
  playerName: string;
  teamName: string | null;
  coachName: string | null;
  shareUrl: string;
}

export function ParentShareButton({
  playerName,
  teamName,
  coachName,
  shareUrl,
}: ParentShareButtonProps) {
  const [state, setState] = useState<'idle' | 'shared' | 'dismissed'>('idle');

  const firstName = getFirstName(playerName);

  async function handleShare() {
    const msg = buildParentShareMessage({ playerName, teamName, coachName, shareUrl });
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: msg, url: shareUrl });
        setState('shared');
        return;
      } catch {
        // user cancelled — no change
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(msg);
      setState('shared');
    } catch {
      // ignore clipboard errors
    }
  }

  if (state === 'dismissed') return null;

  if (state === 'shared') {
    return (
      <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm text-emerald-700">
          <Check className="h-4 w-4 shrink-0" />
          <span>Shared! Now the whole family can cheer {firstName} on. 🙌</span>
        </div>
        <button
          onClick={() => setState('dismissed')}
          className="ml-2 shrink-0 rounded p-0.5 text-emerald-500 hover:text-emerald-700"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5">
      <p className="text-sm text-orange-800 leading-snug min-w-0">
        <span className="font-semibold">Share {firstName}&apos;s progress</span>
        <span className="text-orange-600"> — let the whole family celebrate! 🎉</span>
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          onClick={handleShare}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white active:scale-[0.97] touch-manipulation transition-all hover:bg-orange-600"
          aria-label={`Share ${firstName}'s progress report with family`}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </button>
        <button
          onClick={() => setState('dismissed')}
          className="rounded p-1 text-orange-400 hover:text-orange-600"
          aria-label="Dismiss share prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
