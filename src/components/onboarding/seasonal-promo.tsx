'use client';

import { useState, useEffect } from 'react';
import { X, Sparkles, Users, BookOpen, CalendarPlus } from 'lucide-react';
import Link from 'next/link';

// ─── Season detection ─────────────────────────────────────────────────────────

type Season = 'fall' | 'winter' | 'spring';

interface SeasonConfig {
  label: string;
  emoji: string;
  headline: string;
  subline: string;
  gradientFrom: string;
  borderColor: string;
  iconBg: string;
  iconColor: string;
  ctaHref: string;
  ctaLabel: string;
}

const SEASON_CONFIGS: Record<Season, SeasonConfig> = {
  fall: {
    label: 'Fall Season',
    emoji: '🍂',
    headline: 'Fall season is starting — get your team ready',
    subline:
      'Import your roster, set up your curriculum, and schedule your first practice.',
    gradientFrom: 'from-amber-500/10',
    borderColor: 'border-amber-500/30',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-400',
    ctaHref: '/roster',
    ctaLabel: 'Import Roster',
  },
  winter: {
    label: 'Winter Season',
    emoji: '❄️',
    headline: 'New year, new season — let\'s go',
    subline:
      'Start fresh: import your roster, update your curriculum, and hit the floor running.',
    gradientFrom: 'from-sky-500/10',
    borderColor: 'border-sky-500/30',
    iconBg: 'bg-sky-500/20',
    iconColor: 'text-sky-400',
    ctaHref: '/roster',
    ctaLabel: 'Import Roster',
  },
  spring: {
    label: 'Spring Season',
    emoji: '🌱',
    headline: 'Spring season is here — time to build',
    subline:
      'Add your players, set development goals, and start capturing observations from day one.',
    gradientFrom: 'from-emerald-500/10',
    borderColor: 'border-emerald-500/30',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-400',
    ctaHref: '/roster',
    ctaLabel: 'Import Roster',
  },
};

/** Returns the active season if today falls in the first 21 days of a season-start month. */
function getActiveSeason(): Season | null {
  const now = new Date();
  const month = now.getMonth() + 1; // 1-based
  const day = now.getDate();
  if (day > 21) return null; // only show in the opening 3 weeks
  if (month === 9) return 'fall';
  if (month === 1) return 'winter';
  if (month === 4) return 'spring';
  return null;
}

/** localStorage key scoped to the current year+month so it auto-resets next season. */
function dismissKey(season: Season): string {
  const now = new Date();
  return `sportsiq_seasonal_promo_dismissed_${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${season}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface SeasonalPromoProps {
  /** If provided, banner is suppressed when the team already has players (not truly "new"). */
  playerCount?: number;
}

export function SeasonalPromo({ playerCount }: SeasonalPromoProps) {
  // null = hidden, Season string = visible for that season
  const [activeSeason, setActiveSeason] = useState<Season | null>(null);

  useEffect(() => {
    const s = getActiveSeason();
    if (!s) return;
    if (localStorage.getItem(dismissKey(s))) return;
    setActiveSeason(s);
  }, []);

  function dismiss() {
    if (!activeSeason) return;
    localStorage.setItem(dismissKey(activeSeason), '1');
    setActiveSeason(null);
  }

  if (!activeSeason) return null;

  const cfg = SEASON_CONFIGS[activeSeason];

  // If the team already has a full roster (10+ players) skip the "import roster" pitch —
  // just show a lighter "schedule your first session" variant.
  const hasRoster = (playerCount ?? 0) >= 5;

  return (
    <div
      className={`relative rounded-xl border ${cfg.borderColor} bg-gradient-to-r ${cfg.gradientFrom} via-transparent to-transparent px-4 py-4`}
    >
      {/* Season badge */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-base leading-none">{cfg.emoji}</span>
        <span className={`text-xs font-semibold uppercase tracking-wider ${cfg.iconColor}`}>
          {cfg.label}
        </span>
      </div>

      {/* Headline + subline */}
      <p className="text-sm font-semibold text-zinc-100 leading-snug">
        {hasRoster ? `${cfg.emoji} Season is starting — kick things off` : cfg.headline}
      </p>
      <p className="mt-1 text-xs text-zinc-400 leading-snug">
        {hasRoster
          ? 'Your roster is ready. Schedule your first session and start capturing observations.'
          : cfg.subline}
      </p>

      {/* Action buttons */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {hasRoster ? (
          <Link
            href="/sessions/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-orange-600 active:scale-95 touch-manipulation"
          >
            <CalendarPlus className="h-3.5 w-3.5" />
            Schedule Session
          </Link>
        ) : (
          <Link
            href={cfg.ctaHref}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-semibold text-white transition-all hover:bg-orange-600 active:scale-95 touch-manipulation"
          >
            <Users className="h-3.5 w-3.5" />
            {cfg.ctaLabel}
          </Link>
        )}
        <Link
          href="/curriculum"
          className={`inline-flex items-center gap-1.5 rounded-lg border ${cfg.borderColor} px-3.5 py-2 text-xs font-semibold ${cfg.iconColor} transition-all hover:bg-white/5 active:scale-95 touch-manipulation`}
        >
          <BookOpen className="h-3.5 w-3.5" />
          Set Up Curriculum
        </Link>
        <Link
          href="/plans"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-zinc-300 transition-all hover:bg-white/5 active:scale-95 touch-manipulation"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Generate Plan
        </Link>
      </div>

      {/* Dismiss */}
      <button
        onClick={dismiss}
        aria-label="Dismiss seasonal promotion"
        className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-500 transition-colors hover:text-zinc-300"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
