import type { Metadata } from 'next';
import Link from 'next/link';

// ---------------------------------------------------------------------------
// Public coach profile card (ticket 0026).
//
// Server component. Renders the coach's standing identity surface — their display
// name, the sports + age groups they coach, a small block of honest aggregate
// counts (weeks coaching, practices logged, players observed), and a single CTA
// that deep-links to /signup?ref=<referral code>. Coach-level only: no player
// names, jerseys, or observation text ever reach this surface (the
// /api/coach-card/[token] allow-list strips everything player-scoped — COPPA).
//
// Dark zinc-950 + #F97316 orange: this is a COACH-facing surface, like
// /team-card and /season-recap, not the gray/orange parent portal. Reachable
// without auth (see publicPaths in src/lib/supabase/middleware.ts).
// ---------------------------------------------------------------------------

interface CoachCardData {
  display_name?: string | null;
  sports?: string[];
  age_groups?: string[];
  weeks_coaching?: number;
  practices_logged?: number;
  players_observed?: number;
  referral_code?: string;
  error?: string;
  status?: number;
}

async function getCoachCardData(token: string): Promise<CoachCardData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/coach-card/${token}`, { cache: 'no-store' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { error: err.error || 'Not found', status: res.status };
    }
    return res.json();
  } catch {
    return null;
  }
}

// Build the "Coaching basketball, U10" line from the derived sports + age groups.
function buildCoachingLine(sports: string[], ageGroups: string[]): string | null {
  const sportPart = sports.length > 0 ? sports.join(' · ') : '';
  const agePart = ageGroups.length > 0 ? ageGroups.join(', ') : '';
  if (sportPart && agePart) return `Coaching ${sportPart} · ${agePart}`;
  if (sportPart) return `Coaching ${sportPart}`;
  if (agePart) return `Coaching ${agePart}`;
  return null;
}

// ---------------------------------------------------------------------------
// Social metadata — rich previews when a coach pastes the link in a group chat.
// Text-only preview (no custom OG image renderer — out of scope for v1).
// ---------------------------------------------------------------------------
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const data = await getCoachCardData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const cardUrl = `${appUrl}/coach/${token}`;
  const ogImageUrl = `${appUrl}/opengraph-image`;

  if (!data || data.error || !data.display_name) {
    return {
      title: 'Coaching profile — SportsIQ',
      // Ticket 0038: canonical so a crawler collapses duplicates onto the
      // same indexable URL (preview vs prod produce different canonicals).
      alternates: { canonical: cardUrl },
      openGraph: {
        title: 'Coaching profile — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: cardUrl,
        images: [{ url: ogImageUrl, width: 1200, height: 630 }],
      },
    };
  }

  const name = data.display_name;
  const line = buildCoachingLine(data.sports ?? [], data.age_groups ?? []);
  const title = `${name} — a SportsIQ coaching profile`;
  const description = line
    ? `${line}. See how this coach works and start free.`
    : `See how this coach works and start free.`;

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
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${name} — SportsIQ coaching profile` }],
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
        <h2 className="text-xl font-bold text-zinc-100">Coaching Profile Not Found</h2>
        <p className="mt-2 text-sm text-zinc-400">
          This profile link may have been removed. Ask the coach for a new one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Start coaching like this — free
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat tile
// ---------------------------------------------------------------------------
function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center">
      <div className="text-2xl font-extrabold text-zinc-50">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-zinc-500">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default async function CoachCardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getCoachCardData(token);

  if (!data || data.error || !data.display_name) {
    return <NotFound />;
  }

  const sports = Array.isArray(data.sports) ? data.sports : [];
  const ageGroups = Array.isArray(data.age_groups) ? data.age_groups : [];
  const coachingLine = buildCoachingLine(sports, ageGroups);
  const referralCode = data.referral_code;

  const weeks = data.weeks_coaching ?? 0;
  const practices = data.practices_logged ?? 0;
  const players = data.players_observed ?? 0;

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
            Coaching Profile
          </span>
        </div>

        {/* Hero */}
        <div className="rounded-3xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-7 text-center shadow-xl">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-50">
            {data.display_name}
          </h1>
          {coachingLine && (
            <p className="mt-2 text-base font-medium text-orange-400">{coachingLine}</p>
          )}
        </div>

        {/* Sports + age-group chips */}
        {(sports.length > 0 || ageGroups.length > 0) && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {sports.map((s, i) => (
              <span
                key={`sport-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-sm font-medium text-orange-300"
              >
                {s}
              </span>
            ))}
            {ageGroups.map((a, i) => (
              <span
                key={`age-${i}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm font-medium text-zinc-300"
              >
                {a}
              </span>
            ))}
          </div>
        )}

        {/* Stats block — honest aggregate counts the coach already produced */}
        <div className="mt-7">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            The work so far
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <Stat value={weeks} label="Weeks coaching" />
            <Stat value={practices} label="Practices logged" />
            <Stat value={players} label="Players observed" />
          </div>
        </div>

        {/* CTA — the referral payload */}
        <div className="mt-10 rounded-3xl border border-orange-500/30 bg-orange-500/5 p-6 text-center">
          <p className="text-sm text-zinc-300">
            This is how a season adds up. Track yours the same way.
          </p>
          <Link
            href={signupHref}
            className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-base font-semibold text-white hover:bg-orange-600"
          >
            Start coaching like this — free
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
