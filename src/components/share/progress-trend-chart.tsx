// Server-component safe — pure SVG, no client JS

type WeekBucket = { label: string; positiveRate: number; total: number };

function buildWeeklyTrend(obs: { sentiment: string; created_at: string }[], numWeeks = 10): WeekBucket[] {
  const now = Date.now();
  const result: WeekBucket[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const weekEnd = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
    const label = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const weekObs = obs.filter((o) => {
      const d = new Date(o.created_at);
      return d >= weekStart && d < weekEnd;
    });
    const scored = weekObs.filter((o) => o.sentiment === 'positive' || o.sentiment === 'needs-work');
    const pos = scored.filter((o) => o.sentiment === 'positive');
    result.push({ label, positiveRate: scored.length > 0 ? pos.length / scored.length : -1, total: weekObs.length });
  }
  return result;
}

export function ProgressTrendChart({
  obs,
  firstName,
}: {
  obs: { sentiment: string; created_at: string }[];
  firstName: string;
}) {
  const weeks = buildWeeklyTrend(obs);
  const dataWeeks = weeks.filter((w) => w.positiveRate >= 0);
  if (dataWeeks.length < 3) return null;

  const W = 300;
  const H = 80;
  const padX = 6;
  const padY = 10;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;

  const pts = weeks.map((w, i) => ({
    x: padX + (i / (weeks.length - 1)) * innerW,
    y: w.positiveRate >= 0 ? padY + (1 - w.positiveRate) * innerH : null,
    ...w,
  }));

  // Build SVG path from contiguous segments (gaps handled by re-issuing M)
  let linePath = '';
  let inSeg = false;
  for (const p of pts) {
    if (p.y !== null) {
      linePath += `${inSeg ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `;
      inSeg = true;
    } else {
      inSeg = false;
    }
  }

  // Area fill — from first to last valid point, closed at the bottom
  const validPts = pts.filter((p) => p.y !== null);
  const areaPath =
    validPts.length >= 2
      ? `M${validPts[0].x.toFixed(1)},${validPts[0].y!.toFixed(1)} ` +
        validPts.slice(1).map((p) => `L${p.x.toFixed(1)},${p.y!.toFixed(1)}`).join(' ') +
        ` L${validPts[validPts.length - 1].x.toFixed(1)},${H} L${validPts[0].x.toFixed(1)},${H} Z`
      : '';

  // Trend: compare first half vs second half of data weeks
  const half = Math.floor(dataWeeks.length / 2);
  const avg = (arr: WeekBucket[]) => arr.reduce((s, w) => s + w.positiveRate, 0) / arr.length;
  const trendDelta = avg(dataWeeks.slice(half)) - avg(dataWeeks.slice(0, half));

  const trendLabel = trendDelta > 0.08 ? '↑ Improving' : trendDelta < -0.08 ? '↓ Needs focus' : '→ Steady';
  const trendTextColor =
    trendDelta > 0.08 ? 'text-emerald-600' : trendDelta < -0.08 ? 'text-amber-600' : 'text-gray-500';

  const latestPct = Math.round(dataWeeks[dataWeeks.length - 1].positiveRate * 100);

  return (
    <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            📈
          </span>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Coaching Progress</h3>
        </div>
        <span className={`text-xs font-semibold ${trendTextColor}`}>{trendLabel}</span>
      </div>
      <p className="mb-3 text-xs text-gray-500 leading-relaxed">
        Positive coaching moments for {firstName} each week
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`${firstName}'s weekly coaching progress`}
      >
        {/* Subtle grid lines at 25%, 50%, 75% */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={padX}
            y1={padY + (1 - f) * innerH}
            x2={W - padX}
            y2={padY + (1 - f) * innerH}
            stroke="#f3f4f6"
            strokeWidth="1"
          />
        ))}
        {/* Area fill */}
        {areaPath && <path d={areaPath} fill="rgba(249,115,22,0.08)" />}
        {/* Line */}
        {linePath && (
          <path
            d={linePath}
            fill="none"
            stroke="#f97316"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* Dots — colour-coded: emerald ≥70%, orange ≥50%, amber <50% */}
        {pts
          .filter((p) => p.y !== null)
          .map((p, i) => (
            <circle
              key={i}
              cx={p.x}
              cy={p.y!}
              r="3.5"
              fill={p.positiveRate >= 0.7 ? '#10b981' : p.positiveRate >= 0.5 ? '#f97316' : '#f59e0b'}
              stroke="white"
              strokeWidth="1.5"
            />
          ))}
      </svg>
      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
        <span>{weeks[0]?.label}</span>
        <span className="font-semibold text-orange-500">{latestPct}% positive — most recent week</span>
      </div>
    </div>
  );
}
