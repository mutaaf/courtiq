import type { Metadata } from 'next';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Public game-recap card (ticket 0027).
//
// Server component. Renders ONE game_recap artifact (team-level fields only —
// player_highlights and per-minor names are stripped server-side by the
// PUBLIC_RECAP_FIELDS allow-list in /api/recap-card/[token]) plus a single CTA
// that deep-links to /signup?ref=<referral code>. Dark zinc-950 + #F97316 orange:
// this sits in the coach-card family of public surfaces. Reachable without auth
// (see publicPaths in src/lib/supabase/middleware.ts).
//
// Mirrors src/app/season-recap/[token]/page.tsx (ticket 0017). The recap a coach
// drops in the team group chat on the drive home: score story, a couple of
// moments, and a short coach message. OG metadata is a text generateMetadata
// preview (no custom OG image renderer — out of scope for v1).
// ---------------------------------------------------------------------------

interface KeyMoment {
  headline?: string;
  description?: string;
  player_name?: string;
}

interface TeamPerformance {
  offensive_note?: string;
  defensive_note?: string;
  effort_note?: string;
}

interface GameRecap {
  title?: string;
  result_headline?: string;
  intro?: string;
  key_moments?: KeyMoment[];
  team_performance?: TeamPerformance;
  coach_message?: string;
  looking_ahead?: string;
}

interface GameRecapData {
  recap?: GameRecap;
  teamName?: string | null;
  coachFirstName?: string | null;
  referralCode?: string;
  error?: string;
  status?: number;
}

async function getRecapData(token: string): Promise<GameRecapData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/recap-card/${token}`, { cache: 'no-store' });
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
// Text-only preview mirroring the season-recap title/description (ticket 0027
// out-of-scope: no custom OG image renderer).
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getRecapData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const recapUrl = `${appUrl}/recap/${token}`;

  if (!data || data.error || !data.recap?.result_headline) {
    return {
      title: 'Game Recap — SportsIQ',
      // Ticket 0038: canonical so a crawler collapses duplicates onto the
      // same indexable URL (preview vs prod produce different canonicals).
      alternates: { canonical: recapUrl },
      openGraph: {
        title: 'Game Recap — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: recapUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const headline = data.recap.result_headline;
  const teamName = data.teamName ? `${data.teamName} · ` : '';
  // Title carries the game result headline; team name is attribution context.
  const title = `${headline} — ${teamName}a SportsIQ Game Recap`;
  const description = data.recap.intro
    ? `${data.recap.intro.slice(0, 160)} Follow your team — free.`
    : `See this team's game recap and make your own — free.`;
  const ogImageUrl = `${appUrl}/opengraph-image`;

  return {
    title,
    description,
    // Ticket 0038: canonical points at this token's public URL.
    alternates: { canonical: recapUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: recapUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${headline} — SportsIQ Game Recap` }],
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
        <h2 className="text-xl font-bold text-zinc-100">Game Recap Not Found</h2>
        <p className="mt-2 text-sm text-zinc-400">
          This recap link may have been removed. Ask the coach for a new one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Follow your team — free
        </Link>
      </div>
    </div>
  );
}

// Tint the result line by win / loss / tie, matching the in-app GameRecapCard.
function resultColor(headline: string): string {
  const lower = (headline || '').toLowerCase();
  if (lower.includes('victor') || lower.includes('win') || lower.includes('triumph')) return 'text-emerald-400';
  if (lower.includes('loss') || lower.includes('tough') || lower.includes('fell')) return 'text-red-400';
  if (lower.includes('tie') || lower.includes('draw')) return 'text-zinc-400';
  return 'text-orange-400';
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default async function GameRecapPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getRecapData(token);

  if (!data || data.error || !data.recap?.result_headline) {
    return <NotFound />;
  }

  const { recap, teamName, coachFirstName, referralCode } = data;
  const r = recap!;
  const moments = Array.isArray(r.key_moments) ? r.key_moments : [];
  const perf = r.team_performance ?? {};

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
            Game Recap
          </span>
        </div>

        {/* Hero */}
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-7 text-center shadow-xl">
          <h1 className={`text-3xl font-extrabold tracking-tight ${resultColor(r.result_headline ?? '')}`}>
            {r.result_headline}
          </h1>
          {teamName && (
            <p className="mt-3 text-xs uppercase tracking-widest text-zinc-500">
              {teamName}
              {coachFirstName ? ` · Coach ${coachFirstName}` : ''}
            </p>
          )}
        </div>

        {/* Intro / the story */}
        {r.intro && (
          <p className="mt-6 text-center text-sm leading-relaxed text-zinc-300">
            {r.intro}
          </p>
        )}

        {/* Key moments */}
        {moments.length > 0 && (
          <div className="mt-7 space-y-3">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Key moments
            </h2>
            {moments.map((m, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                {m.headline && (
                  <p className="text-sm font-semibold text-zinc-100">{m.headline}</p>
                )}
                {m.description && (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-400">{m.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Team performance */}
        {(perf.offensive_note || perf.defensive_note || perf.effort_note) && (
          <div className="mt-7 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              How the team played
            </h2>
            <div className="space-y-2 text-sm leading-relaxed text-zinc-300">
              {perf.offensive_note && (
                <p><span className="font-semibold text-zinc-500">Offense: </span>{perf.offensive_note}</p>
              )}
              {perf.defensive_note && (
                <p><span className="font-semibold text-zinc-500">Defense: </span>{perf.defensive_note}</p>
              )}
              {perf.effort_note && (
                <p><span className="font-semibold text-zinc-500">Effort: </span>{perf.effort_note}</p>
              )}
            </div>
          </div>
        )}

        {/* Coach message */}
        {r.coach_message && (
          <p className="mt-8 text-center text-lg font-bold italic text-zinc-200">
            &ldquo;{r.coach_message}&rdquo;
          </p>
        )}

        {/* Looking ahead */}
        {r.looking_ahead && (
          <p className="mt-6 text-center text-sm leading-relaxed text-orange-300">
            {r.looking_ahead}
          </p>
        )}

        {/* CTA — the referral payload */}
        <div className="mt-10 rounded-3xl border border-orange-500/30 bg-orange-500/5 p-6 text-center">
          <p className="text-sm text-zinc-300">
            Want recaps like this for your team every game?
          </p>
          <Link
            href={signupHref}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-base font-semibold text-white hover:bg-orange-600"
          >
            Follow your team — free
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
