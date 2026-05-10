import type { Metadata } from 'next';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ParentViralCTA } from '@/components/share/parent-viral-cta';
import { ParentReactionForm } from '@/components/share/parent-reaction-form';
import { PortalFamilyShare } from '@/components/share/portal-family-share';
import { ParentContactForm } from '@/components/share/parent-contact-form';
import { Megaphone, MessageCircle } from 'lucide-react';
import {
  buildSeasonStats,
  getImprovingSkills,
  formatCategoryLabel,
  buildProgressMessage,
  hasEnoughDataForJourney,
  sortSkillsByImprovingFirst,
  buildWeeklyProgress,
  hasEnoughDataForWeeklyProgress,
  isProgressTrending,
  getWeeklyProgressMax,
} from '@/lib/skill-journey-utils';
import type { SkillProgress, ShareObservation, WeeklyProgressPoint } from '@/lib/skill-journey-utils';
import type { GrowthObs } from '@/lib/player-growth-streak-utils';
import {
  buildGrowthStreakData,
  hasEnoughDataForGrowthStreak,
  getStreakEmoji,
  getStreakLabel,
  isHotStreak as isGrowthHotStreak,
  formatStreakCount,
} from '@/lib/player-growth-streak-utils';

// ---------------------------------------------------------------------------
// Skill Radar Chart — pure SVG, server-component safe, light-mode
// ---------------------------------------------------------------------------

const PROFICIENCY_SCORE: Record<string, number> = {
  exploring: 0.25,
  practicing: 0.5,
  got_it: 0.75,
  game_ready: 1.0,
};

