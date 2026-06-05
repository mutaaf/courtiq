import type { Metadata } from 'next';

// Ticket 0068 — pure metadata helper for /opener/[token].
//
// Per LESSONS#0060: extract the title/description/URL branching out of
// generateMetadata so it is unit-testable without exercising the satori /
// next/og pipeline. The opengraph-image route uses the same helper so the
// social preview and the metadata title cannot disagree.
//
// Voice (LESSONS#0023): the rendered title/description never enumerate the
// AGENTS.md banned tokens. Phrasing is positive ("Welcome", "Coach <name>",
// "see what their team is working on this season").

export interface SeasonOpenerPayload {
  teamName?: string | null;
  ageGroup?: string | null;
  sportName?: string | null;
  seasonLabel?: string | null;
  coachFirstName?: string | null;
  focusLine?: string | null;
}

export interface SeasonOpenerMetadataOpts {
  token: string;
  appUrl: string;
}

export function buildSeasonOpenerMetadata(
  data: SeasonOpenerPayload | null,
  opts: SeasonOpenerMetadataOpts,
): Metadata {
  const url = `${opts.appUrl}/opener/${opts.token}`;

  if (!data || !data.teamName) {
    // Generic SportsIQ fallback when the token resolves to nothing — keeps
    // the social preview safe even when the public route 404s.
    const title = 'Season Opener — SportsIQ';
    const description = 'Coaching intelligence for youth sports.';
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        type: 'website',
        url,
      },
    };
  }

  const coachLine = data.coachFirstName ? ` — Coach ${data.coachFirstName}` : '';
  const title = `Welcome to ${data.teamName}${coachLine}`;
  const focusLine = (data.focusLine || '').trim();
  const description = focusLine
    ? `${focusLine}. See what their team is working on this season.`
    : 'See what their team is working on this season.';

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: 'website',
      url,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}
