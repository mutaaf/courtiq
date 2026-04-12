'use client';

import { useState, useEffect } from 'react';
import { useTier } from '@/hooks/use-tier';
import { X, Rocket } from 'lucide-react';
import Link from 'next/link';

interface FreemiumNudgeProps {
  /** How many players the team currently has */
  playerCount?: number;
  /** How many total observations the team has (used as AI usage proxy) */
  observationCount?: number;
}

const MAX_FREE_PLAYERS = 10;
const DISMISS_KEY = 'sportsiq_freemium_nudge_dismissed_v1';

function getDismissExpiry(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return null;
  const ts = parseInt(raw, 10);
  return isNaN(ts) ? null : ts;
}

export function FreemiumNudge({ playerCount = 0, observationCount = 0 }: FreemiumNudgeProps) {
  const { tier } = useTier();
  const [visible, setVisible] = useState(false);

  // Only show on free tier
  const isFree = tier === 'free';

  useEffect(() => {
    if (!isFree) return;
    const expiry = getDismissExpiry();
    if (expiry && Date.now() < expiry) return; // still snoozed
    setVisible(true);
  }, [isFree]);

  function dismiss() {
    // Snooze for 3 days
    const expiry = Date.now() + 3 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(expiry));
    setVisible(false);
  }

  if (!isFree || !visible) return null;

  // Decide the most relevant message
  let headline: string;
  let body: string;

  const pctPlayers = playerCount / MAX_FREE_PLAYERS;
  if (pctPlayers >= 0.8) {
    headline = `You've added ${playerCount}/${MAX_FREE_PLAYERS} players`;
    body = 'Upgrade to Coach for unlimited players and team rosters.';
  } else if (observationCount >= 3) {
    headline = 'Unlock the full coaching toolkit';
    body = 'Upgrade for unlimited AI features, parent sharing, analytics, and more.';
  } else {
    headline = 'You\'re on the Free plan';
    body = 'Upgrade to Coach for unlimited AI, plans, and player tracking.';
  }

  return (
    <div className="relative flex items-center gap-3 rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 via-orange-500/5 to-transparent px-4 py-3.5">
      {/* Icon */}
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
        <Rocket className="h-4.5 w-4.5 text-orange-400" />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-zinc-200 leading-tight">{headline}</p>
        <p className="text-xs text-zinc-400 mt-0.5 leading-snug">{body}</p>
      </div>

      {/* CTA */}
      <Link
        href="/settings/upgrade"
        className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-orange-600 active:scale-95 touch-manipulation"
      >
        Upgrade
      </Link>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label="Dismiss upgrade prompt"
        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-500 hover:text-zinc-300 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
