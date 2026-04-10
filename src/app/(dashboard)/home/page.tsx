'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Mic, Users, ClipboardList, TrendingUp, Calendar, Plus, Sparkles, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

export default function HomePage() {
  const { activeTeam, teams } = useActiveTeam();

  const { data: stats } = useQuery({
    queryKey: ['home-stats', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return null;
      const [players, observations, sessions] = await Promise.all([
        query<any[]>({ table: 'players', select: 'id', filters: { team_id: activeTeam.id, is_active: true } }),
        query<any[]>({ table: 'observations', select: 'id', filters: { team_id: activeTeam.id } }),
        query<any[]>({ table: 'sessions', select: 'id', filters: { team_id: activeTeam.id } }),
      ]);
      return {
        players: players.length,
        observations: observations.length,
        sessions: sessions.length,
      };
    },
    enabled: !!activeTeam,
  });

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-orange-500/10 p-3">
          <Image src="/logo.svg" alt="CourtIQ" width={48} height={48} />
        </div>
        <h1 className="text-2xl font-bold">Welcome to CourtIQ</h1>
        <p className="mt-2 text-zinc-400 max-w-sm">
          Your AI-powered coaching assistant. Create your first team to start tracking players, capturing observations, and generating practice plans.
        </p>
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
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-orange-500/20">
                <Mic className="h-7 w-7 sm:h-6 sm:w-6 text-orange-500" />
              </div>
              <span className="text-sm font-medium">Capture</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/roster">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-blue-500/20">
                <Users className="h-7 w-7 sm:h-6 sm:w-6 text-blue-500" />
              </div>
              <span className="text-sm font-medium">Roster</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/plans">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-emerald-500/20">
                <ClipboardList className="h-7 w-7 sm:h-6 sm:w-6 text-emerald-500" />
              </div>
              <span className="text-sm font-medium">Plans</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/sessions/new">
          <Card className="cursor-pointer transition-colors hover:border-orange-500/50 active:scale-[0.97] touch-manipulation">
            <CardContent className="flex flex-col items-center gap-3 p-5 sm:p-4 sm:gap-2">
              <div className="flex h-14 w-14 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-purple-500/20">
                <Calendar className="h-7 w-7 sm:h-6 sm:w-6 text-purple-500" />
              </div>
              <span className="text-sm font-medium">New Session</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-5 sm:p-4 text-center">
            <p className="text-3xl sm:text-2xl font-bold text-orange-500">{stats?.players || 0}</p>
            <p className="text-xs text-zinc-400 mt-1">Players</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 sm:p-4 text-center">
            <p className="text-3xl sm:text-2xl font-bold text-blue-500">{stats?.observations || 0}</p>
            <p className="text-xs text-zinc-400 mt-1">Observations</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5 sm:p-4 text-center">
            <p className="text-3xl sm:text-2xl font-bold text-emerald-500">{stats?.sessions || 0}</p>
            <p className="text-xs text-zinc-400 mt-1">Sessions</p>
          </CardContent>
        </Card>
      </div>

      {/* Empty state prompt for new users */}
      {stats && stats.players === 0 && stats.observations === 0 && stats.sessions === 0 && (
        <Card className="border-dashed border-zinc-700 overflow-hidden">
          <CardContent className="flex flex-col items-center text-center p-8 sm:p-10">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/10 mb-5">
              <Sparkles className="h-8 w-8 text-orange-500" />
            </div>
            <h3 className="text-xl font-semibold text-zinc-200">Get started in 3 steps</h3>
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-lg">
              <Link href="/roster/add" className="group">
                <div className="rounded-xl border border-zinc-800 p-4 text-center hover:border-blue-500/50 transition-colors">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-500/20 mb-2">
                    <Users className="h-5 w-5 text-blue-500" />
                  </div>
                  <p className="text-sm font-medium">Add Players</p>
                  <p className="text-xs text-zinc-500 mt-1">Build your roster</p>
                </div>
              </Link>
              <Link href="/capture" className="group">
                <div className="rounded-xl border border-zinc-800 p-4 text-center hover:border-orange-500/50 transition-colors">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-orange-500/20 mb-2">
                    <Mic className="h-5 w-5 text-orange-500" />
                  </div>
                  <p className="text-sm font-medium">Capture</p>
                  <p className="text-xs text-zinc-500 mt-1">Record observations</p>
                </div>
              </Link>
              <Link href="/plans" className="group">
                <div className="rounded-xl border border-zinc-800 p-4 text-center hover:border-emerald-500/50 transition-colors">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/20 mb-2">
                    <ClipboardList className="h-5 w-5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium">Plan</p>
                  <p className="text-xs text-zinc-500 mt-1">Generate AI plans</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
