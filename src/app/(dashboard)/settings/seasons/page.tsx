'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { useActiveTeam } from '@/hooks/use-active-team';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Archive,
  ChevronDown,
  ChevronUp,
  Calendar,
  Users,
  ClipboardList,
  Eye,
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
} from 'lucide-react';
import Link from 'next/link';
import type { SeasonArchive, SeasonArchivePlayer, SeasonArchiveSkill } from '@/types/database';

// ─── Proficiency label / colour ───────────────────────────────────────────────

const LEVEL_META: Record<string, { label: string; color: string }> = {
  insufficient_data: { label: 'No data', color: 'text-zinc-500' },
  exploring:         { label: 'Exploring', color: 'text-blue-400' },
  practicing:        { label: 'Practicing', color: 'text-amber-400' },
  got_it:            { label: 'Got it', color: 'text-emerald-400' },
  game_ready:        { label: 'Game ready', color: 'text-orange-400' },
};

function LevelBadge({ level }: { level: string }) {
  const meta = LEVEL_META[level] ?? LEVEL_META.insufficient_data;
  return <span className={`text-xs font-medium ${meta.color}`}>{meta.label}</span>;
}

function TrendIcon({ trend }: { trend: string | null }) {
  if (trend === 'improving') return <TrendingUp className="h-3 w-3 text-emerald-400" />;
  if (trend === 'regressing') return <TrendingDown className="h-3 w-3 text-rose-400" />;
  return <Minus className="h-3 w-3 text-zinc-500" />;
}

// ─── Player skill snapshot expand/collapse ────────────────────────────────────

