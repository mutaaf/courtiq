'use client';

import type { Player } from '@/types/database';
import { weekLabel } from './chart-utils';

// Observation Heatmap — player rows × week columns, cell color = observation intensity
export default function HeatmapGrid({
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
