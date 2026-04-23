import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ParentViralCTA } from '@/components/share/parent-viral-cta';
import { ParentReactionForm } from '@/components/share/parent-reaction-form';
import { Megaphone } from 'lucide-react';

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
  } = data;

  const playerName = player?.nickname || player?.name || 'your player';
  const firstName = playerName.split(' ')[0];
  const parentName = player?.parent_name || null;
  const teamName = team?.name || 'the team';
  const season = team?.season || null;
  const brandColor = branding?.primary_color || '#F97316'; // orange fallback

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

        {/* ─── Skill Progress ─── */}
        {skillProgress && skillProgress.length > 0 && (
          <div className="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <span className="text-lg">{'\u{1F4CA}'}</span>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Skill Progress
              </h3>
            </div>
            <div className="space-y-4">
              {skillProgress.map((skill: any) => (
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
