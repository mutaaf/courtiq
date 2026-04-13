'use client';

import type { WeekBucket } from './chart-utils';
import { weekLabel } from './chart-utils';

// SVG line chart — renders two lines: health score (%) and normalised obs count
export default function LineChart({ buckets }: { buckets: WeekBucket[] }) {
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
