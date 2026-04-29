'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Loader2, Calendar, Clock, MapPin, Users, BookOpen } from 'lucide-react';
import Link from 'next/link';
import type { SessionType } from '@/types/database';
import { trackEvent } from '@/lib/analytics';

const SESSION_TYPES: { value: SessionType; label: string; description: string; icon: string }[] = [
  { value: 'practice', label: 'Practice', description: 'Regular team practice', icon: '🏋️' },
  { value: 'game', label: 'Game', description: 'Competitive game', icon: '🏀' },
  { value: 'scrimmage', label: 'Scrimmage', description: 'Intra-squad or friendly', icon: '🤝' },
  { value: 'tournament', label: 'Tournament', description: 'Multi-game tournament', icon: '🏆' },
  { value: 'training', label: 'Training', description: 'Skills & conditioning', icon: '💪' },
];

export default function NewSessionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();

  const [type, setType] = useState<SessionType>('practice');
  const [date, setDate] = useState(
    () => searchParams.get('date') || new Date().toISOString().split('T')[0]
  );
  const [startTime, setStartTime] = useState('');
  const [location, setLocation] = useState('');
  const [opponent, setOpponent] = useState('');
  const [curriculumWeek, setCurriculumWeek] = useState<string>(
    activeTeam?.current_week?.toString() || '1'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTeam) return;
    setError('');
    setSaving(true);

    try {
      if (!coach) throw new Error('Not authenticated');

      const data = await mutate<any[]>({
        table: 'sessions',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          type,
          date,
          start_time: startTime || null,
          location: location || null,
          opponent: (type === 'game' || type === 'scrimmage' || type === 'tournament') ? opponent || null : null,
          curriculum_week: curriculumWeek ? parseInt(curriculumWeek) : null,
        },
        select: '*',
      });

      queryClient.invalidateQueries({
        queryKey: queryKeys.sessions.all(activeTeam.id),
      });

      trackEvent('session_created', {
        type,
        has_opponent: !!opponent,
        has_location: !!location,
        has_curriculum_week: !!curriculumWeek,
      });

      router.push(`/sessions/${data[0].id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create session');
      setSaving(false);
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href={searchParams.get('date') ? '/calendar' : '/sessions'}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">New Session</h1>
          <p className="text-zinc-400 text-sm">Log a practice, game, tournament, or training</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Session type selector */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300">Session Type</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {SESSION_TYPES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => setType(st.value)}
                className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-colors ${
                  type === st.value
                    ? 'border-orange-500 bg-orange-500/10'
                    : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                }`}
              >
                <span className="text-2xl">{st.icon}</span>
                <span className="text-sm font-medium text-zinc-100">{st.label}</span>
                <span className="text-[10px] text-zinc-500">{st.description}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date and time */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-zinc-500" />
              Date
            </label>
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-zinc-500" />
              Start Time
            </label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
        </div>

        {/* Location */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-zinc-500" />
            Location
          </label>
          <Input
            placeholder="e.g. Main Gym, Court 3"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        {/* Opponent (game, scrimmage, tournament) */}
        {(type === 'game' || type === 'scrimmage' || type === 'tournament') && (
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-zinc-500" />
              {type === 'tournament' ? 'Tournament Name' : 'Opponent'}
            </label>
            <Input
              placeholder={type === 'tournament' ? 'e.g. Spring Classic, City Championship' : 'e.g. Eagles, Team Blue'}
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            />
          </div>
        )}

        {/* Curriculum week */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-zinc-300 flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5 text-zinc-500" />
            Curriculum Week
          </label>
          <Input
            type="number"
            min="1"
            max="52"
            placeholder="Week number"
            value={curriculumWeek}
            onChange={(e) => setCurriculumWeek(e.target.value)}
          />
          {activeTeam?.current_week && (
            <p className="text-xs text-zinc-500">
              Team is currently on week {activeTeam.current_week}
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-500/10 p-3 text-sm text-red-400">{error}</div>
        )}

        {/* Submit */}
        <div className="flex gap-3">
          <Link href="/sessions" className="flex-1">
            <Button type="button" variant="outline" className="w-full">
              Cancel
            </Button>
          </Link>
          <Button type="submit" className="flex-1" disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Session
          </Button>
        </div>
      </form>
    </div>
  );
}
