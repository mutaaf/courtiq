'use client';

import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import type { Player } from '@/types/database';

interface PlayerCardProps {
  player: Player;
  observationCount?: number;
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (playerId: string) => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const positionColors: Record<string, string> = {
  PG: 'bg-blue-500/20 text-blue-400',
  SG: 'bg-emerald-500/20 text-emerald-400',
  SF: 'bg-purple-500/20 text-purple-400',
  PF: 'bg-amber-500/20 text-amber-400',
  C: 'bg-red-500/20 text-red-400',
  Flex: 'bg-zinc-700 text-zinc-300',
};

export function PlayerCard({ player, observationCount = 0, selectMode = false, selected = false, onSelect }: PlayerCardProps) {
  const router = useRouter();

  function handleClick() {
    if (selectMode && onSelect) {
      onSelect(player.id);
    } else {
      router.push(`/roster/${player.id}`);
    }
  }

  return (
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
          {player.photo_url ? (
            <img
              src={player.photo_url}
              alt={player.name}
              className="h-12 w-12 rounded-full object-cover ring-2 ring-zinc-700"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20 text-sm font-bold text-orange-400 ring-2 ring-zinc-700">
              {getInitials(player.name)}
            </div>
          )}
          {player.jersey_number !== null && (
            <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold text-zinc-300 ring-1 ring-zinc-600">
              {player.jersey_number}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-zinc-100">{player.name}</p>
          <div className="mt-1 flex items-center gap-2">
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
          </div>
        </div>

        {/* Observation count */}
        {observationCount > 0 && (
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-orange-500">{observationCount}</span>
            <span className="text-[10px] text-zinc-500">obs</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
