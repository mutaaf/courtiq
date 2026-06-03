import type { Metadata } from 'next';
import Link from 'next/link';
import { DrillShareCard } from '@/components/drills/drill-share-card';

// ---------------------------------------------------------------------------
// Public single-drill share page (ticket 0064).
//
// Server component. Renders ONE drill the publishing coach shared via
// /api/drill-shares/create + a one-tap "Save to my library" button the
// cloning coach taps. Parent-portal gray/orange aesthetic, NOT the dark
// dashboard (same posture as /plan/[token] for 0049 and /share/[token]
// for the parent portal).
//
// Reachable without auth (publicPaths in src/lib/supabase/middleware.ts).
// COPPA: the public API allow-list returns ONLY {drill, caption, publisher,
// createdAt, isActive} — no minor data ever crosses. The publisher's first
// name + handle are public surfaces; the publisher's coach id is exposed
// for the 0063 follow card POST and is NOT minor data.
// ---------------------------------------------------------------------------

interface PublisherBlock {
  id?: string;
  firstName?: string | null;
  handle?: string | null;
}

interface DrillBlock {
  id?: string;
  name?: string;
  setup?: string | null;
  sportSlug?: string | null;
  ageGroupHint?: string | null;
}

interface DrillShareData {
  drill?: DrillBlock;
  caption?: string | null;
  publisher?: PublisherBlock;
  createdAt?: string;
  isActive?: boolean;
  error?: string;
  status?: number;
}

async function getDrillShareData(token: string): Promise<DrillShareData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/drill-shares/${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
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
  const data = await getDrillShareData(token);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  const drillUrl = `${appUrl}/drill/${token}`;

  if (!data || data.error || !data.drill?.name) {
    return {
      title: 'Drill — SportsIQ',
      alternates: { canonical: drillUrl },
      openGraph: {
        title: 'Drill — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: drillUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const coachLine = data.publisher?.firstName ? ` — by Coach ${data.publisher.firstName}` : '';
  const title = `${data.drill.name}${coachLine}`;
  const description = data.caption?.trim()
    ? `${data.caption} · Save it to your library — free.`
    : `A drill another coach published. Save it to your library — free.`;

  return {
    title,
    description,
    alternates: { canonical: drillUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: drillUrl,
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
        <h1 className="text-xl font-bold text-gray-900">Drill not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          This drill link may have been removed. Ask the coach for a new one.
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

function Unpublished() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4 text-gray-900">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">This drill is no longer shared</h1>
        <p className="mt-2 text-sm text-gray-600">
          The coach who published this drill unpublished the link. Ask them for the latest one.
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

export default async function DrillSharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getDrillShareData(token);

  if (!data) {
    return <NotFound />;
  }
  if (data.status === 410) {
    return <Unpublished />;
  }
  if (data.error || !data.drill?.name || !data.publisher?.id) {
    return <NotFound />;
  }

  const drill = {
    id: data.drill.id ?? '',
    name: data.drill.name,
    setup: data.drill.setup ?? null,
    sportSlug: data.drill.sportSlug ?? null,
    ageGroupHint: data.drill.ageGroupHint ?? null,
  };
  const publisher = {
    id: data.publisher.id,
    firstName: data.publisher.firstName ?? null,
    handle: data.publisher.handle ?? null,
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <DrillShareCard
        token={token}
        drill={drill}
        caption={data.caption ?? null}
        publisher={publisher}
      />
    </div>
  );
}
