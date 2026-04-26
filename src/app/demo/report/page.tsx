import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// Mock data — realistic season data for demo player "Marcus Johnson"
// ─────────────────────────────────────────────────────────────────────────────

const PLAYER = {
  name: 'Marcus Johnson',
  firstName: 'Marcus',
  position: 'Guard',
  jersey: 12,
};

const TEAM = {
  name: 'YMCA Rockets U12',
  season: 'Spring 2025',
  coach: 'Sarah Thompson',
};

const SESSION_MESSAGE = {
  message:
    "Marcus had an outstanding practice on Tuesday — I was genuinely impressed by how he applied our defensive footwork drills in live 3-on-3 situations. He's been putting in the extra reps and it really showed today.",
  highlight:
    'Excellent first-step quickness in one-on-one defense drills — stayed in front of our fastest player the whole set.',
  next_focus: 'Keep working on maintaining defensive stance when the ball-handler uses a screen.',
};

const SEASON_STATS = {
  totalObs: 47,
  improvingSkills: 3,
  recentObs: 12,
  mostActive: 'Dribbling',
};

const SKILLS_ON_RISE = ['Dribbling', 'Defense', 'Teamwork'];

const SKILL_PROGRESS = [
  { name: 'Dribbling',  level: 'game_ready',  pct: 100 },
  { name: 'Defense',    level: 'got_it',       pct: 75 },
  { name: 'Teamwork',   level: 'got_it',       pct: 75 },
  { name: 'Offense',    level: 'practicing',   pct: 50 },
  { name: 'Shooting',   level: 'exploring',    pct: 25 },
];

