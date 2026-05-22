import type { Metadata } from 'next';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Public season-recap card (ticket 0017).
//
// Server component. Renders ONE season_summary artifact (team-level fields only
// — player_breakthroughs and per-player names are stripped server-side by the
// PUBLIC_RECAP_FIELDS allow-list in /api/season-recap/[token]) plus a single CTA
// that deep-links to /signup?ref=<referral code>. Dark zinc-950 + #F97316 orange:
// this is a COACH-facing brag surface, not the gray/orange parent portal.
// Reachable without auth (see publicPaths in src/lib/supabase/middleware.ts).
//
// Mirrors src/app/team-card/[token]/page.tsx (ticket 0010). OG metadata is a
// text generateMetadata preview (no custom OG image renderer — out of scope).
// ---------------------------------------------------------------------------

interface Highlight {
  title?: string;
  description?: string;
}

interface SkillProgress {
  skill?: string;
  status?: string;
  description?: string;
}

interface SeasonRecap {
  headline?: string;
  season_period?: string;
  overall_assessment?: string;
  team_highlights?: Highlight[];
  skill_progress?: SkillProgress[];
  team_challenges?: string[];
  coaching_insights?: string;
  next_season_priorities?: string[];
  closing_message?: string;
}

interface SeasonRecapData {
  recap?: SeasonRecap;
  teamName?: string | null;
  coachFirstName?: string | null;
  referralCode?: string;
  error?: string;
  status?: number;
}

// Human labels for the skill_progress status enum.
const STATUS_LABEL: Record<string, string> = {
  strength: 'Strength',
  most_improved: 'Most improved',
  consistent: 'Consistent',
  needs_work: 'Keep working',
};

async function getSeasonRecapData(token: string): Promise<SeasonRecapData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/season-recap/${token}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Not found', status: res.status };
    }
    return res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Social metadata — rich previews when a coach pastes the link in a group chat.
// Text-only preview mirroring the team-card title/description (ticket 0017
// out-of-scope: no custom OG image renderer).
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getSeasonRecapData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const recapUrl = `${appUrl}/season-recap/${token}`;

  if (!data || data.error || !data.recap?.headline) {
    return {
      title: 'Season Recap — SportsIQ',
      openGraph: {
        title: 'Season Recap — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: recapUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const headline = data.recap.headline;
  const teamName = data.teamName ? `${data.teamName} · ` : '';
  // Title carries the season headline (asserted by the e2e OG test); team name
  // is included as attribution context.
  const title = `${headline} — ${teamName}a SportsIQ Season Recap`;
  const description = data.recap.overall_assessment
    ? `${data.recap.overall_assessment.slice(0, 160)} Make your team's recap — free.`
    : `See this team's season story and make your own — free.`;
  const ogImageUrl = `${appUrl}/opengraph-image`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: recapUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${headline} — SportsIQ Season Recap` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

// ---------------------------------------------------------------------------
// Error state — dark, no chrome, no login.
// ---------------------------------------------------------------------------
function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4 text-zinc-100">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-800 text-2xl">
          {'\u{1F50D}'}
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Season Recap Not Found</h2>
        <p className="mt-2 text-sm text-zinc-400">
          This recap link may have been removed. Ask the coach for a new one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Make your team&apos;s recap — free
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default async function SeasonRecapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getSeasonRecapData(token);

  if (!data || data.error || !data.recap?.headline) {
    return <NotFound />;
  }

  const { recap, teamName, coachFirstName, referralCode } = data;
  const r = recap!;
  const highlights = Array.isArray(r.team_highlights) ? r.team_highlights : [];
  const skills = Array.isArray(r.skill_progress) ? r.skill_progress : [];
  const challenges = Array.isArray(r.team_challenges) ? r.team_challenges : [];
  const priorities = Array.isArray(r.next_season_priorities) ? r.next_season_priorities : [];

  // The CTA is the whole point: deep-link to signup carrying the referral code.
  const signupHref = referralCode ? `/signup?ref=${referralCode}` : '/signup';

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-lg px-5 pb-12 pt-10">
        {/* Brand */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-zinc-400">
            SportsIQ
          </span>
          <span className="rounded-full border border-zinc-800 px-2.5 py-0.5 text-[11px] text-zinc-500">
            Season Recap
          </span>
        </div>

        {/* Hero */}
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-7 text-center shadow-xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-50">
            {r.headline}
          </h1>
          {r.season_period && (
            <p className="mt-2 text-sm font-medium text-orange-400">{r.season_period}</p>
          )}
          {teamName && (
            <p className="mt-3 text-xs uppercase tracking-widest text-zinc-500">
              {teamName}
              {coachFirstName ? ` · Coach ${coachFirstName}` : ''}
            </p>
          )}
        </div>

        {/* Overall assessment */}
        {r.overall_assessment && (
          <p className="mt-6 text-center text-sm leading-relaxed text-zinc-300">
            {r.overall_assessment}
          </p>
        )}

        {/* Season highlights */}
        {highlights.length > 0 && (
          <div className="mt-7 space-y-3">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Season highlights
            </h2>
            {highlights.map((h, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                {h.title && (
                  <p className="text-sm font-semibold text-zinc-100">{h.title}</p>
                )}
                {h.description && (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{h.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Skill progress */}
        {skills.length > 0 && (
          <div className="mt-7">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              How the team grew
            </h2>
            <div className="space-y-3">
              {skills.map((s, i) => (
                <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                  <div className="mb-1 flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-zinc-100">{s.skill}</span>
                    {s.status && (
                      <span className="rounded-full border border-orange-500/30 bg-orange-500/10 px-2.5 py-0.5 text-[11px] font-medium text-orange-300">
                        {STATUS_LABEL[s.status] ?? s.status}
                      </span>
                    )}
                  </div>
                  {s.description && (
                    <p className="text-xs leading-relaxed text-zinc-400">{s.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coaching insights */}
        {r.coaching_insights && (
          <div className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              What the season showed
            </h2>
            <p className="text-sm leading-relaxed text-zinc-300">{r.coaching_insights}</p>
          </div>
        )}

        {/* Team challenges */}
        {challenges.length > 0 && (
          <div className="mt-7">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              What to work on
            </h2>
            <ul className="space-y-2">
              {challenges.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Next-season priorities */}
        {priorities.length > 0 && (
          <div className="mt-7">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Next season
            </h2>
            <div className="flex flex-wrap gap-2">
              {priorities.map((p, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-300"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Closing message */}
        {r.closing_message && (
          <p className="mt-8 text-center text-lg font-bold italic text-zinc-200">
            &ldquo;{r.closing_message}&rdquo;
          </p>
        )}

        {/* CTA — the referral payload */}
        <div className="mt-10 rounded-3xl border border-orange-500/30 bg-orange-500/5 p-6 text-center">
          <p className="text-sm text-zinc-300">
            Every season tells a story. Capture your team&apos;s.
          </p>
          <Link
            href={signupHref}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-base font-semibold text-white hover:bg-orange-600"
          >
            Make your team&apos;s recap — start free
          </Link>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-zinc-600">
            Powered by <span className="font-semibold text-zinc-400">SportsIQ</span>
          </p>
          <div className="mt-1 flex justify-center gap-3 text-xs text-zinc-600">
            <Link href="/privacy" className="underline hover:text-zinc-400">Privacy</Link>
            <Link href="/terms" className="underline hover:text-zinc-400">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
