'use client';

import { useMemo, useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, TrendingDown, Minus, Users, Eye, Calendar, Target, AlertTriangle, CheckCircle2, Activity, LineChart as LineChartIcon, LayoutGrid, BarChart2, ArrowRight, Download, ChevronDown, Share2, X, Copy, Check } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import type { Observation, Player, Session, Sentiment } from '@/types/database';

// --- Helpers ---

function getISOWeekKey(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function weekLabel(weekKey: string): string {
  const [year, w] = weekKey.split('-W');
  const jan4 = new Date(Number(year), 0, 4);
  const weekStart = new Date(jan4);
  weekStart.setDate(jan4.getDate() - (jan4.getDay() || 7) + 1 + (Number(w) - 1) * 7);
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// SVG progress ring
function ProgressRing({
  value,
  max = 100,
  size = 96,
  stroke = 10,
  color = '#F97316',
  children,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, value / max);
  const offset = circ * (1 - pct);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#27272a" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

// Stacked bar segment
function StackedBar({
  positive,
  neutral,
  needsWork,
  total,
  label,
}: {
  positive: number;
  neutral: number;
  needsWork: number;
  total: number;
  label: string;
}) {
  const pPct = total > 0 ? (positive / total) * 100 : 0;
  const nPct = total > 0 ? (neutral / total) * 100 : 0;
  const nwPct = total > 0 ? (needsWork / total) * 100 : 0;

  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <div className="w-full flex flex-col-reverse rounded overflow-hidden" style={{ height: 64 }}>
        {total === 0 ? (
          <div className="w-full h-full bg-zinc-800/40" />
        ) : (
          <>
            <div className="w-full bg-emerald-500/80 transition-all" style={{ height: `${pPct}%` }} />
            <div className="w-full bg-zinc-500/60 transition-all" style={{ height: `${nPct}%` }} />
            <div className="w-full bg-amber-500/80 transition-all" style={{ height: `${nwPct}%` }} />
          </>
        )}
      </div>
      <span className="text-[9px] text-zinc-500 text-center">{label}</span>
      {total > 0 && <span className="text-[9px] text-zinc-600">{total}</span>}
    </div>
  );
}

interface WeekBucket {
  weekKey: string;
  positive: number;
  neutral: number;
  needsWork: number;
  total: number;
  healthScore: number | null; // null = not enough data
}

// SVG line chart — renders two lines: health score (%) and normalised obs count
function LineChart({
  buckets,
}: {
  buckets: WeekBucket[];
}) {
  const W = 480;
  const H = 120;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = buckets.length;
  if (n < 2) return null;

  // Health line: only connect points where healthScore !== null
  const healthPoints = buckets.map((b, i) => ({
    x: padL + (i / (n - 1)) * innerW,
    y: b.healthScore !== null ? padT + innerH - (b.healthScore / 100) * innerH : null,
    score: b.healthScore,
    label: weekLabel(b.weekKey),
    total: b.total,
  }));

  // Volume line: normalise to 0–100
  const maxTotal = Math.max(1, ...buckets.map((b) => b.total));
  const volPoints = buckets.map((b, i) => ({
    x: padL + (i / (n - 1)) * innerW,
    y: padT + innerH - (b.total / maxTotal) * innerH,
    total: b.total,
  }));

  // Build SVG path from connected health points (skip nulls)
  function pathFromPoints(
    pts: Array<{ x: number; y: number | null }>,
    smooth = true
  ): string {
    const valid = pts.filter((p) => p.y !== null) as Array<{ x: number; y: number }>;
    if (valid.length < 2) return '';
    let d = `M ${valid[0].x},${valid[0].y}`;
    for (let i = 1; i < valid.length; i++) {
      if (smooth) {
        const prev = valid[i - 1];
        const curr = valid[i];
        const cpx = (prev.x + curr.x) / 2;
        d += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
      } else {
        d += ` L ${valid[i].x},${valid[i].y}`;
      }
    }
    return d;
  }

  // Y-axis labels: 0%, 50%, 100%
  const yLabels = [100, 50, 0];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-visible"
      style={{ height: H }}
      aria-label="Team health score over time"
    >
      {/* Grid lines */}
      {yLabels.map((pct) => {
        const y = padT + innerH - (pct / 100) * innerH;
        return (
          <g key={pct}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y}
              y2={y}
              stroke="#27272a"
              strokeWidth={1}
              strokeDasharray={pct === 0 ? '0' : '4 3'}
            />
            <text x={padL - 4} y={y + 4} fontSize={8} fill="#71717a" textAnchor="end">
              {pct}%
            </text>
          </g>
        );
      })}

      {/* Volume area fill */}
      {volPoints.length >= 2 && (
        <>
          <path
            d={`${pathFromPoints(volPoints)} L ${volPoints[volPoints.length - 1].x},${padT + innerH} L ${volPoints[0].x},${padT + innerH} Z`}
            fill="#F97316"
            fillOpacity={0.06}
          />
          <path
            d={pathFromPoints(volPoints)}
            fill="none"
            stroke="#F97316"
            strokeWidth={1.5}
            strokeOpacity={0.35}
            strokeDasharray="4 3"
          />
        </>
      )}

      {/* Health score line */}
      {pathFromPoints(healthPoints) && (
        <path
          d={pathFromPoints(healthPoints)}
          fill="none"
          stroke="#10b981"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Health score dots */}
      {healthPoints.map((pt, i) =>
        pt.y !== null ? (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={3.5}
            fill={
              pt.score !== null && pt.score >= 70
                ? '#10b981'
                : pt.score !== null && pt.score >= 50
                ? '#F97316'
                : '#f59e0b'
            }
            stroke="#09090b"
            strokeWidth={1.5}
          />
        ) : null
      )}

      {/* X-axis labels */}
      {healthPoints.map((pt, i) => (
        <text
          key={i}
          x={pt.x}
          y={H - 4}
          fontSize={8}
          fill="#52525b"
          textAnchor="middle"
        >
          {pt.label}
        </text>
      ))}
    </svg>
  );
}

// Session-over-session improvement tracking

interface SessionBucket {
  sessionId: string;
  date: string;
  type: string;
  positive: number;
  needsWork: number;
  neutral: number;
  total: number;
  healthScore: number | null;
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  practice: '#F97316',
  game: '#3b82f6',
  scrimmage: '#8b5cf6',
  tournament: '#f59e0b',
  training: '#14b8a6',
};

function SessionTrendChart({ buckets }: { buckets: SessionBucket[] }) {
  const W = 480;
  const H = 120;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const n = buckets.length;
  if (n === 0) return null;

  const maxObs = Math.max(1, ...buckets.map((b) => b.total));

  const points = buckets.map((b, i) => ({
    x: n === 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW,
    y: b.healthScore !== null ? padT + innerH - (b.healthScore / 100) * innerH : null,
    score: b.healthScore,
    label: new Date(b.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    type: b.type,
    total: b.total,
    r: 3.5 + (b.total / maxObs) * 3,
  }));

  function buildPath(pts: Array<{ x: number; y: number | null }>, smooth = true): string {
    const valid = pts.filter((p) => p.y !== null) as Array<{ x: number; y: number }>;
    if (valid.length < 2) return '';
    let d = `M ${valid[0].x},${valid[0].y}`;
    for (let i = 1; i < valid.length; i++) {
      if (smooth) {
        const prev = valid[i - 1];
        const curr = valid[i];
        const cpx = (prev.x + curr.x) / 2;
        d += ` C ${cpx},${prev.y} ${cpx},${curr.y} ${curr.x},${curr.y}`;
      } else {
        d += ` L ${valid[i].x},${valid[i].y}`;
      }
    }
    return d;
  }

  const yLabels = [100, 50, 0];
  const skipN = n > 10 ? Math.ceil(n / 10) : 1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-visible"
      style={{ height: H }}
      aria-label="Session-over-session health score trend"
    >
      {/* Grid lines */}
      {yLabels.map((pct) => {
        const y = padT + innerH - (pct / 100) * innerH;
        return (
          <g key={pct}>
            <line
              x1={padL}
              x2={padL + innerW}
              y1={y}
              y2={y}
              stroke="#27272a"
              strokeWidth={1}
              strokeDasharray={pct === 0 ? '0' : '4 3'}
            />
            <text x={padL - 4} y={y + 4} fontSize={8} fill="#71717a" textAnchor="end">
              {pct}%
            </text>
          </g>
        );
      })}

      {/* Connecting line (purple) */}
      {buildPath(points) && (
        <path
          d={buildPath(points)}
          fill="none"
          stroke="#a855f7"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {/* Dots — sized by observation count, colored by session type */}
      {points.map((pt, i) =>
        pt.y !== null ? (
          <circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={pt.r}
            fill={SESSION_TYPE_COLORS[pt.type] ?? '#71717a'}
            stroke="#09090b"
            strokeWidth={1.5}
          >
            <title>{`${pt.label} · ${pt.type} · ${pt.score !== null ? pt.score + '%' : '—'} · ${pt.total} obs`}</title>
          </circle>
        ) : null
      )}

      {/* X-axis date labels (thinned for dense charts) */}
      {points.map((pt, i) =>
        i % skipN === 0 ? (
          <text key={i} x={pt.x} y={H - 4} fontSize={7} fill="#52525b" textAnchor="middle">
            {pt.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

// Observation Heatmap — player rows × week columns, cell color = observation intensity
function HeatmapGrid({
  players,
  weekKeys,
  playerWeekCounts,
  maxCellCount,
}: {
  players: Pick<Player, 'id' | 'name' | 'jersey_number'>[];
  weekKeys: string[];
  playerWeekCounts: Map<string, Map<string, number>>;
  maxCellCount: number;
}) {
  const CELL = 22;
  const GAP = 3;
  const LABEL_W = 72;
  const HEADER_H = 20;
  const visPlayers = players.slice(0, 14);
  const cols = weekKeys.length;
  const rows = visPlayers.length;
  const totalW = LABEL_W + cols * (CELL + GAP);
  const totalH = HEADER_H + rows * (CELL + GAP);

  if (rows === 0) return null;

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <svg
        viewBox={`0 0 ${totalW} ${totalH}`}
        className="w-full"
        style={{ minWidth: 280, height: Math.min(totalH, 380) }}
        aria-label="Observation attention heatmap — players vs weeks"
      >
        {/* Week column headers */}
        {weekKeys.map((wk, ci) => (
          <text
            key={wk}
            x={LABEL_W + ci * (CELL + GAP) + CELL / 2}
            y={HEADER_H - 4}
            fontSize={7}
            fill="#52525b"
            textAnchor="middle"
          >
            {weekLabel(wk)}
          </text>
        ))}

        {/* Player rows */}
        {visPlayers.map((player, ri) => {
          const y = HEADER_H + ri * (CELL + GAP);
          return (
            <g key={player.id}>
              {/* Truncated first name label */}
              <text
                x={LABEL_W - 5}
                y={y + CELL / 2 + 3.5}
                fontSize={9}
                fill="#a1a1aa"
                textAnchor="end"
              >
                {player.name.split(' ')[0].slice(0, 9)}
              </text>

              {/* Week cells */}
              {weekKeys.map((wk, ci) => {
                const count = playerWeekCounts.get(player.id)?.get(wk) ?? 0;
                // sqrt scale for better visual range at low counts
                const intensity = Math.pow(count / maxCellCount, 0.55);
                const cellFill =
                  count === 0
                    ? '#18181b'
                    : `rgba(249,115,22,${(0.15 + intensity * 0.85).toFixed(2)})`;

                return (
                  <g key={wk}>
                    <rect
                      x={LABEL_W + ci * (CELL + GAP)}
                      y={y}
                      width={CELL}
                      height={CELL}
                      rx={4}
                      fill={cellFill}
                    >
                      <title>{`${player.name} · ${weekLabel(wk)}: ${count} obs`}</title>
                    </rect>
                    {count > 0 && (
                      <text
                        x={LABEL_W + ci * (CELL + GAP) + CELL / 2}
                        y={y + CELL / 2 + 3.5}
                        fontSize={count >= 10 ? 6.5 : 7.5}
                        fill={intensity > 0.5 ? '#fff' : '#d4d4d8'}
                        textAnchor="middle"
                        style={{ pointerEvents: 'none', userSelect: 'none' }}
                      >
                        {count}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Colour scale legend */}
      <div className="flex items-center gap-2 mt-2 text-[10px] text-zinc-500">
        <span>Few</span>
        <div className="flex gap-0.5">
          {[0.08, 0.25, 0.45, 0.65, 0.85, 1.0].map((a) => (
            <div
              key={a}
              className="rounded-sm"
              style={{
                width: 14,
                height: 10,
                background: a === 0.08 ? '#18181b' : `rgba(249,115,22,${a.toFixed(2)})`,
              }}
            />
          ))}
        </div>
        <span>Many</span>
        <span className="ml-auto text-zinc-600 italic">
          Hover a cell to see exact count
        </span>
      </div>

      {players.length > 14 && (
        <p className="text-[10px] text-zinc-600 text-center mt-1">
          Showing top 14 players by total observations · {players.length - 14} more not shown
        </p>
      )}
    </div>
  );
}

// --- Practice-to-Game Transfer Score ---

interface TransferStats {
  playerId: string;
  playerName: string;
  practiceScore: number | null;
  gameScore: number | null;
  delta: number | null;
}

const PRACTICE_SESSION_TYPES = new Set(['practice', 'training']);
const GAME_SESSION_TYPES = new Set(['game', 'scrimmage', 'tournament']);

function TransferDeltaBadge({ delta }: { delta: number }) {
  const color = delta >= 0 ? 'text-emerald-400' : delta >= -10 ? 'text-amber-400' : 'text-red-400';
  return (
    <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${color}`}>
      {delta >= 0 ? '+' : ''}{delta}pp
    </span>
  );
}

function TransferPlayerRow({ row }: { row: TransferStats }) {
  const gameBarColor =
    row.delta === null ? '#6366f1'
      : row.delta >= 0 ? '#10b981'
      : row.delta >= -10 ? '#f59e0b'
      : '#ef4444';
  return (
    <div className="grid grid-cols-[1fr,auto] items-center gap-3">
      <div>
        <p className="text-xs font-medium text-zinc-300 mb-1 truncate">{row.playerName}</p>
        {row.practiceScore !== null && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-indigo-400 w-10 shrink-0">Practice</span>
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${row.practiceScore}%` }} />
            </div>
            <span className="text-[9px] text-zinc-500 w-7 text-right tabular-nums">{row.practiceScore}%</span>
          </div>
        )}
        {row.gameScore !== null && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] text-blue-400 w-10 shrink-0">Game</span>
            <div className="flex-1 bg-zinc-800 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${row.gameScore}%`, background: gameBarColor }} />
            </div>
            <span className="text-[9px] text-zinc-500 w-7 text-right tabular-nums">{row.gameScore}%</span>
          </div>
        )}
      </div>
      {row.delta !== null && <TransferDeltaBadge delta={row.delta} />}
    </div>
  );
}

function TransferScoreChart({
  rows,
  teamPracticeScore,
  teamGameScore,
  teamDelta,
}: {
  rows: TransferStats[];
  teamPracticeScore: number | null;
  teamGameScore: number | null;
  teamDelta: number | null;
}) {
  const hasBothTeam = teamPracticeScore !== null && teamGameScore !== null;
  const playerRowsWithBoth = rows.filter((r) => r.practiceScore !== null && r.gameScore !== null);

  if (!hasBothTeam && playerRowsWithBoth.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <ArrowRight className="h-8 w-8 text-zinc-700 mb-2" />
        <p className="text-xs text-zinc-500">
          Capture observations in both practice and game sessions to see transfer scores.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Team aggregate row */}
      {hasBothTeam && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 space-y-1.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-zinc-300">Team Average</span>
            {teamDelta !== null && <TransferDeltaBadge delta={teamDelta} />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-indigo-400 w-10 shrink-0">Practice</span>
            <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${teamPracticeScore}%` }} />
            </div>
            <span className="text-[9px] text-zinc-500 w-7 text-right tabular-nums">{teamPracticeScore}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-blue-400 w-10 shrink-0">Game</span>
            <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${teamGameScore}%`,
                  background: teamDelta !== null && teamDelta >= 0 ? '#10b981' : teamDelta !== null && teamDelta >= -10 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span className="text-[9px] text-zinc-500 w-7 text-right tabular-nums">{teamGameScore}%</span>
          </div>
        </div>
      )}

      {/* Per-player rows */}
      {playerRowsWithBoth.length > 0 && (
        <div className="space-y-3">
          {playerRowsWithBoth.slice(0, 10).map((row) => (
            <TransferPlayerRow key={row.playerId} row={row} />
          ))}
          {playerRowsWithBoth.length > 10 && (
            <p className="text-[10px] text-zinc-600 text-center">
              +{playerRowsWithBoth.length - 10} more players not shown
            </p>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-500 border-t border-zinc-800 pt-2">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-indigo-500" /> Practice
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-emerald-500" /> Game (better)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-amber-500" /> Game (slight drop)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-red-500" /> Game (sharp drop)
        </span>
        <span className="ml-auto text-zinc-600 italic">Min 3 obs per session type</span>
      </div>
    </div>
  );
}

// ── Export menu ──────────────────────────────────────────────────────────────

// ─── Share Stats Modal ────────────────────────────────────────────────────────

interface ShareStats {
  teamName: string;
  season: string | null;
  currentWeek: number;
  healthScore: number;
  healthTrend: 'up' | 'down' | 'flat';
  totalObs: number;
  totalPlayers: number;
  totalSessions: number;
  positiveObs: number;
  topStrengths: string[];
  topFocusAreas: string[];
}

function ShareStatsModal({ stats, onClose }: { stats: ShareStats; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const trendLabel = stats.healthTrend === 'up' ? '↑ Improving' : stats.healthTrend === 'down' ? '↓ Declining' : '→ Stable';
  const trendColor = stats.healthTrend === 'up' ? '#10b981' : stats.healthTrend === 'down' ? '#f87171' : '#a1a1aa';

  const shareText = [
    `🏆 ${stats.teamName} — Season ${stats.season ?? 'Stats'}`,
    ``,
    `📊 Health Score: ${stats.healthScore}% (${trendLabel})`,
    `👁 ${stats.totalObs.toLocaleString()} observations captured`,
    `👥 ${stats.totalPlayers} players coached`,
    `📅 ${stats.totalSessions} sessions completed`,
    stats.topStrengths.length > 0 ? `⭐ Strengths: ${stats.topStrengths.join(', ')}` : null,
    stats.topFocusAreas.length > 0 ? `🎯 Focus areas: ${stats.topFocusAreas.join(', ')}` : null,
    ``,
    `Tracked with SportsIQ #CoachSmarter`,
  ].filter(Boolean).join('\n');

  async function handleShare() {
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({ title: `${stats.teamName} Season Stats`, text: shareText });
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      } catch {
        // user cancelled or share failed — fall through to copy
        handleCopy();
      }
    } else {
      handleCopy();
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  const healthRingColor = stats.healthScore >= 70 ? '#10b981' : stats.healthScore >= 50 ? '#F97316' : '#f59e0b';
  const ringR = 36;
  const ringCirc = 2 * Math.PI * ringR;
  const ringOffset = ringCirc * (1 - Math.min(1, stats.healthScore / 100));

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share Season Stats"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">
          {/* Modal header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
            <span className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <Share2 className="h-4 w-4 text-orange-500" />
              Share Season Stats
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors touch-manipulation"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Card preview */}
          <div className="p-4">
            <div className="rounded-xl overflow-hidden border border-zinc-700 bg-zinc-900">
              {/* Card orange header */}
              <div className="bg-gradient-to-r from-orange-600 to-orange-500 px-4 py-3">
                <p className="text-xs font-semibold text-orange-100 uppercase tracking-wider">Season Report</p>
                <p className="text-lg font-bold text-white truncate">{stats.teamName}</p>
                <p className="text-xs text-orange-100">
                  {stats.season ? `Season ${stats.season}` : 'This Season'} · Week {stats.currentWeek}
                </p>
              </div>

              {/* Card body */}
              <div className="p-4 space-y-4">
                {/* Health score + stats row */}
                <div className="flex items-center gap-4">
                  {/* Mini ring */}
                  <div className="relative shrink-0" style={{ width: 80, height: 80 }}>
                    <svg width={80} height={80} className="-rotate-90">
                      <circle cx={40} cy={40} r={ringR} fill="none" stroke="#27272a" strokeWidth={8} />
                      <circle
                        cx={40} cy={40} r={ringR}
                        fill="none"
                        stroke={healthRingColor}
                        strokeWidth={8}
                        strokeDasharray={ringCirc}
                        strokeDashoffset={ringOffset}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-lg font-bold text-zinc-100 leading-none">{stats.healthScore}%</span>
                      <span className="text-[9px] text-zinc-400 leading-none mt-0.5">health</span>
                    </div>
                  </div>

                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-orange-400">{stats.totalObs.toLocaleString()}</p>
                      <p className="text-[9px] text-zinc-500">observations</p>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-zinc-100">{stats.totalPlayers}</p>
                      <p className="text-[9px] text-zinc-500">players</p>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold text-zinc-100">{stats.totalSessions}</p>
                      <p className="text-[9px] text-zinc-500">sessions</p>
                    </div>
                    <div className="bg-zinc-800/60 rounded-lg p-2 text-center">
                      <p className="text-lg font-bold leading-none" style={{ color: trendColor }}>
                        {trendLabel.split(' ')[1]}
                      </p>
                      <p className="text-[9px] text-zinc-500">trend</p>
                    </div>
                  </div>
                </div>

                {/* Strengths */}
                {stats.topStrengths.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Top Strengths</p>
                    <div className="flex flex-wrap gap-1">
                      {stats.topStrengths.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 capitalize">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Focus areas */}
                {stats.topFocusAreas.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider mb-1">Focus Areas</p>
                    <div className="flex flex-wrap gap-1">
                      {stats.topFocusAreas.map((s) => (
                        <span key={s} className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/15 text-amber-300 border border-amber-500/20 capitalize">
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Branding */}
                <p className="text-[10px] text-zinc-600 text-right">Tracked with SportsIQ</p>
              </div>
            </div>
          </div>

          {/* Share / copy actions */}
          <div className="px-4 pb-4 flex gap-2">
            {'share' in (typeof navigator !== 'undefined' ? navigator : {}) ? (
              <Button
                className="flex-1 gap-2 bg-orange-500 hover:bg-orange-600 text-white touch-manipulation active:scale-[0.98]"
                onClick={handleShare}
              >
                {shared ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
                {shared ? 'Shared!' : 'Share'}
              </Button>
            ) : null}
            <Button
              variant="outline"
              className="flex-1 gap-2 touch-manipulation active:scale-[0.98]"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied!' : 'Copy Stats'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

type ExportType = 'observations' | 'roster' | 'sessions';

const EXPORT_OPTIONS: { type: ExportType; label: string }[] = [
  { type: 'observations', label: 'Observations CSV' },
  { type: 'roster', label: 'Roster CSV' },
  { type: 'sessions', label: 'Sessions CSV' },
];

function ExportMenu({ teamId }: { teamId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<ExportType | null>(null);

  async function handleExport(type: ExportType) {
    setLoading(type);
    setOpen(false);
    try {
      const res = await fetch(`/api/export?type=${type}&team_id=${encodeURIComponent(teamId)}`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `${type}-export.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user will see no download
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 shrink-0"
        onClick={() => setOpen((v) => !v)}
        disabled={loading !== null}
        aria-label="Export data"
      >
        <Download className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{loading ? 'Exporting…' : 'Export'}</span>
        <ChevronDown className="h-3 w-3 text-zinc-400" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-zinc-800 bg-zinc-900 shadow-xl py-1">
            {EXPORT_OPTIONS.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleExport(type)}
                className="w-full text-left px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { activeTeam } = useActiveTeam();
  const [showShare, setShowShare] = useState(false);

  const { data: observations = [], isLoading: obsLoading } = useQuery({
    queryKey: ['analytics-observations', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Observation[]>({
        table: 'observations',
        select: 'id, player_id, sentiment, category, skill_id, session_id, created_at',
        filters: { team_id: activeTeam.id },
        order: { column: 'created_at', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: players = [], isLoading: playersLoading } = useQuery({
    queryKey: ['analytics-players', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Pick<Player, 'id' | 'name' | 'position' | 'jersey_number'>[]>({
        table: 'players',
        select: 'id, name, position, jersey_number',
        filters: { team_id: activeTeam.id, is_active: true },
        order: { column: 'name', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ['analytics-sessions', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const data = await query<Pick<Session, 'id' | 'type' | 'date'>[]>({
        table: 'sessions',
        select: 'id, type, date',
        filters: { team_id: activeTeam.id },
        order: { column: 'date', ascending: false },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    staleTime: 5 * 60 * 1000,
  });

  const isLoading = obsLoading || playersLoading || sessionsLoading;

  // ── Derived analytics ──────────────────────────────────────────────────────

  const analytics = useMemo(() => {
    const total = observations.length;
    const positive = observations.filter((o) => o.sentiment === 'positive').length;
    const needsWork = observations.filter((o) => o.sentiment === 'needs-work').length;
    const neutral = observations.filter((o) => o.sentiment === 'neutral').length;

    // Health score: positive / (positive + needsWork), ignore neutral
    const scored = positive + needsWork;
    const healthScore = scored > 0 ? Math.round((positive / scored) * 100) : 0;

    // Last 30 days vs prior 30 days trend
    const now = Date.now();
    const day = 86400000;
    const last30 = observations.filter((o) => now - new Date(o.created_at).getTime() < 30 * day);
    const prior30 = observations.filter((o) => {
      const age = now - new Date(o.created_at).getTime();
      return age >= 30 * day && age < 60 * day;
    });
    const last30Scored = last30.filter((o) => o.sentiment !== 'neutral');
    const last30Health =
      last30Scored.length > 0
        ? Math.round((last30.filter((o) => o.sentiment === 'positive').length / last30Scored.length) * 100)
        : null;
    const prior30Scored = prior30.filter((o) => o.sentiment !== 'neutral');
    const prior30Health =
      prior30Scored.length > 0
        ? Math.round((prior30.filter((o) => o.sentiment === 'positive').length / prior30Scored.length) * 100)
        : null;

    let healthTrend: 'up' | 'down' | 'flat' = 'flat';
    if (last30Health !== null && prior30Health !== null) {
      const delta = last30Health - prior30Health;
      if (delta >= 5) healthTrend = 'up';
      else if (delta <= -5) healthTrend = 'down';
    }

    // Weekly buckets — last 8 weeks
    const weekKeys: string[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now - i * 7 * day);
      weekKeys.push(getISOWeekKey(d));
    }
    const uniqueWeekKeys = [...new Set(weekKeys)];

    const weekBuckets: WeekBucket[] = uniqueWeekKeys.map((wk) => ({
      weekKey: wk,
      positive: 0,
      neutral: 0,
      needsWork: 0,
      total: 0,
      healthScore: null,
    }));
    const weekMap = new Map(weekBuckets.map((b) => [b.weekKey, b]));

    observations.forEach((o) => {
      const wk = getISOWeekKey(new Date(o.created_at));
      const bucket = weekMap.get(wk);
      if (bucket) {
        bucket.total++;
        if (o.sentiment === 'positive') bucket.positive++;
        else if (o.sentiment === 'needs-work') bucket.needsWork++;
        else bucket.neutral++;
      }
    });

    // Compute per-week health score (positive / scored, null if no scored obs)
    weekBuckets.forEach((b) => {
      const scored = b.positive + b.needsWork;
      b.healthScore = scored > 0 ? Math.round((b.positive / scored) * 100) : null;
    });

    // Player observation counts
    const playerCounts = new Map<string, { positive: number; needsWork: number; neutral: number; total: number }>();
    players.forEach((p) => {
      playerCounts.set(p.id, { positive: 0, needsWork: 0, neutral: 0, total: 0 });
    });
    observations.forEach((o) => {
      if (o.player_id) {
        const c = playerCounts.get(o.player_id);
        if (c) {
          c.total++;
          if (o.sentiment === 'positive') c.positive++;
          else if (o.sentiment === 'needs-work') c.needsWork++;
          else c.neutral++;
        }
      }
    });
    const maxPlayerObs = Math.max(1, ...Array.from(playerCounts.values()).map((c) => c.total));

    // Player × week attention heatmap
    const playerWeekCounts = new Map<string, Map<string, number>>();
    players.forEach((p) => {
      playerWeekCounts.set(p.id, new Map(uniqueWeekKeys.map((wk) => [wk, 0])));
    });
    observations.forEach((o) => {
      if (!o.player_id) return;
      const pw = playerWeekCounts.get(o.player_id);
      if (!pw) return;
      const wk = getISOWeekKey(new Date(o.created_at));
      if (pw.has(wk)) pw.set(wk, (pw.get(wk) ?? 0) + 1);
    });
    const maxCellCount = Math.max(
      1,
      ...Array.from(playerWeekCounts.values()).flatMap((m) => Array.from(m.values()))
    );

    // Category breakdown
    const categoryCounts = new Map<string, { positive: number; needsWork: number; neutral: number; total: number }>();
    observations.forEach((o) => {
      if (!o.category) return;
      if (!categoryCounts.has(o.category)) {
        categoryCounts.set(o.category, { positive: 0, needsWork: 0, neutral: 0, total: 0 });
      }
      const c = categoryCounts.get(o.category)!;
      c.total++;
      if (o.sentiment === 'positive') c.positive++;
      else if (o.sentiment === 'needs-work') c.needsWork++;
      else c.neutral++;
    });
    const sortedCategories = [...categoryCounts.entries()]
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.total - a.total);
    const maxCategoryTotal = Math.max(1, ...sortedCategories.map((c) => c.total));

    // Top needs-work areas (category)
    const needsWorkByCategory = sortedCategories
      .filter((c) => c.needsWork > 0)
      .sort((a, b) => b.needsWork - a.needsWork)
      .slice(0, 5);

    // Session-over-session health trend — last 20 sessions that have observations
    const sessionObsMap = new Map<string, { positive: number; needsWork: number; neutral: number; total: number }>();
    observations.forEach((o) => {
      if (!o.session_id) return;
      if (!sessionObsMap.has(o.session_id)) {
        sessionObsMap.set(o.session_id, { positive: 0, needsWork: 0, neutral: 0, total: 0 });
      }
      const s = sessionObsMap.get(o.session_id)!;
      s.total++;
      if (o.sentiment === 'positive') s.positive++;
      else if (o.sentiment === 'needs-work') s.needsWork++;
      else s.neutral++;
    });

    const sessionTrend: SessionBucket[] = sessions
      .filter((s) => sessionObsMap.has(s.id))
      .map((s) => {
        const counts = sessionObsMap.get(s.id)!;
        const scored = counts.positive + counts.needsWork;
        return {
          sessionId: s.id,
          date: s.date,
          type: s.type,
          ...counts,
          healthScore: scored > 0 ? Math.round((counts.positive / scored) * 100) : null,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-20);

    // Practice-to-game transfer score
    const sessionTypeMap = new Map(sessions.map((s) => [s.id, s.type]));

    const playerPracticeGame = new Map<
      string,
      { practice: { pos: number; nw: number }; game: { pos: number; nw: number } }
    >();
    players.forEach((p) => {
      playerPracticeGame.set(p.id, {
        practice: { pos: 0, nw: 0 },
        game: { pos: 0, nw: 0 },
      });
    });

    let teamPracticePos = 0, teamPracticeNW = 0;
    let teamGamePos = 0, teamGameNW = 0;

    observations.forEach((o) => {
      if (!o.session_id || o.sentiment === 'neutral') return;
      const st = sessionTypeMap.get(o.session_id);
      if (!st) return;
      const isPractice = PRACTICE_SESSION_TYPES.has(st);
      const isGame = GAME_SESSION_TYPES.has(st);
      if (!isPractice && !isGame) return;
      const isPos = o.sentiment === 'positive';

      if (isPractice) {
        teamPracticePos += isPos ? 1 : 0;
        teamPracticeNW += isPos ? 0 : 1;
      } else {
        teamGamePos += isPos ? 1 : 0;
        teamGameNW += isPos ? 0 : 1;
      }

      if (o.player_id) {
        const bucket = playerPracticeGame.get(o.player_id);
        if (bucket) {
          if (isPractice) {
            if (isPos) bucket.practice.pos++; else bucket.practice.nw++;
          } else {
            if (isPos) bucket.game.pos++; else bucket.game.nw++;
          }
        }
      }
    });

    const MIN_TRANSFER_OBS = 3;
    const transferScores: TransferStats[] = players
      .map((p) => {
        const b = playerPracticeGame.get(p.id)!;
        const practiceScored = b.practice.pos + b.practice.nw;
        const gameScored = b.game.pos + b.game.nw;
        const practiceScore = practiceScored >= MIN_TRANSFER_OBS
          ? Math.round((b.practice.pos / practiceScored) * 100) : null;
        const gameScore = gameScored >= MIN_TRANSFER_OBS
          ? Math.round((b.game.pos / gameScored) * 100) : null;
        const delta = practiceScore !== null && gameScore !== null ? gameScore - practiceScore : null;
        return { playerId: p.id, playerName: p.name, practiceScore, gameScore, delta };
      })
      .filter((r) => r.practiceScore !== null || r.gameScore !== null)
      .sort((a, b) => {
        if (a.delta !== null && b.delta !== null) return b.delta - a.delta;
        if (a.delta !== null) return -1;
        if (b.delta !== null) return 1;
        return 0;
      });

    const teamPracticeScore = (teamPracticePos + teamPracticeNW) >= 5
      ? Math.round((teamPracticePos / (teamPracticePos + teamPracticeNW)) * 100) : null;
    const teamGameScore = (teamGamePos + teamGameNW) >= 5
      ? Math.round((teamGamePos / (teamGamePos + teamGameNW)) * 100) : null;
    const teamTransferDelta = teamPracticeScore !== null && teamGameScore !== null
      ? teamGameScore - teamPracticeScore : null;

    return {
      total,
      positive,
      needsWork,
      neutral,
      healthScore,
      healthTrend,
      last30Health,
      weekBuckets,
      heatmapWeekKeys: uniqueWeekKeys,
      playerCounts,
      maxPlayerObs,
      playerWeekCounts,
      maxCellCount,
      sortedCategories,
      maxCategoryTotal,
      needsWorkByCategory,
      sessionTrend,
      transferScores,
      teamPracticeScore,
      teamGameScore,
      teamTransferDelta,
    };
  }, [observations, players, sessions]);

  if (!activeTeam) {
    return (
      <div className="flex items-center justify-center p-8 min-h-[60vh]">
        <p className="text-zinc-400">Select a team to view analytics</p>
      </div>
    );
  }

  const TrendIcon =
    analytics.healthTrend === 'up'
      ? TrendingUp
      : analytics.healthTrend === 'down'
      ? TrendingDown
      : Minus;
  const trendColor =
    analytics.healthTrend === 'up'
      ? 'text-emerald-400'
      : analytics.healthTrend === 'down'
      ? 'text-red-400'
      : 'text-zinc-400';

  const healthRingColor =
    analytics.healthScore >= 70
      ? '#10b981'
      : analytics.healthScore >= 50
      ? '#F97316'
      : '#f59e0b';

  const shareStats: ShareStats = {
    teamName: activeTeam.name,
    season: activeTeam.season ?? null,
    currentWeek: activeTeam.current_week,
    healthScore: analytics.healthScore,
    healthTrend: analytics.healthTrend,
    totalObs: analytics.total,
    totalPlayers: players.length,
    totalSessions: sessions.length,
    positiveObs: analytics.positive,
    topStrengths: analytics.sortedCategories
      .filter((c) => c.positive > 0)
      .sort((a, b) => b.positive - a.positive)
      .slice(0, 3)
      .map((c) => c.name),
    topFocusAreas: analytics.needsWorkByCategory.slice(0, 2).map((c) => c.name),
  };

  return (
    <UpgradeGate feature="analytics" featureLabel="Team Analytics">
    {showShare && <ShareStatsModal stats={shareStats} onClose={() => setShowShare(false)} />}
    <div className="p-4 lg:p-8 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team Analytics</h1>
          <p className="text-zinc-400 text-sm">
            {activeTeam.name} &middot; Season {activeTeam.season || 'N/A'} &middot; Week{' '}
            {activeTeam.current_week}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setShowShare(true)}
            disabled={isLoading || analytics.total === 0}
            aria-label="Share season stats"
          >
            <Share2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Share</span>
          </Button>
          <ExportMenu teamId={activeTeam.id} />
        </div>
      </div>

      {/* Top stats row */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Health Score */}
          <Card className="col-span-2 md:col-span-1">
            <CardContent className="flex flex-col items-center justify-center p-4 gap-2">
              <ProgressRing value={analytics.healthScore} color={healthRingColor} size={88} stroke={9}>
                <span className="text-xl font-bold text-zinc-100">{analytics.healthScore}%</span>
              </ProgressRing>
              <div className="text-center">
                <p className="text-xs font-medium text-zinc-300">Health Score</p>
                <div className={`flex items-center justify-center gap-1 mt-0.5 ${trendColor}`}>
                  <TrendIcon className="h-3 w-3" />
                  <span className="text-[10px] font-medium">
                    {analytics.healthTrend === 'flat' ? 'Stable' : analytics.healthTrend === 'up' ? 'Improving' : 'Declining'}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Observations */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 gap-1 h-full">
              <Eye className="h-6 w-6 text-orange-500" />
              <p className="text-3xl font-bold text-orange-500">{analytics.total}</p>
              <p className="text-xs text-zinc-400 text-center">Total Observations</p>
            </CardContent>
          </Card>

          {/* Players */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 gap-1 h-full">
              <Users className="h-6 w-6 text-blue-500" />
              <p className="text-3xl font-bold text-blue-500">{players.length}</p>
              <p className="text-xs text-zinc-400 text-center">Active Players</p>
            </CardContent>
          </Card>

          {/* Sessions */}
          <Card>
            <CardContent className="flex flex-col items-center justify-center p-4 gap-1 h-full">
              <Calendar className="h-6 w-6 text-purple-500" />
              <p className="text-3xl font-bold text-purple-500">{sessions.length}</p>
              <p className="text-xs text-zinc-400 text-center">Sessions</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Sentiment breakdown strip */}
      {!isLoading && analytics.total > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">Sentiment Breakdown</p>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Positive
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
                  Neutral
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                  Needs Work
                </span>
              </div>
            </div>
            {/* Stacked bar strip */}
            <div className="flex h-5 w-full overflow-hidden rounded-full">
              {analytics.total > 0 && (
                <>
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(analytics.positive / analytics.total) * 100}%` }}
                  />
                  <div
                    className="bg-zinc-500 transition-all"
                    style={{ width: `${(analytics.neutral / analytics.total) * 100}%` }}
                  />
                  <div
                    className="bg-amber-500 transition-all"
                    style={{ width: `${(analytics.needsWork / analytics.total) * 100}%` }}
                  />
                </>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-lg font-bold text-emerald-400">{analytics.positive}</p>
                <p className="text-[10px] text-zinc-500">
                  {analytics.total > 0
                    ? `${Math.round((analytics.positive / analytics.total) * 100)}%`
                    : '—'}{' '}
                  Positive
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-400">{analytics.neutral}</p>
                <p className="text-[10px] text-zinc-500">
                  {analytics.total > 0
                    ? `${Math.round((analytics.neutral / analytics.total) * 100)}%`
                    : '—'}{' '}
                  Neutral
                </p>
              </div>
              <div>
                <p className="text-lg font-bold text-amber-400">{analytics.needsWork}</p>
                <p className="text-[10px] text-zinc-500">
                  {analytics.total > 0
                    ? `${Math.round((analytics.needsWork / analytics.total) * 100)}%`
                    : '—'}{' '}
                  Needs Work
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Weekly trend */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-orange-400" />
            8-Week Observation Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : (
            <div className="flex items-end gap-1.5">
              {analytics.weekBuckets.map((bucket) => (
                <StackedBar
                  key={bucket.weekKey}
                  positive={bucket.positive}
                  neutral={bucket.neutral}
                  needsWork={bucket.needsWork}
                  total={bucket.total}
                  label={weekLabel(bucket.weekKey)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Health score line chart */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <LineChartIcon className="h-4 w-4 text-emerald-400" />
            Team Health Score Over Time
            <Badge variant="secondary" className="text-[10px]">
              8 weeks
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : analytics.weekBuckets.some((b) => b.healthScore !== null) ? (
            <>
              <LineChart buckets={analytics.weekBuckets} />
              {/* Legend */}
              <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2 w-5 rounded-full bg-emerald-500" />
                  Health score %
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-5 rounded-full bg-orange-500/50" style={{ borderTop: '1.5px dashed #F97316' }} />
                  Observation volume
                </span>
                <span className="ml-auto text-zinc-600">
                  {(() => {
                    const withData = analytics.weekBuckets.filter((b) => b.healthScore !== null);
                    if (withData.length < 2) return null;
                    const first = withData[0].healthScore!;
                    const last = withData[withData.length - 1].healthScore!;
                    const delta = last - first;
                    if (Math.abs(delta) < 3) return 'Stable';
                    return delta > 0
                      ? `+${delta}pp over ${withData.length} weeks`
                      : `${delta}pp over ${withData.length} weeks`;
                  })()}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <LineChartIcon className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-xs text-zinc-500">
                Capture observations with positive/needs-work sentiment to track health score trends.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Session-over-session improvement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart2 className="h-4 w-4 text-purple-400" />
            Session Improvement Trend
            {!isLoading && analytics.sessionTrend.length > 0 && (
              <Badge variant="secondary" className="text-[10px]">
                last {analytics.sessionTrend.length} session{analytics.sessionTrend.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : analytics.sessionTrend.length < 2 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BarChart2 className="h-8 w-8 text-zinc-700 mb-2" />
              <p className="text-xs text-zinc-500">
                Capture observations in at least 2 sessions to track session-over-session improvement.
              </p>
            </div>
          ) : (
            <>
              <SessionTrendChart buckets={analytics.sessionTrend} />
              {/* Legend + trend delta */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
                {Object.entries(SESSION_TYPE_COLORS).map(([type, color]) =>
                  analytics.sessionTrend.some((b) => b.type === type) ? (
                    <span key={type} className="flex items-center gap-1 capitalize">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: color }}
                      />
                      {type}
                    </span>
                  ) : null
                )}
                <span className="ml-auto text-zinc-600 italic">Dot size = obs count</span>
                {(() => {
                  const withData = analytics.sessionTrend.filter((b) => b.healthScore !== null);
                  if (withData.length < 2) return null;
                  const first = withData[0].healthScore!;
                  const last = withData[withData.length - 1].healthScore!;
                  const delta = last - first;
                  if (Math.abs(delta) < 3) return <span className="text-zinc-500">Stable across sessions</span>;
                  return (
                    <span className={delta > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {delta > 0 ? '+' : ''}{delta}pp since first session
                    </span>
                  );
                })()}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Practice → Game Transfer Score */}
      <Card className="border-indigo-500/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-indigo-400" />
            Practice → Game Transfer
            <Badge variant="secondary" className="text-[10px]">positive % by session type</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-2">
          <p className="text-[10px] text-zinc-500 mb-3">
            Compares each player&apos;s health score in practice vs competitive sessions — positive delta means skills are transferring.
          </p>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded" />
              ))}
            </div>
          ) : (
            <TransferScoreChart
              rows={analytics.transferScores}
              teamPracticeScore={analytics.teamPracticeScore}
              teamGameScore={analytics.teamGameScore}
              teamDelta={analytics.teamTransferDelta}
            />
          )}
        </CardContent>
      </Card>

      {/* Observation Heatmap */}
      {!isLoading && players.length > 0 && analytics.total > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <LayoutGrid className="h-4 w-4 text-orange-400" />
              Attention Heatmap
              <Badge variant="secondary" className="text-[10px]">
                player × week
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1">
            <p className="text-[10px] text-zinc-500 mb-3">
              Observation count per player per week — spot players who haven&apos;t received recent attention.
            </p>
            <HeatmapGrid
              players={[...players].sort((a, b) => {
                const ac = analytics.playerCounts.get(a.id)?.total ?? 0;
                const bc = analytics.playerCounts.get(b.id)?.total ?? 0;
                return bc - ac;
              })}
              weekKeys={analytics.heatmapWeekKeys}
              playerWeekCounts={analytics.playerWeekCounts}
              maxCellCount={analytics.maxCellCount}
            />
          </CardContent>
        </Card>
      )}

      {/* Two-column: Player attention + Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Player Attention */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-400" />
              Player Attention
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : players.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">No players on roster</p>
            ) : (
              [...players]
                .sort((a, b) => {
                  const ac = analytics.playerCounts.get(a.id)?.total ?? 0;
                  const bc = analytics.playerCounts.get(b.id)?.total ?? 0;
                  return bc - ac;
                })
                .slice(0, 10)
                .map((player) => {
                  const counts = analytics.playerCounts.get(player.id) ?? {
                    total: 0, positive: 0, needsWork: 0, neutral: 0,
                  };
                  const pct = (counts.total / analytics.maxPlayerObs) * 100;
                  const positivePct = counts.total > 0 ? (counts.positive / counts.total) * 100 : 0;

                  const barColor =
                    counts.total === 0
                      ? 'bg-zinc-700'
                      : positivePct >= 70
                      ? 'bg-emerald-500'
                      : positivePct >= 40
                      ? 'bg-orange-500'
                      : 'bg-amber-500';

                  return (
                    <div key={player.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] text-zinc-600 shrink-0">
                            #{player.jersey_number ?? '?'}
                          </span>
                          <span className="text-xs font-medium text-zinc-300 truncate">
                            {player.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-zinc-500 shrink-0 ml-2">
                          {counts.total} obs
                        </span>
                      </div>
                      <div className="h-1.5 w-full rounded-full bg-zinc-800">
                        <div
                          className={`h-1.5 rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.max(2, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
            {!isLoading && players.length > 10 && (
              <p className="text-[10px] text-zinc-600 text-center pt-1">
                +{players.length - 10} more players
              </p>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Target className="h-4 w-4 text-emerald-400" />
              Skill Category Coverage
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full rounded" />
                ))}
              </div>
            ) : analytics.sortedCategories.length === 0 ? (
              <p className="text-xs text-zinc-500 text-center py-4">No observations yet</p>
            ) : (
              analytics.sortedCategories.map((cat) => {
                const pct = (cat.total / analytics.maxCategoryTotal) * 100;
                const posPct = cat.total > 0 ? Math.round((cat.positive / cat.total) * 100) : 0;

                return (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-zinc-300 capitalize">{cat.name}</span>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                        <span className="text-emerald-400">{posPct}% pos</span>
                        <span>{cat.total} obs</span>
                      </div>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 flex overflow-hidden">
                      <div
                        className="h-full bg-emerald-500/80 transition-all"
                        style={{ width: `${(cat.positive / analytics.maxCategoryTotal) * 100}%` }}
                      />
                      <div
                        className="h-full bg-zinc-500/60 transition-all"
                        style={{ width: `${(cat.neutral / analytics.maxCategoryTotal) * 100}%` }}
                      />
                      <div
                        className="h-full bg-amber-500/80 transition-all"
                        style={{ width: `${(cat.needsWork / analytics.maxCategoryTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Focus Areas: Top Needs-Work Categories */}
      {!isLoading && analytics.needsWorkByCategory.length > 0 && (
        <Card className="border-amber-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              Top Focus Areas
              <Badge variant="secondary" className="text-[10px]">
                Most needs-work observations
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {analytics.needsWorkByCategory.map((cat, i) => {
                const rank = i + 1;
                const rankColor = rank === 1 ? 'text-amber-400' : rank === 2 ? 'text-zinc-400' : 'text-zinc-600';
                return (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                  >
                    <span className={`text-xl font-bold tabular-nums ${rankColor}`}>#{rank}</span>
                    <div>
                      <p className="text-sm font-medium text-zinc-200 capitalize">{cat.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {cat.needsWork} needs-work &middot; {cat.total} total obs
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positive highlights: top positive areas */}
      {!isLoading && analytics.sortedCategories.filter((c) => c.positive > 0).length > 0 && (
        <Card className="border-emerald-500/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              Strengths
              <Badge variant="secondary" className="text-[10px]">
                Top positive areas
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {analytics.sortedCategories
                .filter((c) => c.positive > 0)
                .sort((a, b) => b.positive - a.positive)
                .slice(0, 3)
                .map((cat, i) => (
                  <div
                    key={cat.name}
                    className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3"
                  >
                    <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-zinc-200 capitalize">{cat.name}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {cat.positive} positive &middot;{' '}
                        {cat.total > 0 ? Math.round((cat.positive / cat.total) * 100) : 0}% pos rate
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && analytics.total === 0 && (
        <Card className="border-dashed border-zinc-700">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Activity className="h-12 w-12 text-zinc-600 mb-4" />
            <h3 className="text-lg font-semibold text-zinc-300">No observations yet</h3>
            <p className="text-zinc-500 text-sm mt-2 max-w-sm">
              Start capturing observations during practice or games — analytics will appear here as
              data comes in.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
    </UpgradeGate>
  );
}
