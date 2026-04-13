'use client';

import { ArrowRight } from 'lucide-react';
import type { TransferStats } from './chart-utils';

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

export default function TransferScoreChart({
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