function PlayerSkillCard({ player }: { player: SeasonArchivePlayer }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-zinc-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-zinc-800/40 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-300">
            {player.player_name.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium">{player.player_name}</span>
          <span className="text-xs text-zinc-500">
            {player.skills.length} skill{player.skills.length !== 1 ? 's' : ''}
          </span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-500 shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-zinc-800 divide-y divide-zinc-800/60">
          {player.skills.length === 0 ? (
            <p className="px-4 py-3 text-xs text-zinc-500 italic">No skill data recorded</p>
          ) : (
            player.skills.map((skill: SeasonArchiveSkill, idx: number) => (
              <div key={idx} className="flex items-center justify-between px-4 py-2.5 gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{skill.name}</p>
                  <p className="text-xs text-zinc-500">{skill.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <TrendIcon trend={skill.trend} />
                  <LevelBadge level={skill.level} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Season archive card ──────────────────────────────────────────────────────

function ArchiveCard({ archive }: { archive: SeasonArchive }) {
  const [expanded, setExpanded] = useState(false);
  const players: SeasonArchivePlayer[] = Array.isArray(archive.player_snapshot)
    ? (archive.player_snapshot as SeasonArchivePlayer[])
    : [];

  const fmt = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null;

  return (
    <Card className="border-zinc-800">
      <CardContent className="p-0">
        {/* Header row */}
        <div className="p-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-indigo-400 shrink-0" />
              <span className="font-semibold text-sm truncate">{archive.season_name}</span>
            </div>
            {(archive.start_date || archive.end_date) && (
              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmt(archive.start_date) ?? '?'} – {fmt(archive.end_date) ?? 'present'}
              </p>
            )}
            {archive.notes && (
              <p className="text-xs text-zinc-400 mt-1 italic">{archive.notes}</p>
            )}
          </div>
          <span className="text-xs text-zinc-500 shrink-0">
            {new Date(archive.archived_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>

        {/* Stats strip */}
        <div className="border-t border-zinc-800 grid grid-cols-3 divide-x divide-zinc-800">
          <div className="flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base font-bold">{archive.player_count}</span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Users className="h-3 w-3" /> Players
            </span>
          </div>
          <div className="flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base font-bold">{archive.session_count}</span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <Calendar className="h-3 w-3" /> Sessions
            </span>
          </div>
          <div className="flex flex-col items-center py-2.5 gap-0.5">
            <span className="text-base font-bold">{archive.observation_count}</span>
            <span className="text-xs text-zinc-500 flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> Observations
            </span>
          </div>
        </div>

        {/* Expand player snapshots */}
        {players.length > 0 && (
          <>
            <div className="border-t border-zinc-800">
              <button
                type="button"
                onClick={() => setExpanded((e) => !e)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/30 transition-colors touch-manipulation"
              >
                <span className="flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  {expanded ? 'Hide' : 'Show'} player skill snapshot
                </span>
                {expanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </button>
            </div>

            {expanded && (
              <div className="border-t border-zinc-800 p-3 space-y-2">
                {players.map((player) => (
                  <PlayerSkillCard key={player.player_id} player={player} />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Archive form ─────────────────────────────────────────────────────────────

function ArchiveForm({
  teamId,
  teamName,
  onSuccess,
}: {
  teamId: string;
  teamName: string;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [seasonName, setSeasonName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/seasons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          season_name: seasonName,
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to archive season');
      }
      return res.json();
    },
    onSuccess: () => {
      setOpen(false);
      setSeasonName('');
      setStartDate('');
      setEndDate('');
      setNotes('');
      setError('');
      onSuccess();
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="h-12 w-full gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold touch-manipulation active:scale-[0.98]"
      >
        <Plus className="h-4 w-4" />
        Archive Current Season
      </Button>
    );
  }

  return (
    <Card className="border-orange-500/30 bg-orange-500/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Archive className="h-4 w-4 text-orange-400" />
          Archive Season — {teamName}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-400 mb-1">
            Season name <span className="text-rose-400">*</span>
          </label>
          <Input
            placeholder="e.g. Spring 2026"
            value={seasonName}
            onChange={(e) => setSeasonName(e.target.value)}
            className="h-11"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-zinc-400 mb-1">Start date</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-11"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1">End date</label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-11"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-zinc-400 mb-1">Notes (optional)</label>
          <Input
            placeholder="Any highlights or notes about this season"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-11"
          />
        </div>

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <p className="text-xs text-zinc-500 leading-relaxed">
          Archiving captures a snapshot of all player skill proficiencies, session count, and
          observation count at this moment. The data is saved permanently so you can compare
          player growth across seasons.
        </p>

        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            className="flex-1 h-11"
            onClick={() => {
              setOpen(false);
              setError('');
            }}
            disabled={archiveMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 h-11 bg-orange-500 hover:bg-orange-600 text-white font-semibold"
            onClick={() => archiveMutation.mutate()}
            disabled={archiveMutation.isPending || !seasonName.trim()}
          >
            {archiveMutation.isPending ? 'Archiving…' : 'Archive Season'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SeasonsPage() {
  const queryClient = useQueryClient();
  const { activeTeam, coach } = useActiveTeam();

  const { data, isLoading } = useQuery<{ archives: SeasonArchive[] }>({
    queryKey: queryKeys.seasons.all(coach?.org_id ?? ''),
    queryFn: async () => {
      const res = await fetch('/api/seasons');
      if (!res.ok) throw new Error('Failed to load season archives');
      return res.json();
    },
    enabled: Boolean(coach?.org_id),
    staleTime: 60_000,
  });

  const archives = data?.archives ?? [];

  function handleArchiveSuccess() {
    queryClient.invalidateQueries({ queryKey: queryKeys.seasons.all(coach?.org_id ?? '') });
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Back to settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Season History</h1>
          <p className="text-zinc-400 text-sm">
            Archive completed seasons and compare player progress over time
          </p>
        </div>
      </div>

      {/* Archive current season */}
      {activeTeam ? (
        <ArchiveForm
          teamId={activeTeam.id}
          teamName={activeTeam.name}
          onSuccess={handleArchiveSuccess}
        />
      ) : (
        <Card className="border-zinc-800">
          <CardContent className="p-4 text-sm text-zinc-400">
            No active team found. Set up a team first before archiving a season.
          </CardContent>
        </Card>
      )}

      {/* Past archives */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-300">
            Archived seasons
            {archives.length > 0 && (
              <span className="ml-2 text-zinc-500 font-normal">({archives.length})</span>
            )}
          </h2>
        </div>

        {isLoading ? (
          <>
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-32 w-full rounded-xl" />
            ))}
          </>
        ) : archives.length === 0 ? (
          <Card className="border-zinc-800/50 border-dashed">
            <CardContent className="py-10 flex flex-col items-center text-center gap-2">
              <Archive className="h-8 w-8 text-zinc-700" />
              <p className="text-sm text-zinc-400">No seasons archived yet</p>
              <p className="text-xs text-zinc-600 max-w-xs">
                Archive your first season above to start tracking multi-season player development.
              </p>
            </CardContent>
          </Card>
        ) : (
          archives.map((archive) => (
            <ArchiveCard key={archive.id} archive={archive} />
          ))
        )}
      </div>

      {/* Info card */}
      <Card className="border-zinc-800/50">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-zinc-400">How season history works</p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Archiving a season captures a snapshot of every active player&apos;s skill proficiency
            levels at that point in time. Sessions, observations, and players continue to exist —
            archiving just adds a permanent record you can look back on. Archive at the end of each
            season (fall, spring, summer) to build a full history of your program.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
