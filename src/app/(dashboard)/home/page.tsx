'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Users, ClipboardList, TrendingUp, Calendar, Plus } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  const { activeTeam, teams } = useActiveTeam();

  const { data: stats } = useQuery({
    queryKey: ['home-stats', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const supabase = createClient();
      const [players, observations, sessions] = await Promise.all([
        supabase.from('players').select('id', { count: 'exact' }).eq('team_id', activeTeam.id).eq('is_active', true),
        supabase.from('observations').select('id', { count: 'exact' }).eq('team_id', activeTeam.id),
        supabase.from('sessions').select('id', { count: 'exact' }).eq('team_id', activeTeam.id),
      ]);
      return {
        players: players.count || 0,
        observations: observations.count || 0,
        sessions: sessions.count || 0,
      };
    },
    enabled: !!activeTeam,
  });

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10 text-4xl">
          🏀
        </div>
        <h1 className="text-2xl font-bold">Welcome to CourtIQ</h1>
        <p className="mt-2 text-zinc-400">Create your first team to get started</p>
        <Link href="/onboarding/team">
          <Button className="mt-6" size="lg">
            <Plus className="h-5 w-5" />
            Create Team
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{activeTeam.name}</h1>
        <p className="text-zinc-400">Season {activeTeam.season || 'Not set'} &middot; Week {activeTeam.current_week}</p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href="/capture">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-500/20">
                <Mic className="h-6 w-6 text-orange-500" />
              </div>
              <span className="text-sm font-medium">Capture</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/roster">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/20">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <span className="text-sm font-medium">Roster</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/plans">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <ClipboardList className="h-6 w-6 text-emerald-500" />
              </div>
              <span className="text-sm font-medium">Plans</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/sessions/new">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50">
            <CardContent className="flex flex-col items-center gap-2 p-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-500/20">
                <Calendar className="h-6 w-6 text-purple-500" />
              </div>
              <span className="text-sm font-medium">New Session</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats?.players || 0}</p>
            <p className="text-xs text-zinc-400">Players</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-500">{stats?.observations || 0}</p>
            <p className="text-xs text-zinc-400">Observations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-500">{stats?.sessions || 0}</p>
            <p className="text-xs text-zinc-400">Sessions</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
