import type { Metadata } from 'next';
import Link from 'next/link';
import { SaveToMyTeamCTA } from '@/components/plan/save-to-my-team-cta';

// ---------------------------------------------------------------------------
// Public practice-plan page (ticket 0049).
//
// Server component. Renders ONE practice plan (drill list, durations, focus
// areas) the publishing coach shared via /api/practice-plan-shares/create,
// plus a "Save to my team" CTA other coaches tap to clone it onto their own
// team. Parent-portal gray/orange aesthetic, NOT the dark dashboard.
//
// Reachable without auth (publicPaths in src/lib/supabase/middleware.ts).
// COPPA: the public API allow-list returns ONLY four keys (planTitle,
// planContent, coachFirstName, note) — no minor data ever crosses.
// ---------------------------------------------------------------------------

interface Drill {
  name?: string;
  duration_minutes?: number;
  duration?: number;
  focus?: string;
  focus_area?: string;
  description?: string;
}

interface PracticePlanContent {
  drills?: Drill[];
  total_minutes?: number;
  notes?: string;
}

interface PlanData {
  planTitle?: string | null;
  planContent?: PracticePlanContent | Record<string, unknown> | null;
  coachFirstName?: string | null;
  note?: string | null;
  error?: string;
  status?: number;
}

async function getPlanData(token: string): Promise<PlanData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/practice-plan-shares/${token}`, { cache: 'no-store' });
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
  const data = await getPlanData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const planUrl = `${appUrl}/plan/${token}`;

  if (!data || data.error || !data.planTitle) {
    return {
      title: 'Practice Plan — SportsIQ',
      alternates: { canonical: planUrl },
      openGraph: {
        title: 'Practice Plan — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: planUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const coachLine = data.coachFirstName ? ` — by Coach ${data.coachFirstName}` : '';
  const title = `${data.planTitle}${coachLine}`;
  const description = data.note?.trim()
    ? `${data.note} · Save it to your team — free.`
    : `A practice plan another coach published. Save it to your team — free.`;

  return {
    title,
    description,
    alternates: { canonical: planUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: planUrl,
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
        <h1 className="text-xl font-bold text-gray-900">Practice plan not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This plan link may have been removed. Ask the coach for a new one.
        </p>
        <Link
          href="/signup"
          className="mt-6 inline-flex items-center justify-center rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-600"
        >
          Plan your team&apos;s practice — free
        </Link>
      </div>
    </div>
  );
}

function durationFor(drill: Drill): number | null {
  if (typeof drill.duration_minutes === 'number') return drill.duration_minutes;
  if (typeof drill.duration === 'number') return drill.duration;
  return null;
}

function focusFor(drill: Drill): string | null {
  return drill.focus ?? drill.focus_area ?? null;
}

export default async function PracticePlanPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPlanData(token);

  if (!data || data.error || !data.planTitle) {
    return <NotFound />;
  }

  const { planTitle, planContent, coachFirstName, note } = data;
  const content = (planContent ?? {}) as PracticePlanContent;
  const drills = Array.isArray(content.drills) ? content.drills : [];

  const totalMinutes =
    typeof content.total_minutes === 'number'
      ? content.total_minutes
      : drills.reduce((sum, d) => sum + (durationFor(d) ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-2xl px-5 pb-12 pt-10">
        {/* Brand */}
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="text-sm font-bold uppercase tracking-[0.2em] text-gray-500">
            SportsIQ
          </span>
          <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-500">
            Practice Plan
          </span>
        </div>

        {/* Header card */}
        <div
          className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
          data-testid="practice-plan-header"
        >
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
            {planTitle}
          </h1>
          {coachFirstName && (
            <p className="mt-2 text-sm text-gray-600">
              Shared by <span className="font-semibold text-orange-600">Coach {coachFirstName}</span>
            </p>
          )}
          {note && (
            <p
              className="mt-4 rounded-xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-gray-800"
              data-testid="practice-plan-note"
            >
              &ldquo;{note}&rdquo;
            </p>
          )}
          {totalMinutes > 0 && (
            <p className="mt-4 text-xs uppercase tracking-widest text-gray-500">
              {totalMinutes} min total · {drills.length} drill{drills.length === 1 ? '' : 's'}
            </p>
          )}
        </div>

        {/* CTA — top of page so a phone-viewer sees it before scrolling */}
        <div className="mt-5" data-testid="save-cta-top">
          <SaveToMyTeamCTA token={token} />
        </div>

        {/* Drill list */}
        {drills.length > 0 && (
          <div className="mt-6 space-y-3" data-testid="practice-plan-drills">
            {drills.map((drill, i) => {
              const mins = durationFor(drill);
              const focus = focusFor(drill);
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">
                        {i + 1}. {drill.name ?? 'Untitled drill'}
                      </p>
                      {focus && (
                        <p className="mt-0.5 text-xs uppercase tracking-wider text-orange-600">
                          {focus}
                        </p>
                      )}
                    </div>
                    {mins !== null && (
                      <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-700">
                        {mins} min
                      </span>
                    )}
                  </div>
                  {drill.description && (
                    <p className="mt-2 text-sm leading-relaxed text-gray-700">{drill.description}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* CTA — repeated at the bottom for long lists */}
        <div className="mt-8" data-testid="save-cta-bottom">
          <SaveToMyTeamCTA token={token} />
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
