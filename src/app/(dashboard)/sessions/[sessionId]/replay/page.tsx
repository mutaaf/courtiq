'use client';

import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
  Edit2,
  X,
  Save,
  Loader2,
  Play,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import type { Observation, Player, Session, Sentiment } from '@/types/database';

// Consistent per-player color palette
const PLAYER_COLORS = [
  '#f97316', // orange
  '#3b82f6', // blue
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#14b8a6', // teal
  '#ef4444', // red
  '#6366f1', // indigo
  '#84cc16', // lime
];

const SENTIMENT_CONFIG: Record<
  Sentiment,
  { icon: typeof CheckCircle2; color: string; label: string; bg: string; border: string }
> = {
  positive: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    label: 'Positive',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  'needs-work': {
    icon: AlertCircle,
    color: 'text-amber-400',
    label: 'Needs Work',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
  neutral: {
    icon: MinusCircle,
    color: 'text-zinc-400',
    label: 'Neutral',
    bg: 'bg-zinc-800/50',
    border: 'border-zinc-700/50',
  },
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

function formatRelativeTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `+${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatWallTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface ReplayObservation extends Observation {
  players?: { name: string } | null;
}

function ObservationCard({
  obs,
  elapsed,
  playerColor,
  onSaved,
}: {
  obs: ReplayObservation;
  elapsed: number;
  playerColor: string | null;
  onSaved: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(obs.text);
  const [editSentiment, setEditSentiment] = useState<Sentiment>(obs.sentiment);

  const sentimentConfig = SENTIMENT_CONFIG[obs.sentiment];
  const SentimentIcon = sentimentConfig.icon;

  const saveMutation = useMutation({
    mutationFn: async () => {
      await mutate({
        table: 'observations',
        operation: 'update',
        data: { text: editText.trim(), sentiment: editSentiment, coach_edited: true },
        filters: { id: obs.id },
      });
    },
    onSuccess: () => {
      onSaved();
      setIsEditing(false);
    },
  });

  function handleCancel() {
    setEditText(obs.text);
    setEditSentiment(obs.sentiment);
    setIsEditing(false);
  }

  const dotColor = playerColor || '#71717a';

  return (
    <div className="flex gap-3 group">
      {/* Avatar dot + relative time */}
      <div className="flex flex-col items-center shrink-0 w-12">
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold z-10"
          style={{
            borderColor: dotColor,
            backgroundColor: `${dotColor}20`,
            color: dotColor,
          }}
        >
          {obs.players?.name ? obs.players.name.charAt(0).toUpperCase() : '·'}
        </div>
        <span className="text-[9px] text-zinc-600 mt-1 tabular-nums">
          {formatRelativeTime(elapsed)}
        </span>
      </div>

      {/* Card */}
      <div
        className={`flex-1 min-w-0 rounded-xl border p-3 mb-3 transition-colors ${
          isEditing
            ? 'border-orange-500/40 bg-orange-500/5'
            : `${sentimentConfig.border} ${sentimentConfig.bg}`
        }`}
      >
        {isEditing ? (
          <div className="space-y-3">
            {/* Sentiment selector */}
            <div className="flex flex-wrap gap-1.5">
              {(['positive', 'neutral', 'needs-work'] as Sentiment[]).map((s) => {
                const sc = SENTIMENT_CONFIG[s];
                const Icon = sc.icon;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditSentiment(s)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-all touch-manipulation ${
                      editSentiment === s
                        ? `${sc.bg} ${sc.color} border ${sc.border}`
                        : 'bg-zinc-800/50 text-zinc-500 border border-zinc-700/50 hover:text-zinc-300'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {sc.label}
                  </button>
                );
              })}
            </div>

            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={3}
              className="text-sm"
              autoFocus
            />

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !editText.trim()}
                className="bg-orange-500 hover:bg-orange-600 text-white min-h-[36px]"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                disabled={saveMutation.isPending}
                className="min-h-[36px]"
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              {saveMutation.isError && (
                <span className="text-xs text-red-400">Failed to save</span>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-2">
            <SentimentIcon className={`h-4 w-4 mt-0.5 shrink-0 ${sentimentConfig.color}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                {obs.players?.name && (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: playerColor || '#f97316' }}
                  >
                    {obs.players.name}
                  </span>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {obs.category}
                </Badge>
                <span className="text-[9px] text-zinc-600">
                  {formatWallTime(obs.created_at)}
                </span>
                {obs.coach_edited && (
                  <Badge variant="outline" className="text-[9px] border-zinc-700/50 text-zinc-600">
                    edited
                  </Badge>
                )}
              </div>
              <p className="text-sm text-zinc-300 leading-relaxed">{obs.text}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="ml-1 shrink-0 rounded-lg p-1.5 text-zinc-600 opacity-0 group-hover:opacity-100 hover:bg-zinc-800 hover:text-zinc-300 transition-all focus:opacity-100 touch-manipulation"
              aria-label="Edit observation"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CoachReplayPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const data = await query<Session>({
        table: 'sessions',
        select: '*',
        filters: { id: sessionId },
        single: true,
      });
      return data;
    },
    ...CACHE_PROFILES.sessions,
  });

  const {
    data: observations = [],
    isLoading: obsLoading,
    refetch,
  } = useQuery({
    queryKey: ['replay-observations', sessionId],
    queryFn: async () => {
      const data = await query<ReplayObservation[]>({
        table: 'observations',
        select: '*, players:player_id(name)',
        filters: { session_id: sessionId },
        order: { column: 'created_at', ascending: true },
      });
      return data || [];
    },
    staleTime: 0,
  });

  const { data: players = [] } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Pick<Player, 'id' | 'name'>[]>({
        table: 'players',
        select: 'id, name',
        filters: { team_id: activeTeam.id, is_active: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  // Assign a consistent color to each player
  const playerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p, i) => {
      map.set(p.id, PLAYER_COLORS[i % PLAYER_COLORS.length]);
    });
    return map;
  }, [players]);

  // T0 = timestamp of the first observation
  const t0 = useMemo(
    () => (observations.length > 0 ? new Date(observations[0].created_at).getTime() : null),
    [observations]
  );

  // Total span in milliseconds
  const totalSpan = useMemo(() => {
    if (!t0 || observations.length < 2) return null;
    return new Date(observations[observations.length - 1].created_at).getTime() - t0;
  }, [observations, t0]);

  // Group observations into 15-minute buckets
  const grouped = useMemo(() => {
    if (!t0 || observations.length === 0) return [];
    const BUCKET_MS = 15 * 60 * 1000;

    type Group = {
      bucketLabel: string;
      observations: { obs: ReplayObservation; elapsed: number }[];
    };
    const groups: Group[] = [];
    const seen = new Map<string, Group>();

    observations.forEach((obs) => {
      const elapsed = new Date(obs.created_at).getTime() - t0;
      const bucketIndex = Math.floor(elapsed / BUCKET_MS);
      const bucketStart = bucketIndex * BUCKET_MS;
      const bucketEnd = bucketStart + BUCKET_MS;
      const label = `${formatRelativeTime(bucketStart)} – ${formatRelativeTime(bucketEnd)}`;

      let group = seen.get(label);
      if (!group) {
        group = { bucketLabel: label, observations: [] };
        groups.push(group);
        seen.set(label, group);
      }
      group.observations.push({ obs, elapsed });
    });

    return groups;
  }, [observations, t0]);

  // Players who appear in this session
  const activePlayers = useMemo(() => {
    const seenIds = new Set<string>();
    return observations
      .filter((o) => {
        if (!o.player_id || seenIds.has(o.player_id)) return false;
        seenIds.add(o.player_id);
        return true;
      })
      .map((o) => ({
        id: o.player_id!,
        name: o.players?.name ?? 'Unknown',
        color: playerColorMap.get(o.player_id!) ?? '#71717a',
      }));
  }, [observations, playerColorMap]);

  // Sentiment summary counts
  const sentimentCounts = useMemo(() => {
    return observations.reduce(
      (acc, o) => {
        acc[o.sentiment] = (acc[o.sentiment] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }, [observations]);

  if (sessionLoading || obsLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-4 pb-8 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-zinc-400">Session not found</p>
        <Link href="/sessions">
          <Button variant="outline" className="mt-4">
            Back to Sessions
          </Button>
        </Link>
      </div>
    );
  }

  const sessionLabel = SESSION_TYPE_LABELS[session.type] ?? session.type;

  return (
    <div className="p-4 lg:p-8 space-y-5 pb-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/sessions/${sessionId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Play className="h-5 w-5 text-orange-400 shrink-0" />
            <h1 className="text-xl font-bold">Coach Replay</h1>
          </div>
          <p className="text-zinc-400 text-sm mt-0.5 truncate">
            {sessionLabel}
            {session.opponent ? ` vs ${session.opponent}` : ''}
            {session.date
              ? ` · ${new Date(`${session.date}T00:00:00`).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-center">
          <p className="text-xl font-bold text-orange-400">{observations.length}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Observations</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-center">
          <p className="text-xl font-bold text-blue-400">{activePlayers.length}</p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Players Tagged</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-center">
          <p className="text-xl font-bold text-emerald-400">
            {totalSpan !== null ? formatRelativeTime(totalSpan).replace('+', '') : '—'}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">Span</p>
        </div>
      </div>

      {/* Sentiment summary */}
      {observations.length > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/30 p-3">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-emerald-400 font-medium">{sentimentCounts.positive ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <MinusCircle className="h-3.5 w-3.5 text-zinc-400" />
            <span className="font-medium">{sentimentCounts.neutral ?? 0}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <AlertCircle className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-amber-400 font-medium">{sentimentCounts['needs-work'] ?? 0}</span>
          </div>
          <div className="ml-auto">
            <div className="flex h-2 w-32 overflow-hidden rounded-full bg-zinc-800">
              {observations.length > 0 && (
                <>
                  <div
                    className="h-full bg-emerald-500"
                    style={{
                      width: `${((sentimentCounts.positive ?? 0) / observations.length) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-zinc-500"
                    style={{
                      width: `${((sentimentCounts.neutral ?? 0) / observations.length) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-amber-500"
                    style={{
                      width: `${((sentimentCounts['needs-work'] ?? 0) / observations.length) * 100}%`,
                    }}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Player legend */}
      {activePlayers.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Users className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
          {activePlayers.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 rounded-full bg-zinc-800/60 px-2.5 py-1"
            >
              <span
                className="inline-block h-2 w-2 rounded-full shrink-0"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-xs text-zinc-300">{p.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {observations.length === 0 && (
        <Card className="border-dashed border-zinc-700">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Play className="h-10 w-10 text-zinc-600 mb-3" />
            <h3 className="text-base font-semibold text-zinc-300">No observations to replay</h3>
            <p className="text-sm text-zinc-500 mt-1 max-w-xs">
              Observations will appear here in chronological order as you capture them during sessions.
            </p>
            <Link href={`/capture?sessionId=${sessionId}`} className="mt-4">
              <Button variant="outline" size="sm">
                Start Capturing
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {grouped.length > 0 && (
        <div className="relative">
          {/* Vertical connector line — runs behind the dots */}
          <div className="absolute left-[22px] top-5 bottom-8 w-px bg-zinc-800 z-0" />

          <div className="space-y-1">
            {grouped.map((group, gi) => (
              <div key={gi}>
                {/* Bucket header — only shown when more than one bucket */}
                {grouped.length > 1 && (
                  <div className="flex items-center gap-2 mb-3 pl-14">
                    <div className="h-px flex-1 bg-zinc-800/60" />
                    <span className="shrink-0 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                      {group.bucketLabel}
                    </span>
                    <div className="h-px flex-1 bg-zinc-800/60" />
                  </div>
                )}

                {group.observations.map(({ obs, elapsed }) => (
                  <ObservationCard
                    key={obs.id}
                    obs={obs}
                    elapsed={elapsed}
                    playerColor={
                      obs.player_id ? (playerColorMap.get(obs.player_id) ?? null) : null
                    }
                    onSaved={() => {
                      queryClient.invalidateQueries({
                        queryKey: queryKeys.observations.session(sessionId),
                      });
                      refetch();
                    }}
                  />
                ))}
              </div>
            ))}
          </div>

          {/* End cap */}
          <div className="flex items-center gap-3 mt-1 relative">
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950 z-10 ml-[10px]">
              <div className="h-1.5 w-1.5 rounded-full bg-zinc-600" />
            </div>
            <span className="text-xs text-zinc-600">
              Session ended
              {totalSpan !== null && ` · ${formatRelativeTime(totalSpan).replace('+', '')} span`}
            </span>
          </div>
        </div>
      )}

      {/* Edit hint */}
      {observations.length > 0 && (
        <p className="text-[10px] text-zinc-700 text-center pb-4">
          Hover or tap the edit icon on any card to revise text or sentiment
        </p>
      )}
    </div>
  );
}
