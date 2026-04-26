'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check, Clock } from 'lucide-react';
import type { Player, PlayerAvailability } from '@/types/database';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { AvailabilityBadge } from '@/components/roster/availability-badge';
import { PlayerAvailabilityModal } from '@/components/roster/player-availability-modal';
import type { PlayerMomentum } from '@/lib/momentum-utils';
import { getMomentumBadgeClasses, getMomentumLabel } from '@/lib/momentum-utils';

function formatLastObserved(iso: string | null): { label: string; className: string } | null {
  if (!iso) return { label: 'Never observed', className: 'text-zinc-600' };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return { label: 'Seen today', className: 'text-emerald-500' };
  if (days === 1) return { label: '1d ago', className: 'text-zinc-500' };
  if (days < 7) return { label: `${days}d ago`, className: 'text-amber-400' };
  if (days < 14) return { label: `${days}d ago`, className: 'text-orange-400' };
  return { label: `${days}d ago`, className: 'text-red-400' };
}

interface PlayerCardProps {
  player: Player;
  observationCount?: number;
  lastObserved?: string | null;
  lastObsPreview?: { text: string; sentiment: string } | null;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (playerId: string) => void;
  availability?: PlayerAvailability | null;
  teamId?: string;
  momentum?: PlayerMomentum | null;
}

const positionColors: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400',
  SG: 'bg-emerald-500/20 text-emerald-400',
  SF: 'bg-purple-500/20 text-purple-400',
  PF: 'bg-amber-500/20 text-amber-400',
  C: 'bg-red-500/20 text-red-400',
  Flex: 'bg-zinc-700 text-zinc-300',
};

export function PlayerCard({
  player,
  observationCount = 0,
  lastObserved = null,
  lastObsPreview = null,
  selectMode = false,
  selected = false,
  onSelect,
  availability,
  teamId,
  momentum = null,
}: PlayerCardProps) {
  const router = useRouter();
  const [showAvailability, setShowAvailability] = useState(false);

  function handleClick() {
    if (selectMode && onSelect) {
      onSelect(player.id);
    } else {
      router.push(`/roster/${player.id}`);
    }
  }

  function handleAvailabilityClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (teamId) setShowAvailability(true);
  }

  const status = availability?.status ?? 'available';
  const showBadge = status !== 'available';

  return (
    <>
      <Card
        className={cn(
          'cursor-pointer transition-all hover:border-orange-500/50 hover:bg-zinc-900/80',
          selected && 'border-orange-500 bg-orange-500/5',
        )}
        onClick={handleClick}
      >
        <CardContent className="flex items-center gap-4 p-4">
          {/* Selection checkbox */}
          {selectMode && (
            <div className={cn(
              'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              selected ? 'border-orange-500 bg-orange-500' : 'border-zinc-500 bg-transparent',
            )}>
              {selected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
            </div>
          )}
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            <PlayerAvatar photoUrl={player.photo_url} name={player.name} size={48} />
            {player.jersey_number !== null && (
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-1 ring-zinc-600">
                {player.jersey_number}
              </span>
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-zinc-100">{player.name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                className={cn(
                  'text-[10px]',
                  positionColors[player.position] || 'bg-zinc-700 text-zinc-300'
                )}
              >
                {player.position}
              </Badge>
              {player.age_group && (
                <span className="text-xs text-zinc-500">{player.age_group}</span>
              )}
              {/* Availability badge — only shown when NOT available */}
              {showBadge && (
                <button
                  onClick={handleAvailabilityClick}
                  className="touch-manipulation"
                  aria-label={`Set availability for ${player.name}`}
                >
                  <AvailabilityBadge status={status} />
                </button>
              )}
              {/* Momentum badge — only shown for non-steady tier to avoid noise, hidden on mobile */}
              {momentum && momentum.tier !== 'steady' && (
                <span
                  className={cn(
                    'hidden sm:inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold',
                    getMomentumBadgeClasses(momentum.tier),
                  )}
                  title={`Momentum: ${momentum.score}/100`}
                >
                  {momentum.tier === 'rising' ? '↑' : '↓'} {getMomentumLabel(momentum.tier)}
                </span>
              )}
            </div>
            {/* Last observed chip — always visible, gives coaches a quick attention-queue scan */}
            {(() => {
              const fmt = formatLastObserved(observationCount === 0 ? null : lastObserved);
              if (!fmt) return null;
              const preview = observationCount > 0 ? lastObsPreview : null;
              const previewColor = preview?.sentiment === 'positive'
                ? 'text-emerald-400'
                : preview?.sentiment === 'negative'
                ? 'text-amber-400'
                : 'text-zinc-500';
              const previewText = preview?.text
                ? preview.text.length > 55
                  ? preview.text.slice(0, 55).trimEnd() + '…'
                  : preview.text
                : null;
              return (
                <div className="mt-1.5 space-y-0.5">
                  <div className={cn('flex items-center gap-1', fmt.className)}>
                    <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] leading-none">{fmt.label}</span>
                  </div>
                  {previewText && (
                    <p className={cn('text-[10px] italic leading-snug', previewColor)}>
                      &ldquo;{previewText}&rdquo;
                    </p>
                  )}
                </div>
              );
            })()}
            {/* Return date hint */}
            {availability?.expected_return && status !== 'available' && (
              <p className="mt-1 text-[10px] text-zinc-500">
                Returns {availability.expected_return}
              </p>
            )}
          </div>

          {/* Right side: obs count (desktop only) + availability toggle when available */}
          <div className="flex flex-col items-end gap-2">
            {observationCount > 0 && (
              <div className="hidden sm:flex flex-col items-center">
                <span className="text-lg font-bold text-orange-500">{observationCount}</span>
                <span className="text-[10px] text-zinc-500">obs</span>
              </div>
            )}
            {/* Tap when "available" to set a restriction */}
            {!showBadge && teamId && !selectMode && (
              <button
                onClick={handleAvailabilityClick}
                className="touch-manipulation rounded-full p-1 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-400"
                aria-label={`Set availability for ${player.name}`}
                title="Set availability"
              >
                <AvailabilityBadge status="available" size="dot" />
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {showAvailability && teamId && (
        <PlayerAvailabilityModal
          player={player}
          teamId={teamId}
          current={availability ?? null}
          onClose={() => setShowAvailability(false)}
        />
      )}
    </>
  );
}
