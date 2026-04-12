'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Users, AlertTriangle, CheckCircle, Clock, Share2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import type { PlayerEngagement, EngagementSummary } from '@/app/api/parent-engagement/route';

interface ParentEngagementPanelProps {
  teamId: string;
}

const STATUS_CONFIG: Record<
  PlayerEngagement['status'],
  { label: string; color: string; badgeClass: string; icon: typeof CheckCircle }
> = {
  engaged: {
    label: 'Engaged',
    color: 'text-emerald-400',
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    icon: CheckCircle,
  },
  moderate: {
    label: 'Moderate',
    color: 'text-blue-400',
    badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    icon: Clock,
  },
  stale: {
    label: 'Stale',
    color: 'text-amber-400',
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    icon: Clock,
  },
  never_opened: {
    label: 'Never opened',
    color: 'text-orange-400',
    badgeClass: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    icon: AlertTriangle,
  },
  unshared: {
    label: 'Not shared',
    color: 'text-zinc-400',
    badgeClass: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
    icon: Share2,
  },
};

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function SummaryBar({ summary }: { summary: EngagementSummary }) {
  const engagedPct = summary.total > 0 ? Math.round(((summary.engaged + summary.moderate) / summary.total) * 100) : 0;
  const needsAttention = summary.stale + summary.never_opened + summary.unshared;

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {/* Progress bar */}
      <div className="flex-1 min-w-32">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-zinc-400">{engagedPct}% families engaged</span>
          <span className="text-xs text-zinc-500">
            {summary.engaged + summary.moderate}/{summary.total}
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800 overflow-hidden">
          <div className="flex h-full rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(summary.engaged / (summary.total || 1)) * 100}%` }}
            />
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${(summary.moderate / (summary.total || 1)) * 100}%` }}
            />
            <div
              className="h-full bg-amber-500/70 transition-all"
              style={{ width: `${(summary.stale / (summary.total || 1)) * 100}%` }}
            />
            <div
              className="h-full bg-orange-500/70 transition-all"
              style={{ width: `${(summary.never_opened / (summary.total || 1)) * 100}%` }}
            />
            <div
              className="h-full bg-zinc-600 transition-all"
              style={{ width: `${(summary.unshared / (summary.total || 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Stats chips */}
      <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
        {summary.engaged > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="h-3 w-3" />
            {summary.engaged} active
          </span>
        )}
        {summary.moderate > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="h-3 w-3" />
            {summary.moderate} moderate
          </span>
        )}
        {needsAttention > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="h-3 w-3" />
            {needsAttention} need follow-up
          </span>
        )}
      </div>
    </div>
  );
}

function PlayerEngagementRow({ player }: { player: PlayerEngagement }) {
  const config = STATUS_CONFIG[player.status];
  const Icon = config.icon;

  function getLastSeenText() {
    if (player.status === 'unshared') return 'No report shared yet';
    if (player.status === 'never_opened') return 'Shared — never opened';
    if (!player.lastViewed) return 'No views recorded';
    const days = daysSince(player.lastViewed);
    if (days === 0) return 'Viewed today';
    if (days === 1) return 'Viewed yesterday';
    return `Viewed ${days} days ago`;
  }

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-zinc-800/50 last:border-0">
      {/* Avatar */}
      <div className="flex-shrink-0 h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-300">
        {player.jersey_number !== null ? `#${player.jersey_number}` : player.name.charAt(0).toUpperCase()}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-zinc-200 truncate">{player.name}</p>
        <p className={`text-xs ${config.color} flex items-center gap-1 mt-0.5`}>
          <Icon className="h-3 w-3 flex-shrink-0" />
          {getLastSeenText()}
          {player.viewCount > 0 && (
            <span className="text-zinc-500 ml-1">· {player.viewCount} view{player.viewCount !== 1 ? 's' : ''}</span>
          )}
        </p>
      </div>

      {/* Status badge */}
      <span className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${config.badgeClass}`}>
        {config.label}
      </span>

      {/* Action link */}
      <Link
        href={`/roster/${player.id}`}
        className="flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-colors touch-manipulation"
        title={player.status === 'unshared' ? 'Create share link' : 'View player'}
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

export function ParentEngagementPanel({ teamId }: ParentEngagementPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery<{ players: PlayerEngagement[]; summary: EngagementSummary }>({
    queryKey: ['parent-engagement', teamId],
    queryFn: async () => {
      const res = await fetch(`/api/parent-engagement?team_id=${teamId}`);
      if (!res.ok) throw new Error('Failed to load engagement data');
      return res.json();
    },
    staleTime: 5 * 60_000, // 5 min
    gcTime: 30 * 60_000,
    enabled: !!teamId,
  });

  if (isLoading || !data || data.summary.total === 0) return null;

  const { summary, players } = data;
  const needsAttention = players
    .filter((p) => p.status === 'stale' || p.status === 'never_opened' || p.status === 'unshared')
    .sort((a, b) => a.score - b.score); // lowest score first (worst engagement first)

  const visiblePlayers = showAll ? players : needsAttention.slice(0, 5);

  return (
    <Card className="border-zinc-800/60">
      <CardHeader className="p-4 pb-0">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center justify-between w-full text-left touch-manipulation"
        >
          <CardTitle className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-400" />
            Parent Engagement
          </CardTitle>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-zinc-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          )}
        </button>

        {/* Always-visible summary bar */}
        <div className="mt-3 pb-4">
          <SummaryBar summary={summary} />
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="p-4 pt-0 space-y-3">
          {/* Tab toggle */}
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={!showAll ? 'default' : 'outline'}
              onClick={() => setShowAll(false)}
              className={`h-7 text-xs ${!showAll ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
            >
              Needs follow-up ({needsAttention.length})
            </Button>
            <Button
              size="sm"
              variant={showAll ? 'default' : 'outline'}
              onClick={() => setShowAll(true)}
              className={`h-7 text-xs ${showAll ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
            >
              All ({players.length})
            </Button>
          </div>

          {/* Player list */}
          {visiblePlayers.length === 0 ? (
            <div className="text-center py-6">
              <CheckCircle className="h-8 w-8 text-emerald-400 mx-auto mb-2" />
              <p className="text-sm text-zinc-300 font-medium">All families are engaged!</p>
              <p className="text-xs text-zinc-500 mt-1">Every parent has viewed a report in the last 7 days.</p>
            </div>
          ) : (
            <div>
              {visiblePlayers.map((player) => (
                <PlayerEngagementRow key={player.id} player={player} />
              ))}
              {!showAll && needsAttention.length > 5 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="mt-2 text-xs text-orange-400 hover:text-orange-300 underline underline-offset-2"
                >
                  Show all {needsAttention.length} players needing follow-up
                </button>
              )}
            </div>
          )}

          {/* Tip */}
          {needsAttention.length > 0 && (
            <p className="text-xs text-zinc-600 border-t border-zinc-800/50 pt-3">
              Tip: Share a player report from their profile page to re-engage their family.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
