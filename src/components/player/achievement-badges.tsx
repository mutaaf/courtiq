'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Trophy,
  Star,
  Zap,
  Target,
  TrendingUp,
  Swords,
  CalendarCheck,
  Award,
  Plus,
  Lock,
  Loader2,
  X,
  Share2,
  Check,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { AchievementBadgeType, PlayerAchievement } from '@/types/database';
import type { BadgeDef } from '@/app/api/player-achievements/route';

// ─── Badge visual config ──────────────────────────────────────────────────────

const BADGE_CONFIG: Record<
  AchievementBadgeType,
  { icon: typeof Trophy; color: string; bg: string; border: string }
> = {
  first_star:       { icon: Star,          color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  team_player:      { icon: Zap,           color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  grinder:          { icon: TrendingUp,    color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30' },
  all_rounder:      { icon: Target,        color: 'text-purple-400',  bg: 'bg-purple-500/10',  border: 'border-purple-500/30' },
  breakthrough:     { icon: Trophy,        color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30' },
  game_changer:     { icon: Swords,        color: 'text-indigo-400',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/30' },
  session_regular:  { icon: CalendarCheck, color: 'text-teal-400',    bg: 'bg-teal-500/10',    border: 'border-teal-500/30' },
  coach_pick:       { icon: Award,         color: 'text-orange-400',  bg: 'bg-orange-500/10',  border: 'border-orange-500/30' },
  most_improved:    { icon: TrendingUp,    color: 'text-pink-400',    bg: 'bg-pink-500/10',    border: 'border-pink-500/30' },
  rising_star:      { icon: Star,          color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  border: 'border-yellow-500/30' },
};

// Parent-friendly badge descriptions for share messages
const BADGE_PARENT_MSG: Record<AchievementBadgeType, string> = {
  first_star:      'just received their first positive coaching note this season — a great start! 🌟',
  team_player:     'has been showing fantastic effort and attitude in practice, earning the Team Player badge! 🤝',
  grinder:         'is working hard every single session and earned the Grinder badge for consistent dedication! 💪',
  all_rounder:     'has been developing skills across multiple areas of the game — a true All-Rounder! 🎯',
  breakthrough:    'just reached game-ready level in a key skill — a huge breakthrough milestone! 🚀',
  game_changer:    'made a real impact during a game or scrimmage and earned the Game Changer badge! ⚡',
  session_regular: 'has attended 10 sessions and earned the Session Regular badge for showing up consistently! 📅',
  coach_pick:      'was personally selected by the coach for outstanding effort and attitude — amazing! 🏆',
  most_improved:   'has shown the greatest improvement on the entire team this season! 📈',
  rising_star:     'is showing exceptional promise and potential — a true Rising Star! 🌟',
};

// manual-only badge types
const MANUAL_BADGES: AchievementBadgeType[] = ['coach_pick', 'most_improved', 'rising_star'];

// ─── Types ────────────────────────────────────────────────────────────────────

interface AchievementsResponse {
  achievements: PlayerAchievement[];
  badge_defs: BadgeDef[];
}

interface Props {
  playerId: string;
  coachId: string;
  playerName?: string;
  parentPhone?: string | null;
  coachName?: string;
}

// ─── Share helper ─────────────────────────────────────────────────────────────

function buildBadgeShareText(
  playerName: string,
  coachName: string,
  badgeDef: BadgeDef,
): string {
  const parentMsg = BADGE_PARENT_MSG[badgeDef.badge_type] ?? `just earned the ${badgeDef.name} badge!`;
  return `🏆 ${playerName} ${parentMsg}\n\n— Coach ${coachName}`;
}

async function shareBadgeText(
  text: string,
  parentPhone?: string | null,
  badgeName?: string,
): Promise<'shared' | 'whatsapp' | 'copied'> {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch {}
  }
  const encoded = encodeURIComponent(text);
  if (parentPhone) {
    const phone = parentPhone.replace(/\D/g, '');
    window.open(`https://wa.me/${phone}?text=${encoded}`, '_blank', 'noopener');
  } else {
    window.open(`https://wa.me/?text=${encoded}`, '_blank', 'noopener');
  }
  return 'whatsapp';
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AchievementBadgesPanel({ playerId, coachId, playerName, parentPhone, coachName }: Props) {
  const qc = useQueryClient();
  const [showAwardModal, setShowAwardModal] = useState(false);
  const [selectedBadge, setSelectedBadge] = useState<AchievementBadgeType | null>(null);
  const [awardNote, setAwardNote] = useState('');
  const [checkMsg, setCheckMsg] = useState<string | null>(null);
  // Newly auto-awarded badges from the last "Check" call — shown with share buttons
  const [newlyAwarded, setNewlyAwarded] = useState<BadgeDef[]>([]);
  // Badge just manually awarded — shown with share button
  const [awardedDef, setAwardedDef] = useState<BadgeDef | null>(null);
  // Shared confirmation state per badge type
  const [sharedType, setSharedType] = useState<AchievementBadgeType | null>(null);

  const { data, isLoading } = useQuery<AchievementsResponse>({
    queryKey: queryKeys.achievements.player(playerId),
    queryFn: async () => {
      const res = await fetch(`/api/player-achievements?player_id=${playerId}`);
      if (!res.ok) throw new Error('Failed to load achievements');
      return res.json();
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  const checkMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/player-achievements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', player_id: playerId }),
      });
      if (!res.ok) throw new Error('Check failed');
      return res.json() as Promise<{ newly_awarded: PlayerAchievement[] }>;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: queryKeys.achievements.player(playerId) });
      const count = result.newly_awarded?.length ?? 0;
      if (count > 0 && data?.badge_defs) {
        const defs = result.newly_awarded
          .map((a) => data.badge_defs.find((d) => d.badge_type === a.badge_type))
          .filter(Boolean) as BadgeDef[];
        setNewlyAwarded(defs);
        setCheckMsg(null);
      } else {
        setCheckMsg(count > 0 ? `${count} new badge${count > 1 ? 's' : ''} awarded!` : 'All caught up — no new badges yet.');
        setTimeout(() => setCheckMsg(null), 4000);
      }
    },
  });

  const awardMutation = useMutation({
    mutationFn: async ({ badge_type, note }: { badge_type: AchievementBadgeType; note: string }) => {
      const res = await fetch('/api/player-achievements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'award', player_id: playerId, badge_type, note: note || undefined }),
      });
      if (!res.ok) throw new Error('Award failed');
      return res.json();
    },
    onSuccess: (_, { badge_type }) => {
      qc.invalidateQueries({ queryKey: queryKeys.achievements.player(playerId) });
      const def = data?.badge_defs.find((d) => d.badge_type === badge_type) ?? null;
      setAwardedDef(def);
      setShowAwardModal(false);
      setSelectedBadge(null);
      setAwardNote('');
    },
  });

  const handleShare = async (def: BadgeDef) => {
    const name = playerName || 'This player';
    const coach = coachName || 'Coach';
    const text = buildBadgeShareText(name, coach, def);
    await shareBadgeText(text, parentPhone, def.name);
    setSharedType(def.badge_type);
    setTimeout(() => setSharedType(null), 2500);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-orange-400" />
            Achievements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const earned = data?.achievements ?? [];
  const defs = data?.badge_defs ?? [];
  const earnedMap = new Map(earned.map((a) => [a.badge_type, a]));
  const earnedCount = earned.length;
  const canShare = !!(playerName && coachName);

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-orange-400" />
              Achievements
              {earnedCount > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {earnedCount}
                </Badge>
              )}
            </CardTitle>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={checkMutation.isPending}
                onClick={() => checkMutation.mutate()}
                aria-label="Check for new achievement badges"
              >
                {checkMutation.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                <span className="ml-1 hidden sm:inline">Check</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => setShowAwardModal(true)}
                aria-label="Award a badge to this player"
              >
                <Plus className="h-3 w-3" />
                <span className="ml-1 hidden sm:inline">Award</span>
              </Button>
            </div>
          </div>
          {checkMsg && (
            <p className="text-xs text-orange-400 mt-1">{checkMsg}</p>
          )}
        </CardHeader>
        <CardContent>
          {/* Newly auto-awarded badges with share prompt */}
          {newlyAwarded.length > 0 && (
            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-amber-300">
                  🎉 {newlyAwarded.length} new badge{newlyAwarded.length > 1 ? 's' : ''} earned!
                </p>
                <button
                  type="button"
                  onClick={() => setNewlyAwarded([])}
                  className="text-zinc-500 hover:text-zinc-300"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {newlyAwarded.map((def) => {
                  const config = BADGE_CONFIG[def.badge_type];
                  const Icon = config.icon;
                  const isShared = sharedType === def.badge_type;
                  return (
                    <div key={def.badge_type} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-4 w-4 shrink-0 ${config.color}`} />
                        <p className="text-sm font-medium text-zinc-200 truncate">{def.name}</p>
                      </div>
                      {canShare && (
                        <button
                          type="button"
                          onClick={() => handleShare(def)}
                          className={`flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                            isShared
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                          }`}
                          aria-label={`Share ${def.name} badge with parent`}
                        >
                          {isShared ? (
                            <><Check className="h-3 w-3" /> Sent!</>
                          ) : (
                            <><Share2 className="h-3 w-3" /> Share</>
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Just manually awarded — share prompt */}
          {awardedDef && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {(() => {
                    const cfg = BADGE_CONFIG[awardedDef.badge_type];
                    const Icon = cfg.icon;
                    return <Icon className={`h-4 w-4 shrink-0 ${cfg.color}`} />;
                  })()}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-300">{awardedDef.name} awarded! 🎉</p>
                    <p className="text-[11px] text-zinc-400 truncate">{awardedDef.description}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {canShare && (
                    <button
                      type="button"
                      onClick={() => handleShare(awardedDef)}
                      className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                        sharedType === awardedDef.badge_type
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                      }`}
                      aria-label={`Share ${awardedDef.name} badge with parent`}
                    >
                      {sharedType === awardedDef.badge_type ? (
                        <><Check className="h-3 w-3" /> Sent!</>
                      ) : (
                        <><Share2 className="h-3 w-3" /> Share</>
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setAwardedDef(null)}
                    className="text-zinc-500 hover:text-zinc-300"
                    aria-label="Dismiss"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {defs.length === 0 ? (
            <p className="text-sm text-zinc-500">Loading badge definitions…</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {defs.map((def) => {
                const achievement = earnedMap.get(def.badge_type);
                const config = BADGE_CONFIG[def.badge_type];
                const Icon = config.icon;
                const isEarned = Boolean(achievement);
                const isShared = sharedType === def.badge_type;

                return (
                  <div
                    key={def.badge_type}
                    className={`relative flex flex-col items-center rounded-lg border p-3 text-center transition-all ${
                      isEarned
                        ? `${config.bg} ${config.border}`
                        : 'border-zinc-800 bg-zinc-900/30 opacity-50'
                    }`}
                    title={
                      isEarned
                        ? `Earned ${formatDate(achievement!.earned_at)}${achievement!.note ? ` · ${achievement!.note}` : ''}`
                        : def.description
                    }
                  >
                    {!isEarned && (
                      <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-zinc-600" />
                    )}
                    {/* Share button — only on earned badges when we have enough context */}
                    {isEarned && canShare && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleShare(def); }}
                        className={`absolute right-1.5 top-1.5 flex items-center justify-center rounded-md p-0.5 transition-colors ${
                          isShared
                            ? 'text-emerald-400'
                            : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                        aria-label={`Share ${def.name} badge with parent`}
                      >
                        {isShared ? (
                          <Check className="h-3 w-3" />
                        ) : (
                          <Share2 className="h-3 w-3" />
                        )}
                      </button>
                    )}
                    <Icon
                      className={`mb-1 h-5 w-5 ${isEarned ? config.color : 'text-zinc-600'}`}
                    />
                    <p className={`text-xs font-semibold leading-tight ${isEarned ? 'text-zinc-200' : 'text-zinc-500'}`}>
                      {def.name}
                    </p>
                    {isEarned && achievement!.awarded_by && (
                      <p className="mt-0.5 text-[10px] text-zinc-500">Coach awarded</p>
                    )}
                    {isEarned && !achievement!.awarded_by && (
                      <p className="mt-0.5 text-[10px] text-zinc-500">Auto-earned</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {earnedCount === 0 && defs.length > 0 && (
            <p className="mt-3 text-xs text-zinc-500 text-center">
              No badges yet — tap &ldquo;Check&rdquo; after recording observations.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Award Modal */}
      {showAwardModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="award-modal-title"
        >
          <div className="w-full max-w-sm rounded-t-2xl border border-zinc-800 bg-zinc-950 p-6 sm:rounded-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 id="award-modal-title" className="text-base font-semibold text-zinc-100">
                Award a Badge
              </h2>
              <button
                type="button"
                onClick={() => { setShowAwardModal(false); setSelectedBadge(null); setAwardNote(''); }}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Close modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-500 mb-4">
              Manually award a recognition badge to this player.
            </p>

            <div className="space-y-2 mb-4">
              {defs
                .filter((d) => MANUAL_BADGES.includes(d.badge_type))
                .map((def) => {
                  const config = BADGE_CONFIG[def.badge_type];
                  const Icon = config.icon;
                  const alreadyEarned = earnedMap.has(def.badge_type);
                  return (
                    <button
                      key={def.badge_type}
                      type="button"
                      disabled={alreadyEarned}
                      onClick={() => setSelectedBadge(def.badge_type)}
                      className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedBadge === def.badge_type
                          ? `${config.bg} ${config.border}`
                          : alreadyEarned
                            ? 'border-zinc-800 bg-zinc-900/30 opacity-40 cursor-not-allowed'
                            : 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                      }`}
                    >
                      <Icon className={`h-5 w-5 shrink-0 ${config.color}`} />
                      <div>
                        <p className="text-sm font-medium text-zinc-200">{def.name}</p>
                        <p className="text-xs text-zinc-500">{def.description}</p>
                      </div>
                      {alreadyEarned && (
                        <Badge variant="secondary" className="ml-auto text-[10px]">Awarded</Badge>
                      )}
                    </button>
                  );
                })}
            </div>

            {selectedBadge && (
              <div className="mb-4">
                <label htmlFor="award-note" className="text-xs text-zinc-400 block mb-1">
                  Note for player (optional)
                </label>
                <input
                  id="award-note"
                  type="text"
                  value={awardNote}
                  onChange={(e) => setAwardNote(e.target.value)}
                  placeholder="e.g. Outstanding effort at Tuesday's practice"
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                  maxLength={120}
                />
              </div>
            )}

            <Button
              className="w-full"
              disabled={!selectedBadge || awardMutation.isPending}
              onClick={() => {
                if (selectedBadge) {
                  awardMutation.mutate({ badge_type: selectedBadge, note: awardNote });
                }
              }}
            >
              {awardMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Award className="h-4 w-4" />
              )}
              <span className="ml-2">Award Badge</span>
            </Button>
            {awardMutation.isError && (
              <p className="mt-2 text-xs text-red-400 text-center">Failed to award badge. Try again.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
