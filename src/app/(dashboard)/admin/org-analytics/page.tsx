'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useTier } from '@/hooks/use-tier';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ShieldCheck,
  ArrowLeft,
  Users,
  Activity,
  ClipboardList,
  Calendar,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Target,
  BarChart2,
  Layers,
} from 'lucide-react';
import type { CoachRole } from '@/types/database';

// ---- Types ----

interface TeamStat {
  id: string;
  name: string;
  playerCount: number;
  obsThisMonth: number;
  sessionsThisMonth: number;
  plansThisMonth: number;
  healthScore: number;
  lastActivity: string | null;
}

interface CoachStat {
  id: string;
  fullName: string;
  email: string;
  role: CoachRole;
  obsThisMonth: number;
  sessionsThisMonth: number;
  plansThisMonth: number;
  engagementScore: number;
}

interface SkillStat {
  skill: string;
  total: number;
  positive: number;
  needsWork: number;
  neutral: number;
  healthPct: number;
}

interface OrgAnalytics {
  summary: {
    totalTeams: number;
    totalCoaches: number;
    totalPlayers: number;
    totalObsThisMonth: number;
    totalSessionsThisMonth: number;
    totalPlansThisMonth: number;
  };
  teams: TeamStat[];
  coaches: CoachStat[];
  skills: SkillStat[];
}

// ---- Small helpers ----

function roleBadgeColor(role: CoachRole) {
  switch (role) {
    case 'admin': return 'bg-red-500/15 text-red-400 border-red-500/20';
    case 'head_coach': return 'bg-orange-500/15 text-orange-400 border-orange-500/20';
    case 'coach': return 'bg-blue-500/15 text-blue-400 border-blue-500/20';
    case 'assistant': return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20';
    default: return 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20';
  }
}

function healthColor(pct: number) {
  if (pct >= 70) return '#22c55e'; // green
  if (pct >= 40) return '#f97316'; // orange
  return '#ef4444'; // red
}

function HealthRing({ value, size = 60 }: { value: number; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / 100);
  const offset = circ * (1 - pct);
  const color = healthColor(value);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <span className="absolute text-[11px] font-bold" style={{ color }}>{value}%</span>
    </div>
  );
}

function HealthTrendIcon({ pct }: { pct: number }) {
  if (pct >= 65) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />;
  if (pct >= 40) return <Minus className="h-3.5 w-3.5 text-orange-400" />;
  return <TrendingDown className="h-3.5 w-3.5 text-red-400" />;
}

function EngagementBadge({ score }: { score: number }) {
  if (score >= 30) return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-xs">High</Badge>;
  if (score >= 10) return <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/20 text-xs">Active</Badge>;
  if (score > 0) return <Badge className="bg-zinc-500/15 text-zinc-400 border-zinc-500/20 text-xs">Low</Badge>;
  return <Badge className="bg-zinc-800 text-zinc-600 border-zinc-700 text-xs">Inactive</Badge>;
}

function SkillBar({ skill, total, maxTotal, positive, needsWork, neutral }: {
  skill: string; total: number; maxTotal: number; positive: number; needsWork: number; neutral: number;
}) {
  const barWidth = maxTotal > 0 ? (total / maxTotal) * 100 : 0;
  const pPct = total > 0 ? (positive / total) * 100 : 0;
  const nPct = total > 0 ? (neutral / total) * 100 : 0;
  const nwPct = total > 0 ? (needsWork / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 min-h-[2.5rem]">
      <span className="w-32 text-xs text-zinc-300 truncate shrink-0 capitalize">{skill}</span>
      <div className="flex-1 flex flex-col gap-0.5">
        {/* Volume bar */}
        <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-zinc-600" style={{ width: `${barWidth}%` }} />
        </div>
        {/* Sentiment strip */}
        <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden flex" style={{ width: `${barWidth}%` }}>
          <div className="h-full bg-emerald-500" style={{ width: `${pPct}%` }} />
          <div className="h-full bg-zinc-500" style={{ width: `${nPct}%` }} />
          <div className="h-full bg-red-500" style={{ width: `${nwPct}%` }} />
        </div>
      </div>
      <span className="text-xs text-zinc-500 w-8 text-right shrink-0">{total}</span>
    </div>
  );
}

// ---- Main page ----

