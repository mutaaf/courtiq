import type { Metadata } from 'next';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Public mid-season team newsletter (ticket 0043).
//
// Server component. Renders ONE mid_season_team_newsletter artifact (five
// short blocks the coach taps once and sends to every parent at once: a
// headline, a two-sentence arc summary, two team strengths, two focus areas,
// and one coach-voice quote).
//
// Parent-portal aesthetic: gray-50 background + orange accent (NOT the dark
// zinc dashboard / coach-card surfaces). This sits in the parent-facing
// share family with /share/[token] (parent report) and is reachable without
// auth via the existing `/share/` and `/api/share/` publicPaths prefixes in
// src/lib/supabase/middleware.ts (LESSONS#0038 family — verified the
// prefix already covers this subroute, no new entry required).
//
// COPPA: the artifact's schema has NO per-player field, so no name strip is
// needed — the boundary is structural. The team name + coach first name are
// attribution context only.
// ---------------------------------------------------------------------------

interface Newsletter {
  headline?: string;
  arc_summary?: string;
  team_strengths?: string[];
  focus_areas?: string[];
  coach_voice_quote?: string;
}

interface NewsletterData {
  newsletter?: Newsletter;
  teamName?: string | null;
  coachFirstName?: string | null;
  error?: string;
  status?: number;
}

async function getNewsletterData(token: string): Promise<NewsletterData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/share/team-newsletter/${token}`, { cache: 'no-store' });
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
// Social metadata — text-only preview (no custom OG image; the engineering
// note is explicit that OG / sitemap is a follow-up). robots:noindex by
// page-level metadata so the public newsletter doesn't show up in search.
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getNewsletterData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const url = `${appUrl}/share/team-newsletter/${token}`;

  if (!data || data.error || !data.newsletter?.headline) {
    return {
      title: 'Team Newsletter — SportsIQ',
      robots: { index: false, follow: false },
      alternates: { canonical: url },
    };
  }

  const teamName = data.teamName ? `${data.teamName} — ` : '';
  const title = `${teamName}mid-season update`;
  const description = data.newsletter.arc_summary
    ? data.newsletter.arc_summary.slice(0, 200)
    : data.newsletter.headline;

  return {
    title,
    description,
    // v1 is noindex-friendly until OG / sitemap follow-up ships (engineering note).
    robots: { index: false, follow: false },
    alternates: { canonical: url },
  };
}

// ---------------------------------------------------------------------------
// Error state — light, parent-portal styled.
// ---------------------------------------------------------------------------
function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-gray-900">Newsletter not found</h2>
        <p className="mt-2 text-sm text-gray-500">
          This newsletter link may have been removed. Ask the coach for a new one.
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

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default async function TeamNewsletterPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getNewsletterData(token);

  if (!data || data.error || !data.newsletter?.headline) {
    return <NotFound />;
  }

  const { newsletter, teamName, coachFirstName } = data;
  const n = newsletter!;
  const strengths = Array.isArray(n.team_strengths) ? n.team_strengths : [];
  const focus = Array.isArray(n.focus_areas) ? n.focus_areas : [];

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-lg px-5 pb-12 pt-10">
        {/* Brand */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-gray-500">
            SportsIQ
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-500">
            Mid-Season Update
          </span>
        </div>

        {/* The newsletter card — single data-testid container so the e2e spec
            can scope strict-mode locators (LESSONS#0081). */}
        <div
          data-testid="mid-season-newsletter-card"
          className="rounded-3xl border border-gray-200 bg-white p-7 shadow-sm"
        >
          {/* Headline */}
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            {n.headline}
          </h1>
          {teamName && (
            <p className="mt-3 text-xs uppercase tracking-widest text-gray-500">
              {teamName}
              {coachFirstName ? ` · Coach ${coachFirstName}` : ''}
            </p>
          )}

          {/* Arc summary */}
          {n.arc_summary && (
            <p className="mt-6 text-base leading-relaxed text-gray-700">
              {n.arc_summary}
            </p>
          )}

          {/* Strengths */}
          {strengths.length > 0 && (
            <div className="mt-7">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                What is clicking
              </h2>
              <ul className="space-y-2">
                {strengths.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-800"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                      aria-hidden="true"
                    />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Focus areas */}
          {focus.length > 0 && (
            <div className="mt-6">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                What we are focused on next
              </h2>
              <ul className="space-y-2">
                {focus.map((s, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm leading-relaxed text-gray-800"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500"
                      aria-hidden="true"
                    />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Coach voice quote */}
          {n.coach_voice_quote && (
            <p className="mt-8 border-l-4 border-orange-500 bg-orange-50 px-5 py-4 text-base italic leading-relaxed text-gray-800">
              &ldquo;{n.coach_voice_quote}&rdquo;
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center">
          <p className="text-xs text-gray-500">
            Sent by your coach via <span className="font-semibold text-gray-700">SportsIQ</span>
          </p>
          <div className="mt-1 flex justify-center gap-3 text-xs text-gray-400">
            <Link href="/privacy" className="underline hover:text-gray-600">
              Privacy
            </Link>
            <Link href="/terms" className="underline hover:text-gray-600">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
