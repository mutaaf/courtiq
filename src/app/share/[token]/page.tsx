import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ParentViralCTA } from '@/components/share/parent-viral-cta';
import { ParentReactionForm } from '@/components/share/parent-reaction-form';
import { Megaphone, MessageCircle } from 'lucide-react';
import {
  buildSeasonStats,
  getImprovingSkills,
  formatCategoryLabel,
  buildProgressMessage,
  hasEnoughDataForJourney,
  sortSkillsByImprovingFirst,
} from '@/lib/skill-journey-utils';
import type { SkillProgress, ShareObservation } from '@/lib/skill-journey-utils';

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
    emoji: '\u2B50',
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
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800">
          {skill.skill_name || skill.skill_id}
        </span>
        <span className={`inline-flex items-center gap-1 text-xs font-medium ${prof.textColor}`}>
          <span>{prof.emoji}</span>
          {prof.label}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${prof.barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

function ErrorPage({ isExpired, needsPin }: { isExpired: boolean; needsPin: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
          {isExpired ? '\u{23F3}' : needsPin ? '\u{1F512}' : '\u{1F50D}'}
        </div>
        <h2 className="text-xl font-bold text-gray-900">
          {isExpired ? 'Link Expired' : needsPin ? 'PIN Required' : 'Report Not Found'}
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          {isExpired
            ? 'This share link has expired. Please ask the coach for a new link.'
            : needsPin
            ? 'This report requires a PIN to access. Please contact the coach.'
            : 'This share link may have expired or been revoked.'}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
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
    totalObservationCount,
    recentObservationActivity,
    achievements,
    latestSessionMessage,
  } = data;

  const playerName = player?.nickname || player?.name || 'your player';
  const firstName = playerName.split(' ')[0];
  const parentName = player?.parent_name || null;
  const teamName = team?.name || 'the team';
  const season = team?.season || null;
  const brandColor = branding?.primary_color || '#F97316'; // orange fallback

  // Achievement badge metadata — emoji + colour per badge type
  const BADGE_META: Record<string, { emoji: string; name: string; description: string; color: string }> = {
    first_star:       { emoji: '⭐', name: 'First Star',       description: 'Earned first positive observation',          color: 'bg-amber-50 border-amber-200 text-amber-800' },
    team_player:      { emoji: '🤝', name: 'Team Player',      description: '10+ positive observations recorded',          color: 'bg-blue-50 border-blue-200 text-blue-800' },
    grinder:          { emoji: '💪', name: 'Grinder',          description: '25+ total observations recorded',             color: 'bg-orange-50 border-orange-200 text-orange-800' },
    all_rounder:      { emoji: '🎯', name: 'All-Rounder',      description: 'Observed in 4+ skill categories',             color: 'bg-purple-50 border-purple-200 text-purple-800' },
    breakthrough:     { emoji: '🚀', name: 'Breakthrough',     description: 'Reached game-ready proficiency',              color: 'bg-emerald-50 border-emerald-200 text-emerald-800' },
    game_changer:     { emoji: '⚡', name: 'Game Changer',     description: 'Stood out during a game or scrimmage',        color: 'bg-yellow-50 border-yellow-200 text-yellow-800' },
    session_regular:  { emoji: '📅', name: 'Session Regular',  description: 'Showed up to 10+ sessions',                   color: 'bg-teal-50 border-teal-200 text-teal-800' },
    coach_pick:       { emoji: '🏆', name: "Coach's Pick",     description: 'Awarded for outstanding effort or attitude',   color: 'bg-rose-50 border-rose-200 text-rose-800' },
    most_improved:    { emoji: '📈', name: 'Most Improved',    description: 'Greatest improvement on the team',            color: 'bg-indigo-50 border-indigo-200 text-indigo-800' },
    rising_star:      { emoji: '🌟', name: 'Rising Star',      description: 'Shows exceptional promise and potential',     color: 'bg-pink-50 border-pink-200 text-pink-800' },
  };

  // Skill journey — computed from the lightweight observation activity payload
  const safeObs: ShareObservation[] = Array.isArray(recentObservationActivity)
    ? recentObservationActivity
    : [];
  const safeSkills: SkillProgress[] = Array.isArray(skillProgress) ? skillProgress : [];
  const seasonStats = buildSeasonStats(safeObs, safeSkills);
  const improvingSkills = getImprovingSkills(safeSkills);
  const sortedSkills = sortSkillsByImprovingFirst(safeSkills);
  const showJourney = hasEnoughDataForJourney(safeObs, safeSkills) || (totalObservationCount ?? 0) >= 3;
  const progressMessage = buildProgressMessage(firstName, improvingSkills, totalObservationCount ?? 0);

  // Extract celebratable items from report card
  const celebrations: string[] = [];
  if (reportCard?.strengths) {
    for (const s of reportCard.strengths.slice(0, 3)) {
      celebrations.push(typeof s === 'string' ? s : s.skill || s.description || s.name || String(s));
    }
  }

  // Extract next challenge from development card or report card
  let nextChallenge: string | null = null;
  if (developmentCard?.focus_areas?.[0]) {
    const area = developmentCard.focus_areas[0];
    nextChallenge = typeof area === 'string' ? area : area.name || area.skill || String(area);
  } else if (reportCard?.areas_for_improvement?.[0]) {
    const area = reportCard.areas_for_improvement[0];
    nextChallenge = typeof area === 'string' ? area : area.skill || area.description || area.name || String(area);
  }

  // Get the first recommended drill for home practice
  let homePractice: { name: string; description?: string } | null = null;
  if (recommendedDrills?.[0]) {
    const drill = recommendedDrills[0];
    homePractice = typeof drill === 'string'
      ? { name: drill }
      : { name: drill.name || drill.title || String(drill), description: drill.description };
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-lg pb-10">
        {/* ─── Header with branding ─── */}
        <div className="px-6 pt-8 pb-6 text-center">
          {branding?.logo_light_url && (
            <img
              src={branding.logo_light_url}
              alt="Organization logo"
              className="mx-auto mb-3 h-10 w-auto object-contain"
            />
          )}
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
            {branding?.parent_portal_header_text || 'Progress Report'}
          </p>
          <h1
            className="mt-1 text-2xl font-bold"
            style={{ color: brandColor }}
          >
            {teamName}
          </h1>
        </div>

        {/* ─── Player card ─── */}
        <div className="mx-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <PlayerAvatar
              photoUrl={player?.photo_url}
              name={player?.name || '?'}
              size={64}
              className="ring-0"
            />
            <div>
              <h2 className="text-lg font-bold text-gray-900">{player?.name || 'Player'}</h2>
              <p className="text-sm text-gray-500">
                {[player?.position, player?.jersey_number != null ? `#${player.jersey_number}` : null, season]
                  .filter(Boolean)
                  .join(' \u00B7 ')}
              </p>
            </div>
          </div>

          {/* Greeting */}
          <div className="mt-5 rounded-xl bg-gray-50 p-4">
            <p className="text-sm leading-relaxed text-gray-700">
              {parentName ? (
                <>Dear {parentName},</>
              ) : (
                <>Hello!</>
              )}
              {' '}
              Here&apos;s how <span className="font-semibold">{firstName}</span> is doing
              {season ? ` this ${season.toLowerCase()}` : ''} with {teamName}.
              {coachName && (
                <> We&apos;re excited to share this update with you!</>
              )}
            </p>
          </div>
        </div>

        {/* ─── Coach's Latest Session Update ─── */}
        {latestSessionMessage && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm border border-emerald-100">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                </div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Coach&apos;s Update
                </h3>
              </div>
              {latestSessionMessage.session_label && (
                <span className="text-[11px] text-gray-400">
                  {latestSessionMessage.session_label}
                </span>
              )}
            </div>

            <p className="text-sm leading-relaxed text-gray-800">
              {latestSessionMessage.message}
            </p>

            {latestSessionMessage.highlight && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-sm" aria-hidden="true">✨</span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                    Highlight
                  </p>
                  <p className="mt-0.5 text-sm text-gray-700">
                    {latestSessionMessage.highlight}
                  </p>
                </div>
              </div>
            )}

            {latestSessionMessage.next_focus && (
              <div className="mt-2 flex items-start gap-2 rounded-xl bg-orange-50 px-3 py-2.5">
                <span className="mt-0.5 shrink-0 text-sm" aria-hidden="true">🎯</span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700">
                    Next Focus
                  </p>
                  <p className="mt-0.5 text-sm text-gray-700">
                    {latestSessionMessage.next_focus}
                  </p>
                </div>
              </div>
            )}

            {coachName && (
              <p className="mt-3 text-right text-xs font-medium text-gray-500">
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
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                From the Coach
              </span>
            </div>
            <div className="space-y-2">
              {announcements.map((ann: { id: string; title: string; body: string }) => (
                <div key={ann.id}>
                  <p className="text-sm font-medium text-gray-800">{ann.title}</p>
                  <p className="text-sm text-gray-600 leading-relaxed">{ann.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Featured Highlight ─── */}
        {featuredHighlight && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u2728'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                This Week&apos;s Highlight
              </h3>
            </div>
            <p className="text-base leading-relaxed text-gray-800 italic">
              &ldquo;{featuredHighlight.text}&rdquo;
            </p>
            <p className="mt-2 text-xs text-gray-400">
              {new Date(featuredHighlight.created_at).toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
        )}

        {/* ─── Season Stats ─── */}
        {showJourney && (totalObservationCount > 0 || safeSkills.length > 0) && (
          <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F4C8}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                Season at a Glance
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-gray-700 mb-4">{progressMessage}</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-white/80 p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-orange-500">{totalObservationCount ?? 0}</p>
                <p className="mt-0.5 text-[11px] text-gray-500 leading-tight">Coach<br />Observations</p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-emerald-500">{seasonStats.improvingSkillCount}</p>
                <p className="mt-0.5 text-[11px] text-gray-500 leading-tight">Skills<br />Improving</p>
              </div>
              <div className="rounded-xl bg-white/80 p-3 text-center shadow-sm">
                <p className="text-2xl font-bold text-blue-500">{seasonStats.recentObsCount}</p>
                <p className="mt-0.5 text-[11px] text-gray-500 leading-tight">This<br />Fortnight</p>
              </div>
            </div>
            {seasonStats.mostActiveCategory && (
              <p className="mt-3 text-center text-xs text-gray-500">
                Most practised: <span className="font-semibold text-gray-700">{formatCategoryLabel(seasonStats.mostActiveCategory)}</span>
              </p>
            )}
          </div>
        )}

        {/* ─── Skills on the Rise ─── */}
        {improvingSkills.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-emerald-50 border border-emerald-100 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F680}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Skills on the Rise
              </h3>
            </div>
            <p className="mb-3 text-sm text-gray-600 leading-relaxed">
              {firstName}&apos;s coach has observed improvement in these areas:
            </p>
            <div className="flex flex-wrap gap-2">
              {improvingSkills.map((s) => (
                <span
                  key={s.skill_id}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800"
                >
                  <span className="text-emerald-500">↑</span>
                  {s.skill_name || formatCategoryLabel(s.category)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── Achievement Badges ─── */}
        {Array.isArray(achievements) && achievements.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">🏅</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                Achievements Earned
              </h3>
            </div>
            <p className="mb-4 text-sm text-gray-600 leading-relaxed">
              {firstName} has earned {achievements.length === 1 ? 'this badge' : `${achievements.length} badges`} this season!
            </p>
            <div className="grid grid-cols-2 gap-2">
              {achievements.map((a: { badge_type: string; awarded_at: string; note?: string }) => {
                const meta = BADGE_META[a.badge_type];
                if (!meta) return null;
                return (
                  <div
                    key={a.badge_type}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 ${meta.color}`}
                  >
                    <span className="text-2xl leading-none shrink-0" aria-hidden="true">{meta.emoji}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold leading-tight">{meta.name}</p>
                      <p className="mt-0.5 text-[11px] leading-tight opacity-75">
                        {a.note || meta.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Skill Progress ─── */}
        {sortedSkills.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-lg">{'\u{1F4CA}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Skill Progress
              </h3>
            </div>
            <div className="space-y-4">
              {sortedSkills.map((skill: any) => (
                <SkillBar key={skill.skill_id} skill={skill} />
              ))}
            </div>
            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-3 border-t border-gray-100 pt-3">
              {Object.values(PROFICIENCY_LEVELS).map((level) => (
                <span
                  key={level.label}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${level.bgColor} ${level.textColor}`}
                >
                  {level.emoji} {level.label}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ─── What to Celebrate ─── */}
        {celebrations.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F389}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                What to Celebrate
              </h3>
            </div>
            <ul className="space-y-2">
              {celebrations.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span className="mt-0.5 shrink-0 text-emerald-500">{'\u2713'}</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ─── Next Challenge ─── */}
        {(nextChallenge || homePractice) && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F3AF}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Next Challenge
              </h3>
            </div>
            {homePractice && (
              <div className="rounded-xl bg-blue-50 p-4">
                <p className="text-sm font-medium text-blue-800">{homePractice.name}</p>
                {homePractice.description && (
                  <p className="mt-1 text-sm text-blue-600">{homePractice.description}</p>
                )}
              </div>
            )}
            {!homePractice && nextChallenge && (
              <p className="text-sm text-gray-700">{nextChallenge}</p>
            )}
          </div>
        )}

        {/* ─── Recent Highlights (additional) ─── */}
        {highlights && highlights.length > 1 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F4DD}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Recent Observations
              </h3>
            </div>
            <div className="space-y-3">
              {highlights.slice(1, 6).map((obs: any, i: number) => (
                <div key={i} className="border-l-2 border-gray-200 pl-3">
                  <p className="text-sm text-gray-700">{obs.text}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {obs.category && <>{obs.category} &middot; </>}
                    {new Date(obs.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Coach's Note ─── */}
        {(customMessage || reportCard?.coach_message) && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">{'\u{1F4AC}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Coach&apos;s Note
              </h3>
            </div>
            <p className="text-sm italic leading-relaxed text-gray-700">
              &ldquo;{customMessage || reportCard?.coach_message}&rdquo;
            </p>
            {coachName && (
              <p className="mt-3 text-sm font-medium text-gray-800">
                &mdash; Coach {coachName}
              </p>
            )}
            <p className="text-xs text-gray-400">
              {teamName}{season ? ` \u00B7 ${season}` : ''}
            </p>
          </div>
        )}

        {/* ─── Parent Reaction ─── */}
        <div className="mx-4 mt-4">
          <ParentReactionForm
            shareToken={token}
            playerFirstName={firstName}
            coachName={coachName}
          />
        </div>

        {/* ─── Viral CTA ─── */}
        <div className="mx-4 mt-6">
          <ParentViralCTA coachName={coachName} teamName={team?.name} />
        </div>

        {/* ─── Footer ─── */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold">SportsIQ</span>
          </p>
          <div className="mt-1 flex justify-center gap-3 text-xs text-gray-400">
            <a href="/privacy" className="hover:text-gray-600 underline">Privacy</a>
            <a href="/terms" className="hover:text-gray-600 underline">Terms</a>
          </div>
        </div>
      </div>
    </div>
  );
}
