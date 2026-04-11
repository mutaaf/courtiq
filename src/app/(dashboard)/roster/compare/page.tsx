'use client';

import { useState, useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, GitCompareArrows, Users } from 'lucide-react';
import Link from 'next/link';
import type { Player, PlayerSkillProficiency } from '@/types/database';

// Proficiency level → numeric score (0–1)
const LEVEL_SCORE: Record<string, number> = {
  insufficient_data: 0,
  exploring: 0.2,
  practicing: 0.45,
  got_it: 0.75,
  game_ready: 1.0,
};

const LEVEL_LABELS: Record<string, string> = {
  insufficient_data: 'No Data',
  exploring: 'Exploring',
  practicing: 'Practicing',
  got_it: 'Got It',
  game_ready: 'Game Ready',
};

const LEVEL_TEXT_COLORS: Record<string, string> = {
  insufficient_data: 'text-zinc-500',
  exploring: 'text-amber-400',
  practicing: 'text-blue-400',
  got_it: 'text-emerald-400',
  game_ready: 'text-purple-400',
};

type ProfData = PlayerSkillProficiency & {
  curriculum_skills: { name: string; category: string } | null;
};

function profScore(p: ProfData): number {
  if (p.success_rate !== null) return p.success_rate;
  return LEVEL_SCORE[p.proficiency_level] ?? 0;
}

// ─── Radar Chart ────────────────────────────────────────────────────────────

function RadarChart({
  skills,
  dataA,
  dataB,
}: {
  skills: string[];
  dataA: Record<string, number>;
  dataB: Record<string, number>;
}) {
  const size = 300;
  const cx = 150;
  const cy = 150;
  const r = 105;
  const n = skills.length;

  if (n < 3) return null;

  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;

  const pt = (i: number, val: number) => ({
    x: cx + r * val * Math.cos(angle(i)),
    y: cy + r * val * Math.sin(angle(i)),
  });

  const polygon = (data: Record<string, number>) => {
    const pts = skills.map((s, i) => pt(i, data[s] ?? 0));
    return (
      pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z'
    );
  };

  const gridRing = (frac: number) => {
    const pts = skills.map((_, i) => {
      const p = pt(i, frac);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });
    return `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(' ')} Z`;
  };

  const labelPos = (i: number) => {
    const a = angle(i);
    const offset = 18;
    return { x: cx + (r + offset) * Math.cos(a), y: cy + (r + offset) * Math.sin(a) };
  };

  const textAnchor = (i: number) => {
    const lp = labelPos(i);
    if (lp.x < cx - 8) return 'end';
    if (lp.x > cx + 8) return 'start';
    return 'middle';
  };

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[300px] mx-auto" aria-hidden="true">
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <path key={frac} d={gridRing(frac)} fill="none" stroke="#3f3f46" strokeWidth={frac === 1 ? 1.5 : 1} />
      ))}

      {/* Axis lines */}
      {skills.map((_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="#3f3f46" strokeWidth="1" />;
      })}

      {/* Player B polygon (behind) */}
      <path d={polygon(dataB)} fill="rgba(59,130,246,0.12)" stroke="rgb(59,130,246)" strokeWidth="2" strokeLinejoin="round" />

      {/* Player A polygon (front) */}
      <path d={polygon(dataA)} fill="rgba(249,115,22,0.12)" stroke="rgb(249,115,22)" strokeWidth="2" strokeLinejoin="round" />

      {/* Data points */}
      {skills.map((s, i) => {
        const pa = pt(i, dataA[s] ?? 0);
        const pb = pt(i, dataB[s] ?? 0);
        return (
          <g key={s}>
            <circle cx={pb.x.toFixed(1)} cy={pb.y.toFixed(1)} r="3.5" fill="rgb(59,130,246)" />
            <circle cx={pa.x.toFixed(1)} cy={pa.y.toFixed(1)} r="3.5" fill="rgb(249,115,22)" />
          </g>
        );
      })}

      {/* Skill labels */}
      {skills.map((s, i) => {
        const lp = labelPos(i);
        const shortName = s.length > 13 ? s.slice(0, 12) + '…' : s;
        return (
          <text
            key={s}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor={textAnchor(i)}
            dominantBaseline="middle"
            fontSize="8.5"
            fill="#a1a1aa"
          >
            {shortName}
          </text>
        );
      })}

      {/* Center */}
      <circle cx={cx} cy={cy} r="2" fill="#52525b" />

      {/* Level ring labels (right side) */}
      {[0.25, 0.5, 0.75, 1].map((frac, idx) => {
        const labels = ['25%', '50%', '75%', '100%'];
        return (
          <text key={frac} x={(cx + r * frac + 4).toFixed(1)} y={cy - 3} fontSize="7" fill="#52525b">
            {labels[idx]}
          </text>
        );
      })}
    </svg>
  );
}

