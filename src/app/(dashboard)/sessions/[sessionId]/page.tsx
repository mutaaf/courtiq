'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Calendar,
  MapPin,
  Mic,
  Clock,
  Save,
  Loader2,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  MinusCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { Session, Observation, SessionType, Sentiment } from '@/types/database';

const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  practice: 'Practice',
  game: 'Game',
  scrimmage: 'Scrimmage',
  tournament: 'Tournament',
  training: 'Training',
};

const SENTIMENT_CONFIG: Record<Sentiment, { icon: typeof CheckCircle2; color: string }> = {
  positive: { icon: CheckCircle2, color: 'text-emerald-400' },
  'needs-work': { icon: AlertCircle, color: 'text-amber-400' },
  neutral: { icon: MinusCircle, color: 'text-zinc-400' },
};

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [debrief, setDebrief] = useState('');
  const [debriefInitialized, setDebriefInitialized] = useState(false);

  const { data: session, isLoading: sessionLoading } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      const data = await query<Session>({
        table: 'sessions',
        select: '*',
        filters: { id: sessionId },
        single: true,
      });
      if (!debriefInitialized && data) {
        setDebrief(data.coach_debrief_text || '');
        setDebriefInitialized(true);
      }
      return data;
    },
    ...CACHE_PROFILES.sessions,
  });

  const { data: observations, isLoading: obsLoading } = useQuery({
    queryKey: queryKeys.observations.session(sessionId),
    queryFn: async () => {
      const data = await query<any[]>({
        table: 'observations',
        select: '*, players:player_id(name)',
        filters: { session_id: sessionId },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    ...CACHE_PROFILES.observations,
  });

  const debriefMutation = useMutation({
    mutationFn: async (text: string) => {
      await mutate({
        table: 'sessions',
        operation: 'update',
        data: { coach_debrief_text: text },
        filters: { id: sessionId },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
    },
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function formatTime(time: string | null) {
    if (!time) return null;
    const [h, m] = time.split(':');
    const hour = parseInt(h);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${m} ${ampm}`;
  }

  const isLoading = sessionLoading || obsLoading;

  if (isLoading) {
    return (
      <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <p className="text-zinc-400">Session not found</p>
        <Link href="/sessions" className="mt-4">
          <Button variant="outline">Back to Sessions</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/sessions">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">
              {SESSION_TYPE_LABELS[session.type]}
            </h1>
            {session.opponent && (
              <span className="text-lg text-zinc-400">vs {session.opponent}</span>
            )}
          </div>
        </div>
        <Link href={`/capture?sessionId=${sessionId}`}>
          <Button>
            <Mic className="h-4 w-4" />
            Capture
          </Button>
        </Link>
      </div>

      {/* Session info card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-4 w-4" />
              {formatDate(session.date)}
            </span>
            {session.start_time && (
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {formatTime(session.start_time)}
                {session.end_time && ` - ${formatTime(session.end_time)}`}
              </span>
            )}
            {session.location && (
              <span className="flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {session.location}
              </span>
            )}
          </div>
          {session.curriculum_week && (
            <Badge variant="secondary">Curriculum Week {session.curriculum_week}</Badge>
          )}
          {session.result && (
            <p className="text-sm text-zinc-300">Result: {session.result}</p>
          )}
        </CardContent>
      </Card>

      {/* Observations */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-orange-500" />
            Observations
            <Badge variant="secondary">{observations?.length || 0}</Badge>
          </h2>
        </div>

        {observations?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-8">
              <MessageSquare className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No observations yet</p>
              <Link href={`/capture?sessionId=${sessionId}`} className="mt-3">
                <Button variant="outline" size="sm">
                  <Mic className="h-4 w-4" />
                  Start capturing
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {observations?.map((obs: any) => {
              const sentimentConfig = SENTIMENT_CONFIG[obs.sentiment as Sentiment];
              const SentimentIcon = sentimentConfig?.icon || MinusCircle;

              return (
                <Card key={obs.id}>
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <SentimentIcon
                        className={`h-5 w-5 mt-0.5 shrink-0 ${sentimentConfig?.color || 'text-zinc-400'}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {obs.players?.name && (
                            <span className="text-sm font-medium text-orange-400">
                              {obs.players.name}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-[10px]">
                            {obs.category}
                          </Badge>
                          <Badge
                            variant="outline"
                            className="text-[10px]"
                          >
                            {obs.source}
                          </Badge>
                        </div>
                        <p className="text-sm text-zinc-300">{obs.text}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Coach Debrief */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Coach Debrief</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="Post-session notes: what went well, what to work on, player highlights..."
            value={debrief}
            onChange={(e) => setDebrief(e.target.value)}
            rows={5}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {debriefMutation.isSuccess && 'Saved'}
              {debriefMutation.isError && 'Failed to save'}
            </p>
            <Button
              size="sm"
              onClick={() => debriefMutation.mutate(debrief)}
              disabled={debriefMutation.isPending}
            >
              {debriefMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Debrief
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