export default function OrgAnalyticsPage() {
  const { coach } = useActiveTeam();
  const { isOrg } = useTier();

  const [data, setData] = useState<OrgAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isAdminUser = coach?.role === 'admin';

  useEffect(() => {
    if (!isAdminUser) return;
    fetch('/api/admin/org-analytics')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError('Failed to load analytics'))
      .finally(() => setLoading(false));
  }, [isAdminUser]);

  if (!isAdminUser || !isOrg) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[60vh]">
        <Card className="max-w-md text-center">
          <CardContent className="p-8">
            <ShieldCheck className="mx-auto h-10 w-10 text-zinc-600 mb-4" />
            <h3 className="text-lg font-semibold">Admin Access Required</h3>
            <p className="text-sm text-zinc-400 mt-2">
              Cross-team analytics are only available to organization administrators.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 lg:p-8 pb-8">
      {/* Header */}
      <div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-100 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Admin
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-3">
          <BarChart2 className="h-7 w-7 text-orange-500" />
          Cross-Team Analytics
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Organization-wide performance — last 30 days
        </p>
      </div>

      {error && (
        <Card className="border-red-500/20 bg-red-500/5">
          <CardContent className="p-4 text-sm text-red-400">{error}</CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: 'Teams', value: data.summary.totalTeams, icon: Layers, color: 'text-blue-400' },
            { label: 'Coaches', value: data.summary.totalCoaches, icon: Users, color: 'text-purple-400' },
            { label: 'Players', value: data.summary.totalPlayers, icon: Users, color: 'text-teal-400' },
            { label: 'Observations', value: data.summary.totalObsThisMonth, icon: Activity, color: 'text-orange-400' },
            { label: 'Sessions', value: data.summary.totalSessionsThisMonth, icon: Calendar, color: 'text-emerald-400' },
            { label: 'Plans', value: data.summary.totalPlansThisMonth, icon: ClipboardList, color: 'text-amber-400' },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-4 flex flex-col items-center text-center gap-1">
                <Icon className={`h-5 w-5 ${color}`} />
                <span className="text-2xl font-bold">{value}</span>
                <span className="text-xs text-zinc-400">{label}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Teams comparison */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Layers className="h-4 w-4 text-blue-400" />
              Team Health
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-lg" />)
            ) : data?.teams.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No teams found</p>
            ) : (
              (data?.teams || [])
                .slice()
                .sort((a, b) => b.healthScore - a.healthScore)
                .map((team) => (
                  <div
                    key={team.id}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
                  >
                    <HealthRing value={team.healthScore} size={56} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{team.name}</span>
                        <HealthTrendIcon pct={team.healthScore} />
                      </div>
                      <div className="flex gap-3 mt-1 text-xs text-zinc-500">
                        <span>{team.obsThisMonth} obs</span>
                        <span>{team.sessionsThisMonth} sessions</span>
                        <span>{team.playerCount} players</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-zinc-400">{team.plansThisMonth} plans</div>
                      {team.lastActivity && (
                        <div className="text-xs text-zinc-600 mt-0.5">
                          {new Date(team.lastActivity).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        {/* Coach Engagement Leaderboard */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              Coach Engagement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)
            ) : data?.coaches.length === 0 ? (
              <p className="text-sm text-zinc-500 text-center py-4">No coaches found</p>
            ) : (
              (data?.coaches || []).map((c, idx) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2"
                >
                  {/* Rank */}
                  <span className={`text-sm font-bold w-5 text-center shrink-0 ${
                    idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-zinc-300' : idx === 2 ? 'text-orange-600' : 'text-zinc-600'
                  }`}>
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{c.fullName}</span>
                      <Badge className={`text-[10px] px-1.5 py-0 capitalize ${roleBadgeColor(c.role)}`}>
                        {c.role.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-zinc-500">
                      <span>{c.obsThisMonth} obs</span>
                      <span>{c.sessionsThisMonth} sessions</span>
                      <span>{c.plansThisMonth} plans</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <EngagementBadge score={c.engagementScore} />
                    <span className="text-xs text-zinc-500">{c.engagementScore} pts</span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Skill Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4 text-orange-400" />
            Skills Across All Teams
            <span className="ml-auto text-xs font-normal text-zinc-500 flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" /> Positive</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-zinc-500" /> Neutral</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-500" /> Needs work</span>
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-8 rounded" />)}
            </div>
          ) : (data?.skills || []).length === 0 ? (
            <p className="text-sm text-zinc-500 text-center py-8">
              No skill observations in the last 30 days
            </p>
          ) : (
            <div className="space-y-1">
              {(() => {
                const skills = data?.skills || [];
                const maxTotal = Math.max(...skills.map((s) => s.total), 1);
                // Split into strongest (top health%) and weakest
                const sorted = [...skills].sort((a, b) => b.healthPct - a.healthPct);
                const strongest = sorted.slice(0, 3).map((s) => s.skill);
                const weakest = sorted.slice(-3).map((s) => s.skill).filter((sk) => !strongest.includes(sk));
                return skills.map((s) => (
                  <div key={s.skill} className="flex items-center gap-2">
                    <div className="flex-1">
                      <SkillBar
                        skill={s.skill}
                        total={s.total}
                        maxTotal={maxTotal}
                        positive={s.positive}
                        needsWork={s.needsWork}
                        neutral={s.neutral}
                      />
                    </div>
                    <div className="w-10 shrink-0">
                      {strongest.includes(s.skill) && (
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px] px-1">
                          Strong
                        </Badge>
                      )}
                      {weakest.includes(s.skill) && (
                        <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px] px-1">
                          Focus
                        </Badge>
                      )}
                    </div>
                  </div>
                ));
              })()}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Team Detail Cards */}
      {!loading && (data?.teams || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4 text-purple-400" />
              Team Activity Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.teams || []).map((team) => {
                const maxObs = Math.max(...(data?.teams || []).map((t) => t.obsThisMonth), 1);
                return (
                  <div key={team.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-sm">{team.name}</div>
                        <div className="text-xs text-zinc-500 mt-0.5">{team.playerCount} players</div>
                      </div>
                      <HealthRing value={team.healthScore} size={44} />
                    </div>
                    {/* Observation volume bar */}
                    <div>
                      <div className="flex justify-between text-xs text-zinc-500 mb-1">
                        <span>Observations</span>
                        <span>{team.obsThisMonth}</span>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 rounded-full"
                          style={{ width: `${(team.obsThisMonth / maxObs) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-500">
                      <span>{team.sessionsThisMonth} sessions</span>
                      <span>{team.plansThisMonth} plans</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