// ─── Stats Card ─────────────────────────────────────────────────────────────

function StatsCard({
  player,
  prof,
  color,
}: {
  player: Player | undefined;
  prof: ProfData[];
  color: 'orange' | 'blue';
}) {
  const gameReady = prof.filter((p) => p.proficiency_level === 'game_ready').length;
  const gotIt = prof.filter((p) => p.proficiency_level === 'got_it').length;
  const total = prof.length;
  const avgRate = total > 0 ? prof.reduce((s, p) => s + (p.success_rate ?? 0), 0) / total : 0;

  const labelColor = color === 'orange' ? 'text-orange-400' : 'text-blue-400';
  const borderColor = color === 'orange' ? 'border-orange-500/30' : 'border-blue-500/30';

  return (
    <div className={`rounded-2xl bg-zinc-900 border ${borderColor} p-4 space-y-3`}>
      <p className={`text-xs font-semibold ${labelColor} uppercase tracking-wider truncate`}>
        {player?.name ?? (color === 'orange' ? 'Player 1' : 'Player 2')}
      </p>
      <div className="space-y-2">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Skills tracked</span>
          <span className="text-zinc-200 font-medium">{total}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Game Ready</span>
          <span className="text-purple-400 font-medium">{gameReady}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Got It</span>
          <span className="text-emerald-400 font-medium">{gotIt}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">Avg. Success</span>
          <span className="text-zinc-200 font-medium">{Math.round(avgRate * 100)}%</span>
        </div>
      </div>
      {player && (
        <Link href={`/roster/${player.id}`}>
          <Button variant="outline" size="sm" className="w-full mt-1 h-9 text-xs">
            View Profile
          </Button>
        </Link>
      )}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function ComparePage() {
  const { activeTeam } = useActiveTeam();
  const [playerAId, setPlayerAId] = useState('');
  const [playerBId, setPlayerBId] = useState('');

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: queryKeys.players.all(activeTeam?.id ?? ''),
    queryFn: async () => {
      const data = await query<Player[]>({
        table: 'players',
        select: '*',
        filters: { team_id: activeTeam!.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.roster,
  });

  const { data: profA = [], isLoading: loadingA } = useQuery({
    queryKey: [...queryKeys.players.proficiency(playerAId), 'compare'],
    queryFn: async () => {
      const data = await query<ProfData[]>({
        table: 'player_skill_proficiency',
        select: '*, curriculum_skills(name, category)',
        filters: { player_id: playerAId },
        order: { column: 'computed_at', ascending: false },
      });
      // deduplicate by skill_id, keep latest
      const seen = new Set<string>();
      return (data || []).filter((p) => {
        if (seen.has(p.skill_id)) return false;
        seen.add(p.skill_id);
        return true;
      });
    },
    enabled: !!playerAId,
    ...CACHE_PROFILES.proficiency,
  });

  const { data: profB = [], isLoading: loadingB } = useQuery({
    queryKey: [...queryKeys.players.proficiency(playerBId), 'compare'],
    queryFn: async () => {
      const data = await query<ProfData[]>({
        table: 'player_skill_proficiency',
        select: '*, curriculum_skills(name, category)',
        filters: { player_id: playerBId },
        order: { column: 'computed_at', ascending: false },
      });
      const seen = new Set<string>();
      return (data || []).filter((p) => {
        if (seen.has(p.skill_id)) return false;
        seen.add(p.skill_id);
        return true;
      });
    },
    enabled: !!playerBId,
    ...CACHE_PROFILES.proficiency,
  });

  const playerA = players.find((p) => p.id === playerAId);
  const playerB = players.find((p) => p.id === playerBId);

  // Build skill map: name → scores for both players
  const { radarSkills, dataA, dataB, allSkillsOrdered } = useMemo(() => {
    const skillNameMap = new Map<string, string>(); // skillId → name

    for (const p of profA) {
      if (p.curriculum_skills?.name) skillNameMap.set(p.skill_id, p.curriculum_skills.name);
    }
    for (const p of profB) {
      if (p.curriculum_skills?.name) skillNameMap.set(p.skill_id, p.curriculum_skills.name);
    }

    const dataA: Record<string, number> = {};
    for (const p of profA) {
      if (p.curriculum_skills?.name) dataA[p.curriculum_skills.name] = profScore(p);
    }

    const dataB: Record<string, number> = {};
    for (const p of profB) {
      if (p.curriculum_skills?.name) dataB[p.curriculum_skills.name] = profScore(p);
    }

    const allNames = Array.from(skillNameMap.values());
    // For radar: only include skills present in both players, up to 12
    const shared = allNames.filter((s) => s in dataA && s in dataB);
    const onlyA = allNames.filter((s) => s in dataA && !(s in dataB));
    const onlyB = allNames.filter((s) => s in dataB && !(s in dataA));

    const radarSkills = shared.slice(0, 12);
    const allSkillsOrdered = [...shared, ...onlyA, ...onlyB];

    return { radarSkills, dataA, dataB, allSkillsOrdered };
  }, [profA, profB]);

  const bothSelected = !!playerAId && !!playerBId;
  const loading = loadingA || loadingB;

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[60vh]">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-800/50 mb-5">
          <Users className="h-8 w-8 text-zinc-600" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-1 text-sm text-zinc-500">Select or create a team first.</p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/roster">
          <Button variant="ghost" size="sm" className="h-10 w-10 p-0 touch-manipulation">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Player Comparison</h1>
          <p className="text-sm text-zinc-400">Side-by-side skill progression</p>
        </div>
      </div>

      {/* Player Selectors */}
      {playersLoading ? (
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-orange-400 uppercase tracking-wider">
              Player 1
            </label>
            <select
              value={playerAId}
              onChange={(e) => setPlayerAId(e.target.value)}
              className="w-full h-12 rounded-xl border border-orange-500/40 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            >
              <option value="">Select player…</option>
              {players
                .filter((p) => p.id !== playerBId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
              Player 2
            </label>
            <select
              value={playerBId}
              onChange={(e) => setPlayerBId(e.target.value)}
              className="w-full h-12 rounded-xl border border-blue-500/40 bg-zinc-900 px-3 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="">Select player…</option>
              {players
                .filter((p) => p.id !== playerAId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {/* Empty prompt */}
      {!bothSelected && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 py-16 text-center">
          <GitCompareArrows className="h-12 w-12 text-zinc-600 mb-4" />
          <p className="text-sm text-zinc-400">Select two players to compare skill progression</p>
          <p className="text-xs text-zinc-600 mt-1">Skill radar and side-by-side bars will appear here</p>
        </div>
      )}

      {/* Loading state */}
      {bothSelected && loading && (
        <div className="space-y-4">
          <Skeleton className="h-[320px] rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      )}

      {/* Comparison content */}
      {bothSelected && !loading && (
        <>
          {/* Legend */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="h-3 w-8 rounded-full bg-orange-500" />
              <span className="text-sm font-medium text-zinc-200">{playerA?.name ?? 'Player 1'}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-8 rounded-full bg-blue-500" />
              <span className="text-sm font-medium text-zinc-200">{playerB?.name ?? 'Player 2'}</span>
            </div>
          </div>

          {/* Radar Chart — only if 3+ shared skills */}
          {radarSkills.length >= 3 ? (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 p-6">
              <h2 className="text-sm font-semibold text-zinc-300 mb-1 text-center">Skill Radar</h2>
              <p className="text-xs text-zinc-600 text-center mb-4">
                {radarSkills.length} shared skill{radarSkills.length !== 1 ? 's' : ''}
              </p>
              <RadarChart skills={radarSkills} dataA={dataA} dataB={dataB} />
            </div>
          ) : radarSkills.length > 0 ? (
            <div className="rounded-2xl bg-zinc-900/50 border border-zinc-800 px-5 py-4 text-center">
              <p className="text-xs text-zinc-500">
                Radar chart requires 3+ shared skills — only {radarSkills.length} found.
              </p>
            </div>
          ) : null}

          {/* Side-by-side skill comparison table */}
          {allSkillsOrdered.length > 0 ? (
            <div className="rounded-2xl bg-zinc-900 border border-zinc-800 overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_1fr] border-b border-zinc-800 bg-zinc-900/80">
                <div className="px-4 py-3 text-xs font-semibold text-orange-400 uppercase tracking-wider truncate">
                  {playerA?.name ?? 'Player 1'}
                </div>
                <div className="px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider text-center">
                  Skill
                </div>
                <div className="px-4 py-3 text-xs font-semibold text-blue-400 uppercase tracking-wider text-right truncate">
                  {playerB?.name ?? 'Player 2'}
                </div>
              </div>

              {allSkillsOrdered.map((skillName) => {
                const vA = dataA[skillName] ?? null;
                const vB = dataB[skillName] ?? null;
                const pA = profA.find((p) => p.curriculum_skills?.name === skillName);
                const pB = profB.find((p) => p.curriculum_skills?.name === skillName);
                const levelA = pA?.proficiency_level ?? null;
                const levelB = pB?.proficiency_level ?? null;
                const isShared = vA !== null && vB !== null;

                return (
                  <div
                    key={skillName}
                    className="grid grid-cols-[1fr_auto_1fr] border-b border-zinc-800/60 last:border-0 items-center gap-2 px-4 py-3"
                  >
                    {/* Player A */}
                    <div className="space-y-1 min-w-0">
                      {vA !== null ? (
                        <>
                          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-orange-500 transition-all duration-500"
                              style={{ width: `${Math.max(vA * 100, 2)}%` }}
                            />
                          </div>
                          <span className={`text-[10px] ${levelA ? LEVEL_TEXT_COLORS[levelA] : 'text-zinc-500'}`}>
                            {levelA ? LEVEL_LABELS[levelA] : '—'}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-zinc-700">No data</span>
                      )}
                    </div>

                    {/* Skill name */}
                    <div
                      className={`text-[10px] text-center min-w-[72px] max-w-[90px] px-1 leading-tight ${
                        isShared ? 'text-zinc-300' : 'text-zinc-500'
                      }`}
                      title={skillName}
                    >
                      {skillName.length > 14 ? skillName.slice(0, 13) + '…' : skillName}
                    </div>

                    {/* Player B */}
                    <div className="space-y-1 min-w-0 items-end">
                      {vB !== null ? (
                        <>
                          <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${Math.max(vB * 100, 2)}%` }}
                            />
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] ${levelB ? LEVEL_TEXT_COLORS[levelB] : 'text-zinc-500'}`}>
                              {levelB ? LEVEL_LABELS[levelB] : '—'}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="text-right">
                          <span className="text-[10px] text-zinc-700">No data</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-700 py-12 text-center">
              <p className="text-sm text-zinc-500">No skill proficiency data yet for these players.</p>
              <p className="text-xs text-zinc-600 mt-1">
                Capture observations and recompute proficiency to see skill data.
              </p>
            </div>
          )}

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-4">
            <StatsCard player={playerA} prof={profA} color="orange" />
            <StatsCard player={playerB} prof={profB} color="blue" />
          </div>
        </>
      )}
    </div>
  );
}