const ACHIEVEMENTS = [
  { emoji: '⭐', name: 'First Star',       desc: 'Earned first positive observation',        color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { emoji: '🤝', name: 'Team Player',      desc: '10+ positive observations recorded',       color: 'bg-blue-50 border-blue-200 text-blue-800' },
  { emoji: '📅', name: 'Session Regular',  desc: 'Showed up to 10+ sessions',                color: 'bg-teal-50 border-teal-200 text-teal-800' },
  { emoji: '🏆', name: "Coach's Pick",     desc: 'Awarded for outstanding effort & attitude', color: 'bg-rose-50 border-rose-200 text-rose-800' },
];

const CELEBRATIONS = [
  'Exceptional ball-handling consistency under defensive pressure',
  'Vocal leadership on defense — calls out screens and communicates switches',
  'Strong transition effort; sprints back after every turnover',
];

const RECENT_OBS = [
  { text: 'Great defensive positioning and active hands in the lane — forced two turnovers.',                              category: 'Defense',  date: 'Apr 21' },
  { text: 'Shot fake created an open driving lane and finished strong at the rim.',                                        category: 'Offense',  date: 'Apr 19' },
  { text: 'Set a perfectly timed screen for a teammate\'s corner three — excellent awareness.',                            category: 'Teamwork', date: 'Apr 14' },
  { text: 'Excellent communication calling out defensive assignments on every half-court set.',                            category: 'Defense',  date: 'Apr 10' },
];

const HOME_CHALLENGE = {
  title: 'Figure-8 Ball Handling Challenge',
  minutes: 5,
  description:
    "Based on Marcus's strong dribbling progress, this week's challenge will take his handles to the next level.",
  steps: [
    'Stand with feet shoulder-width apart, ball in hand.',
    'Dribble the ball in a figure-8 pattern between your legs — 30 seconds right hand, 30 seconds left.',
    'Speed up each day: try to complete 20 full figure-8s in 60 seconds by Friday.',
  ],
  goal: 'Complete 20 figure-8 dribbles in under 60 seconds with no ball-handling mistakes.',
  encouragement: "You've got this, Marcus! Keep it low and quick!",
  weekLabel: 'Week of April 28, 2025',
};

// ─────────────────────────────────────────────────────────────────────────────
// Proficiency config
// ─────────────────────────────────────────────────────────────────────────────

const PROF: Record<string, { label: string; emoji: string; barColor: string; bgColor: string; textColor: string }> = {
  exploring:  { label: 'Exploring',   emoji: '🌱', barColor: 'bg-amber-400',   bgColor: 'bg-amber-50',  textColor: 'text-amber-700'  },
  practicing: { label: 'Practicing',  emoji: '🔄', barColor: 'bg-blue-400',    bgColor: 'bg-blue-50',   textColor: 'text-blue-700'   },
  got_it:     { label: 'Got It!',     emoji: '⭐', barColor: 'bg-emerald-400', bgColor: 'bg-emerald-50',textColor: 'text-emerald-700' },
  game_ready: { label: 'Game Ready',  emoji: '🏆', barColor: 'bg-purple-500',  bgColor: 'bg-purple-50', textColor: 'text-purple-700'  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Skill radar — pure SVG, 5-axis
// ─────────────────────────────────────────────────────────────────────────────

function SkillRadar() {
  const cx = 130, cy = 130, r = 88, n = 5;
  const vals = [1.0, 0.75, 0.75, 0.5, 0.25]; // Dribbling, Defense, Teamwork, Offense, Shooting
  const labels = ['Dribbling', 'Defense', 'Teamwork', 'Offense', 'Shooting'];

  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const pt = (i: number, v: number) => ({
    x: cx + r * v * Math.cos(angle(i)),
    y: cy + r * v * Math.sin(angle(i)),
  });

  const gridRing = (frac: number) => {
    const pts = Array.from({ length: n }, (_, i) => pt(i, frac));
    return `M${pts.map((p, i) => `${i === 0 ? '' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')} Z`;
  };

  const polygon = () => {
    const pts = vals.map((v, i) => pt(i, v));
    return `M${pts.map((p, i) => `${i === 0 ? '' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('')} Z`;
  };

  return (
    <svg viewBox="0 0 260 260" className="w-full max-w-[260px] mx-auto" aria-hidden="true">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <path key={f} d={gridRing(f)} fill="none" stroke={f === 1 ? '#d1d5db' : '#f3f4f6'} strokeWidth={f === 1 ? 1.5 : 1} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = pt(i, 1);
        return <line key={i} x1={cx} y1={cy} x2={p.x.toFixed(1)} y2={p.y.toFixed(1)} stroke="#e5e7eb" strokeWidth="1" />;
      })}
      <path d={polygon()} fill="rgba(249,115,22,0.15)" stroke="rgb(249,115,22)" strokeWidth="2.5" strokeLinejoin="round" />
      {vals.map((v, i) => {
        const p = pt(i, v);
        return <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r="4" fill="rgb(249,115,22)" stroke="white" strokeWidth="1.5" />;
      })}
      {labels.map((label, i) => {
        const a = angle(i);
        const offset = 16;
        const lx = cx + (r + offset) * Math.cos(a);
        const ly = cy + (r + offset) * Math.sin(a);
        const anchor = lx < cx - 8 ? 'end' : lx > cx + 8 ? 'start' : 'middle';
        const baseline = ly < cy - 8 ? 'auto' : ly > cy + 8 ? 'hanging' : 'middle';
        return (
          <text key={i} x={lx.toFixed(1)} y={ly.toFixed(1)} textAnchor={anchor} dominantBaseline={baseline}
            fontSize="9" fontWeight="600" fill="#374151" fontFamily="system-ui, sans-serif">
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function DemoReportPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg pb-10">

        {/* ─── Demo banner ─── */}
        <div className="bg-orange-500 px-4 py-3 text-center">
          <p className="text-sm font-medium text-white">
            Sample report — this is what parents see when you share progress updates
          </p>
          <Link
            href="/signup"
            className="mt-1 inline-block text-xs font-semibold text-orange-100 underline hover:text-white"
          >
            Create a free account →
          </Link>
        </div>

        {/* ─── Header ─── */}
        <div className="px-6 pt-8 pb-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Progress Report</p>
          <h1 className="mt-1 text-2xl font-bold text-orange-500">{TEAM.name}</h1>
        </div>

        {/* ─── Player card ─── */}
        <div className="mx-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-orange-100 text-2xl font-bold text-orange-600">
              MJ
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{PLAYER.name}</h2>
              <p className="text-sm text-gray-500">
                {PLAYER.position} &middot; #{PLAYER.jersey} &middot; {TEAM.season}
              </p>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-gray-50 p-4">
            <p className="text-sm leading-relaxed text-gray-700">
              Hello! Here&apos;s how <span className="font-semibold">{PLAYER.firstName}</span> is doing
              this {TEAM.season.toLowerCase()} with {TEAM.name}. We&apos;re excited to share this update with you!
            </p>
          </div>
        </div>

        {/* ─── Coach's Update ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm border border-emerald-100">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                <span className="text-xs text-emerald-600" aria-hidden="true">💬</span>
              </div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Coach&apos;s Update</h3>
            </div>
            <span className="text-[11px] text-gray-400">Tuesday&apos;s Practice</span>
          </div>

          <p className="text-sm leading-relaxed text-gray-800">{SESSION_MESSAGE.message}</p>

          <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
            <span className="mt-0.5 shrink-0 text-sm" aria-hidden="true">✨</span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Highlight</p>
              <p className="mt-0.5 text-sm text-gray-700">{SESSION_MESSAGE.highlight}</p>
            </div>
          </div>

          <div className="mt-2 flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5">
            <span className="mt-0.5 shrink-0 text-sm" aria-hidden="true">🎯</span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">Next Focus</p>
              <p className="mt-0.5 text-sm text-gray-700">{SESSION_MESSAGE.next_focus}</p>
            </div>
          </div>

          <p className="mt-3 text-right text-xs font-medium text-gray-500">— Coach {TEAM.coach}</p>
        </div>

        {/* ─── Season at a Glance ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">📈</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-600">Season at a Glance</h3>
          </div>
          <p className="text-sm leading-relaxed text-gray-700 mb-4">
            {PLAYER.firstName}&apos;s coach has recorded {SEASON_STATS.totalObs} observations this season — and{' '}
            {SEASON_STATS.improvingSkills} skill areas are on the rise!
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/80 p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-orange-500">{SEASON_STATS.totalObs}</p>
              <p className="mt-0.5 text-[11px] text-gray-500 leading-tight">Coach<br />Observations</p>
            </div>
            <div className="rounded-xl bg-white/80 p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-emerald-500">{SEASON_STATS.improvingSkills}</p>
              <p className="mt-0.5 text-[11px] text-gray-500 leading-tight">Skills<br />Improving</p>
            </div>
            <div className="rounded-xl bg-white/80 p-3 text-center shadow-sm">
              <p className="text-2xl font-bold text-blue-500">{SEASON_STATS.recentObs}</p>
              <p className="mt-0.5 text-[11px] text-gray-500 leading-tight">This<br />Fortnight</p>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-gray-500">
            Most practised: <span className="font-semibold text-gray-700">{SEASON_STATS.mostActive}</span>
          </p>
        </div>

        {/* ─── Skill Radar ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🕸️</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Skills at a Glance</h3>
          </div>
          <p className="mb-4 text-xs text-gray-500 leading-relaxed">
            {PLAYER.firstName}&apos;s skill profile across all tracked areas this season.
          </p>
          <SkillRadar />
          <div className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-gray-100 pt-3">
            {Object.values(PROF).map((l) => (
              <span key={l.label} className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className={`inline-block h-2 w-2 rounded-full ${l.barColor}`} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* ─── Skills on the Rise ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">🚀</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Skills on the Rise</h3>
          </div>
          <p className="mb-3 text-sm text-gray-600 leading-relaxed">
            {PLAYER.firstName}&apos;s coach has observed improvement in these areas:
          </p>
          <div className="flex flex-wrap gap-2">
            {SKILLS_ON_RISE.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800">
                <span className="text-emerald-500">↑</span>
                {s}
              </span>
            ))}
          </div>
        </div>

        {/* ─── Practice at Home ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm border border-blue-100">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">🏠</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-blue-700">Practice at Home</h3>
          </div>
          <p className="mb-1 text-[11px] text-gray-400">{HOME_CHALLENGE.weekLabel}</p>
          <p className="mb-4 text-sm text-gray-600 leading-relaxed">{HOME_CHALLENGE.description}</p>
          <div className="rounded-xl bg-blue-50 p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-blue-900">{HOME_CHALLENGE.title}</h4>
              <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                {HOME_CHALLENGE.minutes} min/day
              </span>
            </div>
            <ol className="mb-3 space-y-1">
              {HOME_CHALLENGE.steps.map((step, j) => (
                <li key={j} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[9px] font-bold text-blue-800">
                    {j + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2">
              <span className="mt-0.5 shrink-0 text-xs text-emerald-600">✓</span>
              <p className="text-xs text-emerald-700 leading-relaxed">
                <span className="font-semibold">Goal:</span> {HOME_CHALLENGE.goal}
              </p>
            </div>
            <p className="mt-2 text-xs italic text-gray-500">{HOME_CHALLENGE.encouragement}</p>
          </div>
        </div>

        {/* ─── Achievement Badges ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">🏅</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700">Achievements Earned</h3>
          </div>
          <p className="mb-4 text-sm text-gray-600 leading-relaxed">
            {PLAYER.firstName} has earned {ACHIEVEMENTS.length} badges this season!
          </p>
          <div className="grid grid-cols-2 gap-2">
            {ACHIEVEMENTS.map((a) => (
              <div key={a.name} className={`flex items-start gap-2.5 rounded-xl border p-3 ${a.color}`}>
                <span className="text-2xl leading-none shrink-0" aria-hidden="true">{a.emoji}</span>
                <div className="min-w-0">
                  <p className="text-xs font-bold leading-tight">{a.name}</p>
                  <p className="mt-0.5 text-[11px] leading-tight opacity-75">{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Skill Progress ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="text-lg">📊</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Skill Progress</h3>
          </div>
          <div className="space-y-4">
            {SKILL_PROGRESS.map((s) => {
              const p = PROF[s.level] ?? PROF.exploring;
              return (
                <div key={s.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">{s.name}</span>
                    <span className={`inline-flex items-center gap-1 text-xs font-medium ${p.textColor}`}>
                      <span>{p.emoji}</span>
                      {p.label}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full transition-all duration-500 ${p.barColor}`} style={{ width: `${s.pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3">
            {Object.values(PROF).map((l) => (
              <span key={l.label} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${l.bgColor} ${l.textColor}`}>
                {l.emoji} {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* ─── What to Celebrate ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">What to Celebrate</h3>
          </div>
          <ul className="space-y-2">
            {CELEBRATIONS.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                <span className="mt-0.5 shrink-0 text-emerald-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* ─── Recent Observations ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">📝</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Recent Observations</h3>
          </div>
          <div className="space-y-3">
            {RECENT_OBS.map((obs, i) => (
              <div key={i} className="border-l-2 border-gray-200 pl-3">
                <p className="text-sm text-gray-700">{obs.text}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {obs.category} &middot; {obs.date}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ─── Coach's Note ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Coach&apos;s Note</h3>
          </div>
          <p className="text-sm italic leading-relaxed text-gray-700">
            &ldquo;Marcus has been one of our most dedicated players this season. His growth in defensive positioning
            and ball-handling has been remarkable, and his positive attitude lifts the whole team. We&apos;re excited
            to see him continue developing!&rdquo;
          </p>
          <p className="mt-3 text-sm font-medium text-gray-800">&mdash; Coach {TEAM.coach}</p>
          <p className="text-xs text-gray-400">{TEAM.name} &middot; {TEAM.season}</p>
        </div>

        {/* ─── Viral CTA ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-gray-100 p-5 text-center">
          <p className="text-sm text-gray-600">
            Is your coach using SportsIQ?
          </p>
          <p className="mt-1 text-sm font-medium text-gray-800">
            Share this with them — every player deserves a report like this.
          </p>
          <Link
            href="/"
            className="mt-3 inline-block rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Learn about SportsIQ →
          </Link>
        </div>

        {/* ─── Sign Up CTA ─── */}
        <div className="mx-4 mt-6 rounded-2xl bg-orange-500 p-6 text-center shadow-lg shadow-orange-500/20">
          <p className="text-base font-bold text-white">Get reports like this for your players</p>
          <p className="mt-1 text-sm text-orange-100">
            Voice capture + AI analysis + beautiful parent reports. Free to start.
          </p>
          <Link
            href="/signup"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-bold text-orange-600 hover:bg-orange-50 transition-colors"
          >
            Start for free — no credit card needed
            <span aria-hidden="true">→</span>
          </Link>
          <p className="mt-2 text-xs text-orange-200">20-second demo. No signup required to try it.</p>
        </div>

        {/* ─── Footer ─── */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">Powered by <span className="font-semibold">SportsIQ</span></p>
          <div className="mt-1 flex justify-center gap-3 text-xs text-gray-400">
            <a href="/privacy" className="hover:text-gray-600 underline">Privacy</a>
            <a href="/terms" className="hover:text-gray-600 underline">Terms</a>
          </div>
        </div>

      </div>
    </div>
  );
}
