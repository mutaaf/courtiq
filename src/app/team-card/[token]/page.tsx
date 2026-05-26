import type { Metadata } from 'next';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Public coach-to-coach referral card (ticket 0010).
//
// Server component. Renders ONE team_personality artifact (team-level fields
// only — COPPA) plus a single CTA that deep-links to /signup?ref=<referral code>.
// Dark zinc-950 + #F97316 orange: this is a COACH-facing surface, not the
// gray/orange parent portal. Reachable without auth (see publicPaths in
// src/lib/supabase/middleware.ts).
// ---------------------------------------------------------------------------

interface Trait {
  name: string;
  score: number;
  description?: string;
}

interface TeamCardData {
  personality?: {
    team_type?: string;
    type_emoji?: string;
    tagline?: string;
    description?: string;
    traits?: Trait[];
    strengths?: string[];
    growth_areas?: string[];
    coaching_tips?: string[];
    team_motto?: string;
  };
  teamName?: string | null;
  coachFirstName?: string | null;
  referralCode?: string;
  error?: string;
  status?: number;
}

async function getTeamCardData(token: string): Promise<TeamCardData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/team-card/${token}`, { cache: 'no-store' });
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
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getTeamCardData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const cardUrl = `${appUrl}/team-card/${token}`;
  const ogImageUrl = `${appUrl}/team-card/${token}/opengraph-image`;

  if (!data || data.error || !data.personality?.team_type) {
    return {
      title: 'Team Card — SportsIQ',
      // Ticket 0038: canonical so a crawler collapses duplicates (preview /
      // prod / share variants) onto the same indexable URL.
      alternates: { canonical: cardUrl },
      openGraph: {
        title: 'Team Card — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: cardUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const teamType = data.personality.team_type;
  const tagline = data.personality.tagline || 'Made with SportsIQ.';
  const title = `${teamType} — a SportsIQ Team Card`;
  const description = `${tagline} See this team's identity card and make your own — free.`;

  return {
    title,
    description,
    // Ticket 0038: canonical points at this token's public URL.
    alternates: { canonical: cardUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: cardUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${teamType} — SportsIQ Team Card` }],
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
        <h2 className="text-xl font-bold text-zinc-100">Team Card Not Found</h2>
        <p className="mt-2 text-sm text-zinc-400">
          This card link may have been removed. Ask the coach for a new one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Make your team&apos;s card — free
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default async function TeamCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getTeamCardData(token);

  if (!data || data.error || !data.personality?.team_type) {
    return <NotFound />;
  }

  const { personality, teamName, coachFirstName, referralCode } = data;
  const p = personality!;
  const traits = Array.isArray(p.traits) ? p.traits : [];
  const strengths = Array.isArray(p.strengths) ? p.strengths : [];
  const tips = Array.isArray(p.coaching_tips) ? p.coaching_tips : [];

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
            Team Card
          </span>
        </div>

        {/* Hero card */}
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-7 text-center shadow-xl">
          {p.type_emoji && (
            <div className="mb-3 text-5xl leading-none" aria-hidden="true">
              {p.type_emoji}
            </div>
          )}
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-50">
            {p.team_type}
          </h1>
          {p.tagline && (
            <p className="mt-2 text-base font-medium text-orange-400">{p.tagline}</p>
          )}
          {teamName && (
            <p className="mt-3 text-xs uppercase tracking-widest text-zinc-500">
              {teamName}
              {coachFirstName ? ` · Coach ${coachFirstName}` : ''}
            </p>
          )}
        </div>

        {/* Description */}
        {p.description && (
          <p className="mt-6 text-center text-sm leading-relaxed text-zinc-300">
            {p.description}
          </p>
        )}

        {/* Traits */}
        {traits.length > 0 && (
          <div className="mt-7 space-y-3">
            {traits.map((trait, i) => (
              <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-100">{trait.name}</span>
                  <span className="text-xs font-bold text-orange-400">{trait.score}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${Math.max(0, Math.min(100, trait.score))}%` }}
                  />
                </div>
                {trait.description && (
                  <p className="mt-2 text-xs leading-relaxed text-zinc-400">{trait.description}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Strengths */}
        {strengths.length > 0 && (
          <div className="mt-7">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              What they do best
            </h2>
            <div className="flex flex-wrap gap-2">
              {strengths.map((s, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-300"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Coaching tips */}
        {tips.length > 0 && (
          <div className="mt-7">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              How to coach them
            </h2>
            <ul className="space-y-2">
              {tips.map((t, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden="true" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Motto */}
        {p.team_motto && (
          <p className="mt-8 text-center text-lg font-bold italic text-zinc-200">
            &ldquo;{p.team_motto}&rdquo;
          </p>
        )}

        {/* CTA — the referral payload */}
        <div className="mt-10 rounded-3xl border border-orange-500/30 bg-orange-500/5 p-6 text-center">
          <p className="text-sm text-zinc-300">
            Every team has a personality. Find your team&apos;s.
          </p>
          <Link
            href={signupHref}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-base font-semibold text-white hover:bg-orange-600"
          >
            Make your team&apos;s card — free
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
