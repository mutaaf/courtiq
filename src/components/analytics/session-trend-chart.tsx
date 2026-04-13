'use client';

import type { SessionBucket } from './chart-utils';
import { SESSION_TYPE_COLORS } from './chart-utils';

// Session-over-session improvement tracking chart
export default function SessionTrendChart({ buckets }: { buckets: SessionBucket[] }) {
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