function SkillRadarChart({ skills }: { skills: any[] }) {
  // Keep 3–8 skills; prefer those with real data
  const candidates = skills
    .filter((s) => s.proficiency_level && s.proficiency_level !== 'insufficient_data')
    .slice(0, 8);

  if (candidates.length < 3) return null;

  const n = candidates.length;
  const size = 260;
  const cx = 130;
  const cy = 130;
  const r = 88;

  const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;

  const pt = (i: number, val: number) => ({
    x: cx + r * val * Math.cos(angle(i)),
    y: cy + r * val * Math.sin(angle(i)),
  });

  const score = (s: any): number => {
    if (s.success_rate != null) return Math.min(1, s.success_rate);
    return PROFICIENCY_SCORE[s.proficiency_level] ?? 0.1;
  };

  const polygon = () => {
    const pts = candidates.map((s, i) => pt(i, score(s)));
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ' Z';
  };

  const gridRing = (frac: number) => {
    const pts = candidates.map((_, i) => {
      const p = pt(i, frac);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    });
    return `M${pts[0]} ${pts.slice(1).map((p) => `L${p}`).join(' ')} Z`;
  };

  const labelPos = (i: number) => {
    const a = angle(i);
    const offset = 16;
    return { x: cx + (r + offset) * Math.cos(a), y: cy + (r + offset) * Math.sin(a) };
  };

  const textAnchor = (i: number) => {
    const lp = labelPos(i);
    if (lp.x < cx - 8) return 'end';
    if (lp.x > cx + 8) return 'start';
    return 'middle';
  };

  const textBaseline = (i: number) => {
    const lp = labelPos(i);
    if (lp.y < cy - 8) return 'auto';
    if (lp.y > cy + 8) return 'hanging';
    return 'middle';
  };

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="w-full max-w-[260px] mx-auto"
      aria-hidden="true"
    >
      {/* Grid rings */}
      {[0.25, 0.5, 0.75, 1].map((frac) => (
        <path
          key={frac}
          d={gridRing(frac)}
          fill="none"
          stroke={frac === 1 ? '#d1d5db' : '#f3f4f6'}
          strokeWidth={frac === 1 ? 1.5 : 1}
        />
      ))}

      {/* Axis lines */}
      {candidates.map((_, i) => {
        const p = pt(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={p.x.toFixed(1)}
            y2={p.y.toFixed(1)}
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        );
      })}

      {/* Player polygon */}
      <path
        d={polygon()}
        fill="rgba(249,115,22,0.15)"
        stroke="rgb(249,115,22)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Vertex dots */}
      {candidates.map((s, i) => {
        const p = pt(i, score(s));
        return (
          <circle
            key={i}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            r="4"
            fill="rgb(249,115,22)"
            stroke="white"
            strokeWidth="1.5"
          />
        );
      })}

      {/* Skill labels */}
      {candidates.map((s, i) => {
        const lp = labelPos(i);
        const label = (s.skill_name || formatCategoryLabel(s.category || s.skill_id || ''))
          .split(' ')
          .slice(0, 2)
          .join(' ');
        return (
          <text
            key={i}
            x={lp.x.toFixed(1)}
            y={lp.y.toFixed(1)}
            textAnchor={textAnchor(i)}
            dominantBaseline={textBaseline(i)}
            fontSize="9"
            fontWeight="600"
            fill="#374151"
            fontFamily="system-ui, sans-serif"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function getShareData(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/share/${token}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Not found', status: res.status, pinRequired: err.pinRequired };
    }
    return res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Proficiency helpers
// ---------------------------------------------------------------------------

interface ProficiencyLevel {
  label: string;
  emoji: string;
  percent: number;
  barColor: string;
  bgColor: string;
  textColor: string;
}

const PROFICIENCY_LEVELS: Record<string, ProficiencyLevel> = {
  exploring: {
    label: 'Exploring',
    emoji: '\u{1F331}',
    percent: 25,
    barColor: 'bg-amber-400',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-700',
  },
  practicing: {
    label: 'Practicing',
    emoji: '\u{1F504}',
    percent: 50,
    barColor: 'bg-blue-400',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
  },
  got_it: {
    label: 'Got It!',
    emoji: '⭐',
    percent: 75,
    barColor: 'bg-emerald-400',
    bgColor: 'bg-emerald-50',
    textColor: 'text-emerald-700',
  },
  game_ready: {
    label: 'Game Ready',
    emoji: '\u{1F3C6}',
    percent: 100,
    barColor: 'bg-purple-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-700',
  },
};

function getProficiency(level: string | null | undefined): ProficiencyLevel {
  if (!level) return PROFICIENCY_LEVELS.exploring;
  return PROFICIENCY_LEVELS[level] || PROFICIENCY_LEVELS.exploring;
}

// ---------------------------------------------------------------------------
// Skill Progress Bar
// ---------------------------------------------------------------------------

function SkillBar({ skill }: { skill: any }) {
  const prof = getProficiency(skill.proficiency_level);
  // Use success_rate if available, else use the level-based percent
  const pct = skill.success_rate != null ? Math.round(skill.success_rate * 100) : prof.percent;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-800">
          {skill.skill_name || formatCategoryLabel(skill.category || skill.skill_id || '')}
        </span>
        <span className={`text-xs font-semibold ${prof.textColor}`}>
          {prof.emoji} {prof.label}
        </span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-gray-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${prof.barColor} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly Progress Chart (pure SVG)
// ---------------------------------------------------------------------------

function WeeklyProgressChart({ weeks }: { weeks: WeeklyProgressPoint[] }) {
  const max = getWeeklyProgressMax(weeks);
  if (max === 0) return null;

  const barW = 22;
  const gap = 10;
  const chartH = 56;
  const n = weeks.length;
  const totalW = n * barW + (n - 1) * gap;
  const svgW = totalW + 16;
  const svgH = chartH + 20;

  return (
    <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full" aria-hidden="true">
      {weeks.map((w, i) => {
        const h = w.positiveCount === 0 ? 3 : Math.max(4, (w.positiveCount / max) * chartH);
        const x = 8 + i * (barW + gap);
        const y = chartH - h;
        const isRecent = i === n - 1;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={h}
            rx="4"
            fill={w.positiveCount === 0 ? '#e5e7eb' : isRecent ? '#f97316' : '#fed7aa'}
          />
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Error states
// ---------------------------------------------------------------------------

function ErrorPage({ isExpired, needsPin }: { isExpired: boolean; needsPin: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm text-center">
        <div className="mb-4 text-5xl">{isExpired ? '⏰' : needsPin ? '🔒' : '🔍'}</div>
        <h1 className="mb-2 text-xl font-bold text-gray-900">
          {isExpired ? 'Link expired' : needsPin ? 'PIN required' : 'Report not found'}
        </h1>
        <p className="text-sm text-gray-500">
          {isExpired
            ? 'This report link has expired. Ask your coach for a new link.'
            : needsPin
            ? 'This report is PIN-protected. Check with your coach for the access code.'
            : 'This report link is no longer valid. Ask your coach for a new link.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await getShareData(token);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const pageUrl = `${baseUrl}/share/${token}`;

  if (!data || data.error) {
    return {
      title: 'Player Progress Report — SportsIQ',
      description: 'View your child\'s coaching progress report.',
    };
  }

  const { player, team, coachName, totalObservationCount } = data;

  const playerName = player?.nickname || player?.name || 'Your Player';
  const firstName = playerName.split(' ')[0];
  const teamName = team?.name || 'the team';
  const coachFirst = coachName ? coachName.split(' ')[0] : 'Coach';
  const obsCount = totalObservationCount ?? 0;
  const obsNote = obsCount > 0 ? ` · ${obsCount} coaching observation${obsCount !== 1 ? 's' : ''}` : '';

  const title = `${playerName}'s Progress Report — ${teamName}`;
  const description = `Coach ${coachFirst} has shared ${firstName}'s coaching highlights, skill progress, and season achievements${obsNote}. See how ${firstName} is developing this season!`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: pageUrl,
      images: [`${baseUrl}/api/og/share?token=${token}`],
      siteName: 'SportsIQ',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${baseUrl}/api/og/share?token=${token}`],
    },
    other: {
      team: teamName,
    },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getShareData(token);

  if (!data || data.error) {
    return <ErrorPage isExpired={data?.status === 410} needsPin={!!data?.pinRequired} />;
  }

  const {
    player,
    team,
    coachName,
    branding,
    customMessage,
    reportCard,
    developmentCard,
    highlights,
    featuredHighlight,
    skillProgress,
    recommendedDrills,
    announcements,
    nextSession,
    totalObservationCount,
    recentObservationActivity,
    achievements,
    latestSessionMessage,
    skillChallenge,
    playerGoals,
    attendanceStats,
    hasParentContact,
  } = data;

  const playerName = player?.nickname || player?.name || 'your player';
  const firstName = playerName.split(' ')[0];
  const parentName = player?.parent_name || null;
  const teamName = team?.name || 'the team';
  const season = team?.season || null;
  const brandColor = branding?.primary_color || '#F97316'; // orange fallback

  // ── Season-stats helpers ──────────────────────────────────────────────────
  const obsActivity: ShareObservation[] = recentObservationActivity ?? [];
  const seasonStats = buildSeasonStats(obsActivity, skillProgress ?? []);
  const improvingSkills = getImprovingSkills(skillProgress ?? []);
  const progressMessage = buildProgressMessage(firstName, improvingSkills, totalObservationCount ?? 0);
  const hasJourneyData = hasEnoughDataForJourney(obsActivity, skillProgress ?? []);

  // ── Skill progress (sorted improving-first) ───────────────────────────────
  const sortedSkills: SkillProgress[] = sortSkillsByImprovingFirst(skillProgress ?? []);

  // ── Growth streak ─────────────────────────────────────────────────────────
  const growthObs: GrowthObs[] = obsActivity.map((o) => ({
    session_id: o.session_id ?? null,
    sentiment: o.sentiment,
    created_at: o.created_at,
  }));
  const growthStreak = hasEnoughDataForGrowthStreak(growthObs)
    ? buildGrowthStreakData(growthObs)
    : null;

  // ── Weekly progress chart ─────────────────────────────────────────────────
  const weeklyProgress = buildWeeklyProgress(obsActivity);
  const showWeeklyChart = hasEnoughDataForWeeklyProgress(weeklyProgress);
  const weeklyTrending = isProgressTrending(weeklyProgress);

  // ── Session type helpers ─────────────────────────────────────────────────
  function getSessionTypeLabel(type: string): string {
    const map: Record<string, string> = {
      practice: 'Practice',
      game: 'Game',
      scrimmage: 'Scrimmage',
      tournament: 'Tournament',
      training: 'Training',
    };
    return map[type] || 'Session';
  }

  function getSessionTypeEmoji(type: string): string {
    const map: Record<string, string> = {
      practice: '⚽',
      game: '🏆',
      scrimmage: '🤝',
      tournament: '🎖️',
      training: '💪',
    };
    return map[type] || '📅';
  }

  function formatNextSessionDate(dateStr: string): string {
    try {
      const d = new Date(dateStr + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(today.getDate() + 1);
      if (d.getTime() === today.getTime()) return 'Today';
      if (d.getTime() === tomorrow.getTime()) return 'Tomorrow';
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }

  function formatSessionTime(startTime: string | null, endTime: string | null): string {
    if (!startTime) return '';
    try {
      const [h, m] = startTime.split(':').map(Number);
      const suffix = h >= 12 ? 'PM' : 'AM';
      const hour = h % 12 || 12;
      const start = `${hour}:${m.toString().padStart(2, '0')} ${suffix}`;
      if (!endTime) return start;
      const [eh, em] = endTime.split(':').map(Number);
      const esuffix = eh >= 12 ? 'PM' : 'AM';
      const ehour = eh % 12 || 12;
      return `${start} – ${ehour}:${em.toString().padStart(2, '0')} ${esuffix}`;
    } catch {
      return startTime;
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-16 font-sans">
      {/* ─── Header banner ─── */}
      <div
        className="px-4 py-3 text-center text-sm font-medium text-white"
        style={{ backgroundColor: brandColor }}
      >
        {branding?.report_header_text ||
          `${teamName} · Powered by SportsIQ`}
      </div>

      {/* ─── Player greeting card ─── */}
      <div className="mx-4 mt-4 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <PlayerAvatar
            name={playerName}
            photoUrl={player?.photo_url}
            size={64}
          />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              {teamName}{season ? ` · ${season}` : ''}
            </p>
            <h1 className="truncate text-xl font-bold text-gray-900">{playerName}</h1>
            {progressMessage && (
              <p className="mt-0.5 text-sm text-gray-500">{progressMessage}</p>
            )}
          </div>
        </div>
      </div>

        {/* ─── Share with Family ─── */}
        <div className="mx-4 mt-3">
          <PortalFamilyShare
            playerName={firstName}
            teamName={teamName}
            coachName={coachName}
            shareToken={token}
          />
        </div>

        {/* ─── Parent Contact Opt-in ─── */}
        {!hasParentContact && (
          <ParentContactForm
            shareToken={token}
            playerFirstName={firstName}
            coachName={coachName}
            teamName={teamName}
          />
        )}

        {/* ─── Coach's Latest Session Update ─── */}
        {latestSessionMessage && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm border border-emerald-100">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Coach&apos;s Update</p>
                  {latestSessionMessage.session_label && (
                    <p className="text-xs text-gray-400">{latestSessionMessage.session_label}</p>
                  )}
                </div>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-gray-700">{latestSessionMessage.message}</p>

            {latestSessionMessage.highlight && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                <span className="mt-0.5 text-sm">✨</span>
                <p className="text-sm font-medium text-emerald-800">{latestSessionMessage.highlight}</p>
              </div>
            )}

            {latestSessionMessage.next_focus && (
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5">
                <span className="mt-0.5 text-sm">🎯</span>
                <p className="text-sm font-medium text-orange-800">{latestSessionMessage.next_focus}</p>
              </div>
            )}

            {coachName && (
              <p className="mt-3 text-right text-xs text-gray-400">
                — Coach {coachName}
              </p>
            )}
          </div>
        )}

        {/* ─── Team Announcements ─── */}
        {announcements && announcements.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Megaphone className="h-4 w-4 text-amber-600" aria-hidden="true" />
              <p className="text-sm font-semibold text-amber-900">From the coach</p>
            </div>
            <div className="space-y-3">
              {announcements.map((ann: { id: string; title: string; body: string }) => (
                <div key={ann.id}>
                  <p className="text-sm font-semibold text-amber-800">{ann.title}</p>
                  <p className="text-sm text-amber-700">{ann.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Next Session ─── */}
        {nextSession && (
          <div className="mx-4 mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sky-600 text-sm font-bold">📅</span>
              <p className="text-sm font-semibold text-sky-900">
                Next {getSessionTypeLabel(nextSession.type)}
              </p>
            </div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-sky-800">
                  {getSessionTypeEmoji(nextSession.type)}{' '}
                  {formatNextSessionDate(nextSession.date)}
                  {nextSession.opponent && nextSession.type !== 'practice' && nextSession.type !== 'training' && (
                    <span className="text-sky-700"> vs {nextSession.opponent}</span>
                  )}
                </p>
                {(nextSession.start_time || nextSession.location) && (
                  <p className="mt-1 text-xs text-sky-600 space-x-2">
                    {nextSession.start_time && (
                      <span>{formatSessionTime(nextSession.start_time, nextSession.end_time)}</span>
                    )}
                    {nextSession.start_time && nextSession.location && (
                      <span>·</span>
                    )}
                    {nextSession.location && (
                      <span>📍 {nextSession.location}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ─── Season at a Glance ─── */}
        <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
              <span className="text-sm">📊</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">Season at a Glance</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-orange-50 p-3 text-center">
              <p className="text-xl font-bold text-orange-600">{seasonStats.totalObservations}</p>
              <p className="text-xs text-gray-500">Coach observations</p>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <p className="text-xl font-bold text-emerald-600">{seasonStats.improvingSkillCount}</p>
              <p className="text-xs text-gray-500">Skills improving</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{seasonStats.recentObsCount}</p>
              <p className="text-xs text-gray-500">This fortnight</p>
            </div>
          </div>
        </div>

        {/* ─── Practice Attendance ─── */}
        {attendanceStats && attendanceStats.totalSessions >= 2 && (
          <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <span className="text-sm">📅</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Practice Attendance</p>
            </div>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-orange-600">{attendanceStats.present}</span>
              <span className="text-sm text-gray-500">of {attendanceStats.totalSessions} practices</span>
              <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${
                attendanceStats.pct >= 75 ? 'bg-emerald-100 text-emerald-700' :
                attendanceStats.pct >= 60 ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'
              }`}>{attendanceStats.pct}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden mb-2">
              <div
                className={`h-full rounded-full ${
                  attendanceStats.pct >= 75 ? 'bg-emerald-400' :
                  attendanceStats.pct >= 60 ? 'bg-amber-400' : 'bg-red-400'
                }`}
                style={{ width: `${attendanceStats.pct}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {attendanceStats.pct >= 75 ? '🌟 Excellent attendance!' :
               attendanceStats.pct >= 60 ? '👍 Great commitment!' :
               attendanceStats.pct >= 40 ? '📈 Good effort, keep showing up!' :
               '💪 Every practice counts!'}
            </p>
            {attendanceStats.recentDots && attendanceStats.recentDots.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1.5">Recent sessions</p>
                <div className="flex gap-1.5 flex-wrap">
                  {attendanceStats.recentDots.map((dot: string, i: number) => (
                    <div
                      key={i}
                      className={`h-5 w-5 rounded-full ${
                        dot === 'present' ? 'bg-emerald-400' :
                        dot === 'excused' ? 'bg-amber-300' : 'bg-gray-200'
                      }`}
                      title={dot}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── Weekly Progress Chart ─── */}
        {showWeeklyChart && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <span className="text-sm">📈</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Positive Moments — Last 8 Weeks</p>
              </div>
            </div>
            <WeeklyProgressChart weeks={weeklyProgress} />
            {weeklyTrending && (
              <p className="mt-2 text-center text-xs font-medium text-emerald-600">
                ↑ Positive moments trending up lately!
              </p>
            )}
            <p className="mt-1 text-center text-xs text-gray-400">
              Each bar shows how many positive coaching observations {firstName} received that week.
            </p>
          </div>
        )}

        {/* ─── Player Growth Streak ─── */}
        {growthStreak && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xl">{getStreakEmoji(growthStreak.currentStreak)}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900">Practice Streak</p>
                <p className="text-xs text-gray-400">
                  {getStreakLabel(growthStreak.currentStreak)}
                </p>
              </div>
            </div>
            {growthStreak.currentStreak > 0 ? (
              <>
                <p className="text-sm text-gray-700">
                  {firstName} has received positive coaching feedback in{' '}
                  {isGrowthHotStreak(growthStreak) ? (
                    <strong className="text-orange-600">
                      {formatStreakCount(growthStreak.currentStreak)} in a row!
                    </strong>
                  ) : (
                    <>{`their last ${formatStreakCount(growthStreak.currentStreak)}`}</>
                  )}
                </p>
                {growthStreak.longestStreak > growthStreak.currentStreak && (
                  <p className="mt-1 text-xs text-gray-400">
                    <> Best streak: {formatStreakCount(growthStreak.longestStreak)} in a row.</>
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-500">Season just getting started!</p>
            )}
          </div>
        )}

        {/* ─── Skill Radar ─── */}
        {skillProgress && skillProgress.length >= 3 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <span className="text-sm">🕸️</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Skills at a Glance</p>
            </div>
            <SkillRadarChart skills={skillProgress} />
            <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-gray-100 pt-3">
              {Object.values(PROFICIENCY_LEVELS).map((pl) => (
                <span key={pl.label} className="text-xs text-gray-500">
                  {pl.emoji} {pl.label}
                </span>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-gray-400">
              {firstName}&apos;s skill profile across all tracked areas this season.
            </p>
          </div>
        )}

        {/* ─── Skills on the Rise ─── */}
        {hasJourneyData && improvingSkills.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                <span className="text-sm">🌱</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Skills on the Rise</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {improvingSkills.map((skill) => (
                <span
                  key={skill.skill_id}
                  className="rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-medium text-emerald-800"
                >
                  ↑ {skill.skill_name || formatCategoryLabel(skill.category || skill.skill_id)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Practice at Home (Skill Challenges) ─── */}
        {skillChallenge && skillChallenge.challenges && skillChallenge.challenges.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm border border-blue-100">
            <div className="mb-1 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                <span className="text-sm">🏠</span>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Practice at Home</p>
                {skillChallenge.week_label && (
                  <p className="text-xs text-gray-400">{skillChallenge.week_label}</p>
                )}
              </div>
            </div>
            {skillChallenge.parent_note && (
              <p className="mb-3 mt-2 text-sm text-blue-700 italic">&ldquo;{skillChallenge.parent_note}&rdquo;</p>
            )}
            <div className="space-y-4">
              {skillChallenge.challenges.slice(0, 2).map((c: any, i: number) => (
                <div key={i} className="rounded-xl bg-blue-50 p-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-blue-900">{c.title}</p>
                    <div className="flex items-center gap-1.5">
                      {c.minutes_per_day && (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          {c.minutes_per_day} min/day
                        </span>
                      )}
                      {c.difficulty && (
                        <span className="rounded-full bg-white border border-blue-200 px-2 py-0.5 text-xs font-medium text-blue-600">
                          {c.difficulty}
                        </span>
                      )}
                    </div>
                  </div>
                  {c.description && (
                    <p className="mb-2 text-sm text-blue-800">{c.description}</p>
                  )}
                  {c.steps && c.steps.length > 0 && (
                    <ol className="space-y-1 text-sm text-blue-700">
                      {c.steps.map((step: string, si: number) => (
                        <li key={si} className="flex gap-2">
                          <span className="shrink-0 font-bold">{si + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                  {c.success_criteria && (
                    <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-emerald-50 px-3 py-2">
                      <span className="shrink-0 text-xs">🎯</span>
                      <p className="text-xs font-medium text-emerald-700">{c.success_criteria}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Achievements ─── */}
        {achievements && achievements.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">🏅</span>
              <p className="text-sm font-semibold text-gray-900">Achievements Earned</p>
            </div>
            <p className="mb-3 text-xs text-gray-500">
              {firstName} has earned {achievements.length === 1 ? 'this badge' : `${achievements.length} badges`} this season!
            </p>
            <div className="grid grid-cols-2 gap-2">
              {achievements.map((ach: any) => {
                const meta = BADGE_META[ach.badge_type];
                if (!meta) return null;
                return (
                  <div
                    key={ach.id}
                    className={`rounded-xl ${meta.bg} border ${meta.border} p-3`}
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm">{meta.emoji} {meta.name}</p>
                      {ach.note && <p className="mt-0.5 text-xs text-gray-600 line-clamp-2">{ach.note}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Player Development Goals ─── */}
        {playerGoals && playerGoals.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-sky-50 to-indigo-50 border border-sky-200 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xl">🎯</span>
              <p className="text-sm font-semibold text-gray-900">Season Goals</p>
            </div>
            <div className="space-y-3">
              {playerGoals.map((goal: any) => {
                const isAchieved = goal.status === 'achieved';
                return (
                  <div
                    key={goal.id}
                    className={`rounded-xl p-3 ${
                      isAchieved ? 'bg-emerald-50 border border-emerald-200' : 'bg-white/70 border border-sky-100'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="shrink-0 mt-0.5">
                        {isAchieved ? (
                          <span className="text-base">✅</span>
                        ) : (
                          <span className="text-base">🌟</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">
                            {formatCategoryLabel(goal.skill_area || 'skill')}
                          </span>
                          {isAchieved && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-700">
                              Goal Achieved! 🎉
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800">{goal.goal_text}</p>
                        {goal.target_date && !isAchieved && (
                          <p className="mt-0.5 text-xs text-gray-400">
                            Target: {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        )}
                        {isAchieved && (
                          <p className="mt-0.5 text-xs text-emerald-600 font-medium">
                            {firstName} nailed it! 💪
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-gray-500 text-center">
              Encourage {firstName} to keep working on these goals at home!
            </p>
          </div>
        )}

        {/* ─── Skill Progress bars ─── */}
        {sortedSkills.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <span className="text-sm">📊</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Skill Progress</p>
            </div>
            <div className="space-y-4">
              {sortedSkills.map((skill, i) => (
                <SkillBar key={i} skill={skill} />
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3">
              {Object.values(PROFICIENCY_LEVELS).map((pl) => (
                <span key={pl.label} className="text-xs text-gray-400">
                  {pl.emoji} {pl.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Featured Observation ─── */}
        {featuredHighlight && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                <span className="text-sm">{featuredHighlight.is_highlighted ? '⭐' : '✨'}</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">
                {featuredHighlight.is_highlighted ? "Coach's Pick" : 'Recent Highlight'}
              </p>
            </div>
            <blockquote className="rounded-xl bg-orange-50 px-4 py-3 text-sm font-medium italic text-orange-900">
              &ldquo;{featuredHighlight.text}&rdquo;
            </blockquote>
          </div>
        )}

        {/* ─── Report Card ─── */}
        {reportCard && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100">
                <span className="text-sm">📋</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">AI Report Card</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4">
              <p className="text-sm leading-relaxed text-blue-900">{reportCard.summary}</p>
            </div>
            {reportCard.strengths && reportCard.strengths.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Strengths</p>
                <ul className="space-y-1">
                  {reportCard.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 text-emerald-500">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reportCard.areas_to_improve && reportCard.areas_to_improve.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Areas to Improve</p>
                <ul className="space-y-1">
                  {reportCard.areas_to_improve.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 text-amber-500">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {reportCard.next_challenge && (
              <div className="mt-3 rounded-lg bg-orange-50 border border-orange-100 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Next Challenge</p>
                <p className="mt-0.5 text-sm text-orange-800">{reportCard.next_challenge}</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Development Card section ─── */}
        {developmentCard && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-100">
                <span className="text-sm">🗺️</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Development Roadmap</p>
            </div>
            {developmentCard.strengths && developmentCard.strengths.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Strengths</p>
                <ul className="space-y-1">
                  {developmentCard.strengths.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 text-emerald-500">✓</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {developmentCard.growth_areas && developmentCard.growth_areas.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Growth Areas</p>
                <ul className="space-y-1">
                  {developmentCard.growth_areas.map((s: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className="mt-0.5 text-orange-400">→</span> {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {developmentCard.goals && developmentCard.goals.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Development Goals</p>
                <div className="space-y-3">
                  {developmentCard.goals.map((goal: any, i: number) => (
                    <div key={i} className="rounded-lg bg-purple-50 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <p className="text-sm font-semibold text-purple-900">{goal.title}</p>
                        {goal.current_level && goal.target_level && (
                          <span className="text-xs text-purple-600">
                            {goal.current_level} → {goal.target_level}
                          </span>
                        )}
                      </div>
                      {goal.action_steps && goal.action_steps.length > 0 && (
                        <ol className="space-y-0.5 text-sm text-purple-700">
                          {goal.action_steps.map((step: string, si: number) => (
                            <li key={si} className="flex gap-2">
                              <span className="shrink-0 font-bold">{si + 1}.</span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {developmentCard.coach_note && (
              <div className="mt-3 rounded-lg bg-purple-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-purple-400">Coach&apos;s Note</p>
                <p className="mt-0.5 text-sm italic text-purple-800">&ldquo;{developmentCard.coach_note}&rdquo;</p>
              </div>
            )}
          </div>
        )}

        {/* ─── Additional Observations ─── */}
        {highlights && highlights.length > 0 && (() => {
          const shown = highlights.slice(0, 3);
          return (
            <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-100">
                  <span className="text-sm">📝</span>
                </div>
                <p className="text-sm font-semibold text-gray-900">More Coaching Highlights</p>
              </div>
              <div className="space-y-3">
                {shown.map((obs: any, i: number) => (
                  <div key={i} className={`border-l-2 pl-3 ${obs.is_highlighted ? 'border-amber-300' : 'border-gray-200'}`}>
                    <div className="flex items-center gap-2">
                      {obs.is_highlighted && <span className="text-xs text-amber-500">⭐</span>}
                      <span className="text-xs font-medium text-orange-600">
                        {formatCategoryLabel(obs.category)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-700">&ldquo;{obs.text}&rdquo;</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ─── Coach's Note ─── */}
        {customMessage && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100">
                <span className="text-sm">✍️</span>
              </div>
              <p className="text-sm font-semibold text-gray-900">Coach&apos;s Note</p>
            </div>
            <blockquote className="rounded-xl bg-gray-50 px-4 py-3 text-sm italic text-gray-700">
              &ldquo;{customMessage}&rdquo;
            </blockquote>
          </div>
        )}

      {/* ─── Reactions ─── */}
      <div className="mx-4 mt-6">
        <ParentReactionForm
          shareToken={token}
          playerFirstName={firstName}
          coachName={coachName}
        />
      </div>

      {/* ─── Viral CTA ─── */}
      <div className="mt-6 text-center">
        <ParentViralCTA coachName={coachName} teamName={team?.name} />
      </div>

        <div className="mt-1 flex justify-center gap-3 text-xs text-gray-400">
          <a href="/privacy" className="hover:text-gray-600">Privacy</a>
          <span>·</span>
          <a href="/terms" className="hover:text-gray-600">Terms</a>
        </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badge metadata
// ---------------------------------------------------------------------------

const BADGE_META: Record<string, { name: string; emoji: string; bg: string; border: string }> = {
  first_star: { name: 'First Star', emoji: '⭐', bg: 'bg-amber-50', border: 'border-amber-200' },
  team_player: { name: 'Team Player', emoji: '🤝', bg: 'bg-blue-50', border: 'border-blue-200' },
  grinder: { name: 'The Grinder', emoji: '💪', bg: 'bg-gray-50', border: 'border-gray-200' },
  all_rounder: { name: 'All-Rounder', emoji: '🎯', bg: 'bg-purple-50', border: 'border-purple-200' },
  breakthrough: { name: 'Breakthrough', emoji: '🚀', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  game_changer: { name: 'Game Changer', emoji: '⚡', bg: 'bg-yellow-50', border: 'border-yellow-200' },
  session_regular: { name: 'Session Regular', emoji: '📅', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  coach_pick: { name: "Coach's Pick", emoji: '🏆', bg: 'bg-orange-50', border: 'border-orange-200' },
  most_improved: { name: 'Most Improved', emoji: '📈', bg: 'bg-teal-50', border: 'border-teal-200' },
  rising_star: { name: 'Rising Star', emoji: '🌟', bg: 'bg-sky-50', border: 'border-sky-200' },
};
