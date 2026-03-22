'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Calendar, MapPin, Eye, Plus, Filter } from 'lucide-react';
import Link from 'next/link';
import type { Session, SessionType } from '@/types/database';

const SESSION_TYPE_CONFIG: Record<SessionType, { label: string; color: string }> = {
  practice: { label: 'Practice', color: 'bg-blue-500/20 text-blue-400' },
  game: { label: 'Game', color: 'bg-emerald-500/20 text-emerald-400' },
  scrimmage: { label: 'Scrimmage', color: 'bg-purple-500/20 text-purple-400' },
  tournament: { label: 'Tournament', color: 'bg-amber-500/20 text-amber-400' },
  training: { label: 'Training', color: 'bg-orange-500/20 text-orange-400' },
};

const FILTER_OPTIONS: { value: SessionType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'practice', label: 'Practice' },
  { value: 'game', label: 'Game' },
  { value: 'scrimmage', label: 'Scrimmage' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'training', label: 'Training' },
];

export default function SessionsPage() {
  const { activeTeam } = useActiveTeam();
  const [typeFilter, setTypeFilter] = useState<SessionType | 'all'>('all');

  const { data: sessions, isLoading } = useQuery({
    queryKey: [...queryKeys.sessions.all(activeTeam?.id || ''), typeFilter],
    queryFn: async () => {
      if (!activeTeam) return [];
      const supabase = createClient();
      let query = supabase
        .from('sessions')
        .select('*, observations:observations(count)')
        .eq('team_id', activeTeam.id)
        .order('date', { ascending: false });

      if (typeFilter !== 'all') {
        query = query.eq('type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.sessions,
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
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

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-zinc-400 text-sm">
            {sessions?.length || 0} session{sessions?.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <Link href="/sessions/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Session
          </Button>
        </Link>
      </div>

      {/* Type filter */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <Filter className="h-4 w-4 text-zinc-500 shrink-0" />
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setTypeFilter(opt.value)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              typeFilter === opt.value
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Sessions list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : sessions?.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-zinc-600 mb-4" />
            <p className="text-zinc-400 text-sm">No sessions yet</p>
            <Link href="/sessions/new" className="mt-4">
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4" />
                Create your first session
              </Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions?.map((session: any) => {
            const typeConfig = SESSION_TYPE_CONFIG[session.type as SessionType];
            const obsCount = session.observations?.[0]?.count || 0;

            return (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card className="transition-colors hover:border-zinc-700 cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${typeConfig.color}`}
                          >
                            {typeConfig.label}
                          </span>
                          {session.opponent && (
                            <span className="text-sm text-zinc-300">
                              vs {session.opponent}
                            </span>
                          )}
                          {session.curriculum_week && (
                            <Badge variant="secondary">
                              Week {session.curriculum_week}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-sm text-zinc-400">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(session.date)}
                            {session.start_time && (
                              <span className="ml-1">
                                at {formatTime(session.start_time)}
                              </span>
                            )}
                          </span>
                          {session.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3.5 w-3.5" />
                              {session.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-zinc-500">
                        <Eye className="h-3.5 w-3.5" />
                        {obsCount}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
