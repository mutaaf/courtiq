import { Metadata } from 'next';
import Link from 'next/link';
import { Users, Trophy, Calendar, ChevronRight } from 'lucide-react';

interface OrgPageData {
  org: {
    name: string;
    slug: string;
    created_at: string;
  };
  branding: {
    logo_light_url: string | null;
    logo_dark_url: string | null;
    primary_color: string;
    secondary_color: string;
    parent_portal_header_text: string | null;
  } | null;
  teams: Array<{
    id: string;
    name: string;
    age_group: string;
    season: string | null;
    sport_id: string;
  }>;
  stats: {
    coaches: number;
    players: number;
    teams: number;
  };
}

async function getOrgData(slug: string): Promise<OrgPageData | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/org/${slug}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getOrgData(slug);
  if (!data) return { title: 'Program Not Found — SportsIQ' };
  return {
    title: `${data.org.name} — SportsIQ`,
    description: `${data.org.name} coaches use SportsIQ to track player development and deliver smarter coaching.`,
  };
}

export default async function OrgLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getOrgData(slug);

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-3xl">
            🏅
          </div>
          <h2 className="text-xl font-bold text-zinc-100">Program Not Found</h2>
          <p className="mt-2 text-sm text-zinc-400">
            This program page doesn&apos;t exist or may have been moved.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white active:scale-[0.98]"
          >
            Go to SportsIQ
          </Link>
        </div>
      </div>
    );
  }

  const { org, branding, teams, stats } = data;
  const logoUrl = branding?.logo_dark_url || branding?.logo_light_url;
  const accentColor = branding?.primary_color || '#F97316';
  const headerText = branding?.parent_portal_header_text;
  const seasonYear = new Date(org.created_at).getFullYear();

  // Group teams by age group
  const teamsByGroup = teams.reduce<Record<string, typeof teams>>(
    (acc, team) => {
      const key = team.age_group || 'General';
      if (!acc[key]) acc[key] = [];
      acc[key].push(team);
      return acc;
    },
    {}
  );

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <div
        className="border-b border-zinc-800 px-4 py-12 text-center"
        style={{ borderTop: `4px solid ${accentColor}` }}
      >
        <div className="mx-auto max-w-xl">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={`${org.name} logo`}
              className="mx-auto mb-5 h-20 w-auto object-contain"
              loading="lazy"
            />
          ) : (
            <div
              className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl text-3xl font-black text-white"
              style={{ backgroundColor: accentColor }}
            >
              {org.name.charAt(0).toUpperCase()}
            </div>
          )}

          <h1 className="text-3xl font-bold text-zinc-100 sm:text-4xl">{org.name}</h1>

          {headerText ? (
            <p className="mt-3 text-base text-zinc-400">{headerText}</p>
          ) : (
            <p className="mt-3 text-base text-zinc-400">
              Developing athletes with smarter coaching since {seasonYear}.
            </p>
          )}

          {/* Stats strip */}
          <div className="mt-8 flex items-center justify-center gap-6 sm:gap-10">
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-100">{stats.teams}</p>
              <p className="text-xs text-zinc-500">Teams</p>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-100">{stats.coaches}</p>
              <p className="text-xs text-zinc-500">Coaches</p>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <p className="text-2xl font-bold text-zinc-100">{stats.players}</p>
              <p className="text-xs text-zinc-500">Athletes</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl space-y-8 px-4 py-10">
        {/* Teams */}
        {teams.length > 0 && (
          <section>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Active Programs
            </h2>
            <div className="space-y-2">
              {Object.entries(teamsByGroup).map(([ageGroup, groupTeams]) => (
                <div key={ageGroup}>
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-zinc-600">
                    {ageGroup}
                  </p>
                  {groupTeams.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                        style={{ backgroundColor: accentColor + '33' }}
                      >
                        <span style={{ color: accentColor }}>
                          {team.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-zinc-100">{team.name}</p>
                        {team.season && (
                          <p className="text-xs text-zinc-500">Season: {team.season}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Features */}
        <section>
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Why We Use SportsIQ
          </h2>
          <div className="space-y-3">
            {[
              {
                icon: <Users className="h-5 w-5" />,
                title: 'Player-Centered Development',
                desc: 'Coaches track every athlete individually — skill by skill, session by session.',
              },
              {
                icon: <Trophy className="h-5 w-5" />,
                title: 'AI-Powered Practice Plans',
                desc: 'Practice plans generated from real observation data, not guesswork.',
              },
              {
                icon: <Calendar className="h-5 w-5" />,
                title: 'Parent Transparency',
                desc: 'Shareable progress reports so families stay informed and engaged.',
              },
            ].map(({ icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
              >
                <div
                  className="mt-0.5 shrink-0 rounded-lg p-2"
                  style={{ backgroundColor: accentColor + '22', color: accentColor }}
                >
                  {icon}
                </div>
                <div>
                  <p className="font-medium text-zinc-100">{title}</p>
                  <p className="mt-0.5 text-sm text-zinc-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
          <h2 className="text-lg font-bold text-zinc-100">
            Coach at {org.name}?
          </h2>
          <p className="mt-2 text-sm text-zinc-400">
            Join your program on SportsIQ and start building smarter, data-driven practices today.
          </p>
          <Link
            href={`/signup?org=${org.slug}`}
            className="mt-5 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white active:scale-[0.98]"
            style={{ backgroundColor: accentColor }}
          >
            Get Started Free
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
