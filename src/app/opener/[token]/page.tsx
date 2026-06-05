import type { Metadata } from 'next';
import Link from 'next/link';
import { ParentReactionForm } from '@/components/share/parent-reaction-form';
import {
  buildSeasonOpenerMetadata,
  type SeasonOpenerPayload,
} from '@/lib/season-opener-metadata';

// ---------------------------------------------------------------------------
// Public season-opener parent intro card (ticket 0068).
//
// SERVER component. Renders the team-level fields the route returns + the
// existing <ParentReactionForm /> reaction strip. Parent-portal aesthetic
// (gray + orange, NOT dark coach surface — mirrors /drill/[token],
// /week/[token], and /share/[token]). Reachable without auth — the
// `/opener/` prefix is in `publicPaths` in `src/lib/supabase/middleware.ts`.
//
// COPPA: the public API returns ONLY {teamName, ageGroup, sportName,
// seasonLabel, coachFirstName, coachHandle, focusLine, createdAt} — no
// player, no observation text, no DOB / jersey / parent contact. The page
// renders ONLY those fields.
//
// Per LESSONS#0009: this IS a server component, so `getOpenerData()` runs
// on the server and is NOT interceptable by Playwright `page.route()`; the
// e2e seeds a real row, never a mock.
// ---------------------------------------------------------------------------

interface OpenerData extends SeasonOpenerPayload {
  coachHandle?: string | null;
  createdAt?: string;
  error?: string;
  status?: number;
}

async function getOpenerData(token: string): Promise<OpenerData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(
      `${baseUrl}/api/season-opener/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
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
  const data = await getOpenerData(token);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  return buildSeasonOpenerMetadata(
    data && !data.error ? data : null,
    { token, appUrl },
  );
}

function NotFound() {
  return (
    <main
      data-testid="season-opener-page"
      className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-900"
    >
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-100 text-2xl">
          {'\u{1F50D}'}
        </div>
        <h2 className="text-xl font-bold text-gray-900">Season opener not found</h2>
        <p className="mt-2 text-sm text-gray-500">
          This link may have been replaced. Ask your coach for a fresh one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Coach your kid&apos;s team — free
        </Link>
      </div>
    </main>
  );
}

export default async function SeasonOpenerPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getOpenerData(token);

  if (!data || data.error || !data.teamName) {
    return <NotFound />;
  }

  const teamName = data.teamName;
  const ageGroup = data.ageGroup ?? '';
  const sportName = data.sportName ?? '';
  const seasonLabel = data.seasonLabel ?? '';
  const coachFirstName = data.coachFirstName ?? null;
  const coachHandle = data.coachHandle ?? null;
  const focusLine = data.focusLine ?? '';

  // Subline pieces: `<Sport> — <Age group> — <Season label>`. Skip empty
  // segments so a missing sport doesn't render a leading em-dash.
  const subParts = [sportName, ageGroup, seasonLabel].filter(
    (s) => typeof s === 'string' && s.trim().length > 0,
  );

  return (
    <main
      data-testid="season-opener-page"
      className="min-h-screen bg-gray-50 text-gray-900"
    >
      <div className="mx-auto max-w-lg px-5 pb-12 pt-10">
        {/* Brand */}
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            SportsIQ
          </span>
          <span className="rounded-full border border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-500">
            Season Opener
          </span>
        </div>

        {/* Hero */}
        <div className="rounded-3xl border border-gray-200 bg-white p-7 text-center shadow-sm">
          <h1
            data-testid="season-opener-h1"
            className="text-3xl font-extrabold tracking-tight text-gray-900"
          >
            Welcome to {teamName}
          </h1>
          {subParts.length > 0 && (
            <p
              data-testid="season-opener-subline"
              className="mt-3 text-xs uppercase tracking-widest text-gray-500"
            >
              {subParts.join(' — ')}
            </p>
          )}
        </div>

        {/* Coach line */}
        {coachFirstName && (
          <p
            data-testid="season-opener-coach-line"
            className="mt-7 text-center text-sm leading-relaxed text-gray-700"
          >
            Your coach this season is{' '}
            {coachHandle ? (
              <Link
                href={`/coach/${coachHandle}`}
                className="font-semibold text-orange-600 underline-offset-2 hover:underline"
              >
                Coach {coachFirstName}
              </Link>
            ) : (
              <span className="font-semibold text-gray-900">Coach {coachFirstName}</span>
            )}
            .
          </p>
        )}

        {/* Focus line — quoted block */}
        {focusLine && (
          <blockquote
            data-testid="season-opener-focus"
            className="mt-6 rounded-2xl border-l-4 border-orange-400 bg-white px-5 py-4 text-base font-medium leading-relaxed text-gray-800 shadow-sm"
          >
            &ldquo;{focusLine}&rdquo;
          </blockquote>
        )}

        {/* Reaction strip — re-uses the existing parent_reactions surface
            (ticket 0022). The `shareToken` is the season-opener token; the
            existing ParentReactionForm POSTs to /api/parent-reactions with
            it — parent_reactions has NO entity_type column (migration 023);
            reactions are keyed by share_token, so the existing shape carries
            this surface unchanged (LESSONS#0096 — schema wins over prose). */}
        <div className="mt-7">
          <ParentReactionForm
            shareToken={token}
            playerFirstName="your team"
            coachName={coachFirstName}
            referralCode={null}
          />
        </div>

        {/* Footer — the 0011-pattern referral footer (parent-facing) */}
        <div
          data-testid="season-opener-referral-footer"
          className="mt-10 text-center"
        >
          <p className="text-xs text-gray-500">
            Made by {coachFirstName ? `Coach ${coachFirstName}` : 'your coach'} with{' '}
            <span className="font-semibold text-gray-700">SportsIQ</span>
            {' '}— coach your kid&apos;s team free.
          </p>
          <div className="mt-2 flex justify-center gap-3 text-xs text-gray-500">
            <Link href="/privacy" className="underline hover:text-gray-700">
              Privacy
            </Link>
            <Link href="/terms" className="underline hover:text-gray-700">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
