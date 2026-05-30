import type { Metadata } from 'next';
import Link from 'next/link';
import { formatWeekHeader } from '@/lib/weekly-pulse-utils';

// ---------------------------------------------------------------------------
// Public weekly-pulse page (ticket 0057).
//
// Server component. Renders ONE coach's aggregate "what my team is working on
// this week" card the publisher dropped in their league group chat. Same
// gray/orange parent-portal aesthetic 0049 uses for /plan/[token], NOT the
// dark dashboard.
//
// Reachable without auth (publicPaths in src/lib/supabase/middleware.ts).
// COPPA: the public GET allow-list never includes player names, observation
// text, or any minor descriptive field — the route in
// src/app/api/weekly-pulse/[token]/route.ts is the single source of truth on
// what crosses to a public viewer, and its response is asserted keyset-equal
// in tests/api/weekly-pulse-token-get.test.ts.
//
// CTA: a single "I coach too — start free" link to /signup?ref=<referralCode>.
// The referralCode is computed server-side from the joined coach id (the
// public route returns it) so a forged ?ref= in the URL is overwritten by
// the page's computed CTA (LESSONS#0039 — never trust a client-supplied
// identifier).
// ---------------------------------------------------------------------------

interface PulseData {
  coachFirstName?: string | null;
  teamName?: string;
  sportName?: string | null;
  ageGroup?: string | null;
  isoWeek?: string;
  sessionCount?: number;
  topCategories?: string[];
  focusLine?: string | null;
  caption?: string | null;
  referralCode?: string | null;
  error?: string;
  status?: number;
}

async function getPulseData(token: string): Promise<PulseData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/weekly-pulse/${token}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Not found', status: res.status };
    }
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getPulseData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const pageUrl = `${appUrl}/week/${token}`;

  if (!data || data.error || !data.teamName) {
    return {
      title: 'Weekly Pulse — SportsIQ',
      alternates: { canonical: pageUrl },
      openGraph: {
        title: 'Weekly Pulse — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: pageUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const weekHeader = data.isoWeek ? formatWeekHeader(data.isoWeek) : 'This week';
  const coachLine = data.coachFirstName ? ` — by Coach ${data.coachFirstName}` : '';
  const title = `${weekHeader} · ${data.teamName}${coachLine}`;
  const focusBit = data.focusLine ? `Focus: ${data.focusLine}. ` : '';
  const description = `${focusBit}${data.sessionCount ?? 0} session${(data.sessionCount ?? 0) === 1 ? '' : 's'} this week. Start your own team — free.`;

  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: pageUrl,
      images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
          {'\u{1F50D}'}
        </div>
        <h1 className="text-xl font-bold text-gray-900">Weekly pulse not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This pulse link may have been removed. Ask the coach for a new one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Start your own team — free
        </Link>
      </div>
    </div>
  );
}

export default async function WeeklyPulsePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPulseData(token);

  if (!data || data.error || !data.teamName) {
    return <NotFound />;
  }

  const {
    coachFirstName,
    teamName,
    sportName,
    ageGroup,
    isoWeek,
    sessionCount,
    topCategories,
    focusLine,
    caption,
    referralCode,
  } = data;

  const weekHeader = isoWeek ? formatWeekHeader(isoWeek) : 'This week';
  const sportAge = [sportName, ageGroup].filter(Boolean).join(' · ');
  const ctaHref = referralCode ? `/signup?ref=${encodeURIComponent(referralCode)}` : '/signup';

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-2xl px-5 pb-12 pt-10">
        {/* Brand row */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-gray-500">
            SportsIQ
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-500">
            Weekly Pulse
          </span>
        </div>

        {/* Header card */}
        <div
          className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
          data-testid="weekly-pulse-header"
        >
          <p className="text-xs uppercase tracking-widest text-gray-500">
            {weekHeader}
            {coachFirstName ? (
              <>
                {' · '}
                <span className="font-semibold text-orange-600">Coach {coachFirstName}</span>
              </>
            ) : null}
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900">
            {teamName}
          </h1>
          {sportAge && (
            <p className="mt-1 text-sm text-gray-600">{sportAge}</p>
          )}
          {caption && (
            <p
              className="mt-4 rounded-xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-gray-800"
              data-testid="weekly-pulse-caption"
            >
              &ldquo;{caption}&rdquo;
            </p>
          )}
        </div>

        {/* Aggregate details */}
        <div
          className="mt-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm space-y-3"
          data-testid="weekly-pulse-details"
        >
          {focusLine && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Focus this week
              </p>
              <p className="mt-1 text-base font-semibold text-gray-900">{focusLine}</p>
            </div>
          )}
          {topCategories && topCategories.length > 0 && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
                Top categories worked on
              </p>
              <p className="mt-1 text-sm text-gray-800">{topCategories.join(' · ')}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
              Sessions this week
            </p>
            <p className="mt-1 text-sm text-gray-800">
              {sessionCount ?? 0} session{(sessionCount ?? 0) === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-8 text-center" data-testid="weekly-pulse-cta">
          <Link
            href={ctaHref}
            className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600 min-h-[44px]"
          >
            I coach too — start free
          </Link>
          <p className="mt-2 text-xs text-gray-500">
            {coachFirstName ? `Coach ${coachFirstName}` : 'A coach'} uses SportsIQ to plan their week.
          </p>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-gray-500">
            Powered by <span className="font-semibold text-gray-700">SportsIQ</span>
          </p>
          <div className="mt-1 flex justify-center gap-3 text-xs text-gray-500">
            <Link href="/privacy" className="underline hover:text-gray-700">Privacy</Link>
            <Link href="/terms" className="underline hover:text-gray-700">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
