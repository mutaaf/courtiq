'use client';

import { use, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SkillProgressBar } from '@/components/roster/skill-progress-bar';
import {
  ArrowLeft,
  BarChart3,
  Eye,
  FileText,
  Image as ImageIcon,
  Share2,
  MessageSquare,
} from 'lucide-react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import type { Player, Observation, PlayerSkillProficiency, Sentiment } from '@/types/database';

type Tab = 'overview' | 'observations' | 'report-card' | 'media' | 'share';

const sentimentVariant: Record<Sentiment, 'success' | 'destructive' | 'secondary'> = {
  positive: 'success',
  'needs-work': 'destructive',
  neutral: 'secondary',
};

const sentimentLabel: Record<Sentiment, string> = {
  positive: 'Positive',
  'needs-work': 'Needs Work',
  neutral: 'Neutral',
};

export default function PlayerDetailPage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = use(params);
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  const { data: player, isLoading: playerLoading } = useQuery({
    queryKey: queryKeys.players.detail(playerId),
    queryFn: async () => {
      const data = await query<Player>({
        table: 'players',
        select: '*',
        filters: { id: playerId },
        single: true,
      });
      return data;
    },
    ...CACHE_PROFILES.roster,
  });

  const { data: observations = [] } = useQuery({
    queryKey: queryKeys.observations.player(playerId),
    queryFn: async () => {
      const data = await query<Observation[]>({
        table: 'observations',
        select: '*',
        filters: { player_id: playerId },
        order: { column: 'created_at', ascending: false },
        limit: 50,
      });
      return data || [];
    },
    ...CACHE_PROFILES.observations,
  });

  const { data: proficiencies = [] } = useQuery({
    queryKey: queryKeys.players.proficiency(playerId),
    queryFn: async () => {
      const data = await query<(PlayerSkillProficiency & {
        curriculum_skills: { name: string; category: string } | null;
      })[]>({
        table: 'player_skill_proficiency',
        select: '*, curriculum_skills(name, category)',
        filters: { player_id: playerId },
        order: { column: 'computed_at', ascending: false },
      });
      return data || [];
    },
    ...CACHE_PROFILES.proficiency,
  });

  // Category breakdown
  const categoryBreakdown = observations.reduce<Record<string, number>>((acc, obs) => {
    acc[obs.category] = (acc[obs.category] || 0) + 1;
    return acc;
  }, {});

  const sortedCategories = Object.entries(categoryBreakdown)
    .sort(([, a], [, b]) => b - a);

  const maxCategoryCount = sortedCategories.length > 0 ? sortedCategories[0][1] : 0;

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { id: 'observations', label: 'Observations', icon: <Eye className="h-4 w-4" /> },
    { id: 'report-card', label: 'Report Card', icon: <FileText className="h-4 w-4" /> },
    { id: 'media', label: 'Media', icon: <ImageIcon className="h-4 w-4" /> },
    { id: 'share', label: 'Share', icon: <Share2 className="h-4 w-4" /> },
  ];

  if (playerLoading) {
    return (
      <div className="space-y-6 p-4 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-300">Player not found</h2>
        <Link href="/roster">
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4" />
            Back to Roster
          </Button>
        </Link>
      </div>
    );
  }

  function getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div className="space-y-6 p-4 lg:p-8">
      {/* Back link */}
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Roster
      </Link>

      {/* Player Header */}
      <Card>
        <CardContent className="flex items-center gap-5 p-6">
          {player.photo_url ? (
            <img
              src={player.photo_url}
              alt={player.name}
              className="h-20 w-20 rounded-full object-cover ring-2 ring-zinc-700"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-500/20 text-2xl font-bold text-orange-400 ring-2 ring-zinc-700">
              {getInitials(player.name)}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-zinc-100">{player.name}</h1>
              {player.jersey_number !== null && (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-orange-400">
                  #{player.jersey_number}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <Badge>{player.position}</Badge>
              {player.age_group && (
                <span className="text-sm text-zinc-400">{player.age_group}</span>
              )}
            </div>
            {player.nickname && (
              <p className="mt-1 text-sm text-zinc-500">
                &ldquo;{player.nickname}&rdquo;
              </p>
            )}
          </div>
          <div className="hidden flex-col items-end gap-1 sm:flex">
            <p className="text-2xl font-bold text-orange-500">{observations.length}</p>
            <p className="text-xs text-zinc-500">observations</p>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-orange-500/20 text-orange-400'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Category Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Category Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {sortedCategories.length === 0 ? (
                <p className="text-sm text-zinc-500">No observations recorded yet.</p>
              ) : (
                sortedCategories.map(([category, count]) => (
                  <div key={category} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-zinc-300">{category}</span>
                      <span className="text-zinc-500">{count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-orange-500 transition-all"
                        style={{ width: `${(count / maxCategoryCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Skill Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Skill Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {proficiencies.length === 0 ? (
                <p className="text-sm text-zinc-500">
                  Skill proficiencies will appear here once enough observations have been recorded.
                </p>
              ) : (
                proficiencies.slice(0, 8).map((prof) => (
                  <SkillProgressBar
                    key={prof.id}
                    skillName={prof.curriculum_skills?.name || prof.skill_id}
                    level={prof.proficiency_level}
                    successRate={prof.success_rate}
                  />
                ))
              )}
            </CardContent>
          </Card>

          {/* Recent Observations */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent Observations</CardTitle>
              <button
                type="button"
                onClick={() => setActiveTab('observations')}
                className="text-sm text-orange-500 hover:text-orange-400"
              >
                View all
              </button>
            </CardHeader>
            <CardContent className="space-y-3">
              {observations.length === 0 ? (
                <p className="text-sm text-zinc-500">No observations yet.</p>
              ) : (
                observations.slice(0, 5).map((obs) => (
                  <div
                    key={obs.id}
                    className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                  >
                    <MessageSquare className="mt-0.5 h-4 w-4 flex-shrink-0 text-zinc-600" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={sentimentVariant[obs.sentiment]}>
                          {sentimentLabel[obs.sentiment]}
                        </Badge>
                        <span className="text-xs text-zinc-500">{obs.category}</span>
                        <span className="text-xs text-zinc-600">
                          {formatDate(obs.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-zinc-300">{obs.text}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'observations' && (
        <div className="space-y-3">
          {observations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center p-8 text-center">
                <Eye className="mb-3 h-10 w-10 text-zinc-700" />
                <p className="text-zinc-400">No observations recorded for this player yet.</p>
                <Link href="/capture">
                  <Button className="mt-4" size="sm">
                    Start Capturing
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            observations.map((obs) => (
              <Card key={obs.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Badge variant={sentimentVariant[obs.sentiment]}>
                      {sentimentLabel[obs.sentiment]}
                    </Badge>
                    <Badge variant="outline">{obs.category}</Badge>
                    <Badge variant="secondary">{obs.source}</Badge>
                    <span className="ml-auto text-xs text-zinc-500">
                      {formatDate(obs.created_at)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-300">{obs.text}</p>
                  {obs.raw_text && obs.raw_text !== obs.text && (
                    <p className="mt-1 text-xs italic text-zinc-600">
                      Original: &ldquo;{obs.raw_text}&rdquo;
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === 'report-card' && (
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <FileText className="mb-3 h-10 w-10 text-zinc-700" />
            <h3 className="font-semibold text-zinc-300">Report Card</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Generate a comprehensive report card summarizing {player.name}&apos;s progress.
            </p>
            <Button className="mt-4">Generate Report Card</Button>
          </CardContent>
        </Card>
      )}

      {activeTab === 'media' && (
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <ImageIcon className="mb-3 h-10 w-10 text-zinc-700" />
            <h3 className="font-semibold text-zinc-300">Media</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Photos, videos, and game film for {player.name} will appear here.
            </p>
          </CardContent>
        </Card>
      )}

      {activeTab === 'share' && (
        <Card>
          <CardContent className="flex flex-col items-center p-8 text-center">
            <Share2 className="mb-3 h-10 w-10 text-zinc-700" />
            <h3 className="font-semibold text-zinc-300">Share with Parents</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Create a shareable link for {player.name}&apos;s parents to view progress.
            </p>
            <Button className="mt-4">Create Share Link</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
