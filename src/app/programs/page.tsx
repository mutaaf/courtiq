import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';

// ---------------------------------------------------------------------------
// Public program directory (ticket 0033).
//
// Server component. Lists the organizations that have explicitly opted into
// discovery (settings.discoverable = true) so a cold searcher can find their
// league by name and tap through to the branded program page at /org/<slug> to
// claim the team they coach. Org-level / aggregate data ONLY — no coach or
// player data ever renders here (the /api/programs allow-list guarantees it).
//
// Reachable without auth (see publicPaths in src/lib/supabase/middleware.ts).
// Dark zinc-950 + #F97316 orange: this is a COACH-facing discovery surface, like
// /org/[slug] and /team-card. Indexable (descriptive generateMetadata, no
// noindex) so the page can surface in a cold search — mirrors the metadata
// pattern in src/app/season-recap/[token]/page.tsx.
// ---------------------------------------------------------------------------

interface Program {
  name: string;
  slug: string;
  teamCount: number;
  sport: string | null;
}

interface ProgramsData {
  programs: Program[];
}

async function getPrograms(): Promise<ProgramsData> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/programs`, { cache: 'no-store' });
    if (!res.ok) return { programs: [] };
    return res.json();
  } catch {
    return { programs: [] };
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const title = 'Program Directory — SportsIQ';
  const description =
    'Find the youth sports program your league runs on SportsIQ and join the team you coach.';
  // Ticket 0038: canonical so a crawler can collapse duplicates between
  // preview / prod / share variants; JSON-LD BreadcrumbList so a search
  // result can render the breadcrumb (root → /programs). No per-coach /
  // per-minor data appears in either.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';
  const breadcrumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'SportsIQ', item: appUrl },
      { '@type': 'ListItem', position: 2, name: 'Program Directory', item: `${appUrl}/programs` },
    ],
  };
  return {
    title,
    description,
    alternates: {
      canonical: `${appUrl}/programs`,
    },
    openGraph: {
      title,
      description,
    },
    other: {
      // Next renders this as <meta name="ld+json" content="..."/>. The
      // canonical JSON-LD shape parses identically; search engines that read
      // the `other` map pick it up. Keeping it on the metadata object (vs an
      // inline <script>) keeps the visual layout untouched, per the ticket.
      'ld+json': JSON.stringify(breadcrumbs),
    },
  };
}

export default async function ProgramsDirectoryPage() {
  const { programs } = await getPrograms();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-4 py-12 text-center" style={{ borderTop: '4px solid #F97316' }}>
        <div className="mx-auto max-w-xl">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/15">
            <Search className="h-6 w-6 text-orange-500" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-100 sm:text-4xl">Program Directory</h1>
          <p className="mt-3 text-base text-zinc-400">
            Find the program your league runs on SportsIQ, then claim the team you coach.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-8 px-4 py-10" data-testid="programs-directory">
        {programs.length > 0 ? (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Listed Programs
            </h2>
            <div className="space-y-2">
              {programs.map((program) => (
                <Link
                  key={program.slug}
                  href={`/org/${program.slug}`}
                  data-testid="program-row"
                  className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4 transition-colors hover:border-zinc-700"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-sm font-bold">
                    <span className="text-orange-500">{program.name.charAt(0).toUpperCase()}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-zinc-100">{program.name}</p>
                    <p className="text-xs text-zinc-500">
                      {program.sport ? `${program.sport} · ` : ''}
                      {program.teamCount} {program.teamCount === 1 ? 'team' : 'teams'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-600" />
                </Link>
              ))}
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
            <p className="text-sm text-zinc-400">
              No programs are listed yet. If your league runs on SportsIQ, ask your program director
              to list it so your coaches can find it here.
            </p>
          </section>
        )}

        {/* CTA for a coach without a program to join */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
          <h2 className="text-lg font-bold text-zinc-100">Don&apos;t see your program?</h2>
          <p className="mt-2 text-sm text-zinc-400">
            Start your own free team on SportsIQ and bring your coaching staff along.
          </p>
          <Link
            href="/signup"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Start free
            <ChevronRight className="h-4 w-4" />
          </Link>
          <p className="mt-3 text-xs text-zinc-600">No credit card required.</p>
        </section>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-700">
          Powered by{' '}
          <Link href="/" className="text-zinc-500 hover:text-zinc-400">
            SportsIQ
          </Link>
        </p>
      </div>
    </div>
  );
}
