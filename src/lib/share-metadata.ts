import type { Metadata } from 'next';
import { buildSpotlightPreview } from '@/lib/player-spotlight-utils';

/**
 * Ticket 0013 — pure builder for the `/share/[token]` page's social metadata.
 *
 * Extracted from `generateMetadata` so the title/description branching is unit-
 * testable without invoking the server-side share fetch. When the share response
 * carries a non-null, well-formed `playerSpotlight`, the OG title/description
 * celebrate the spotlight ("Player of the Week"/"Player of the Match" + the
 * coach headline); otherwise they fall back to today's generic Progress Report
 * card UNCHANGED. The OG image URL is the same self-selecting route in every
 * branch — the image route reads the same share data and picks its own variant.
 *
 * The preview must NEVER break the link: a missing/errored/malformed payload
 * degrades to the generic SportsIQ fallback rather than throwing.
 */
export function buildShareMetadata(
  data: any,
  { token, appUrl }: { token: string; appUrl: string }
): Metadata {
  const shareUrl = `${appUrl}/share/${token}`;
  const ogImageUrl = `${appUrl}/share/${token}/opengraph-image`;

  // Missing / errored share data — the existing generic SportsIQ fallback.
  if (!data || data.error) {
    return {
      title: 'Player Progress Report — SportsIQ',
      openGraph: {
        title: 'Player Progress Report — SportsIQ',
        description: 'Coaching intelligence for youth sports.',
        url: shareUrl,
        images: [{ url: `${appUrl}/opengraph-image`, width: 1200, height: 630 }],
      },
    };
  }

  const playerName: string = data.player?.nickname || data.player?.name || 'Your Player';
  const firstName: string = playerName.split(' ')[0];
  const teamName: string = data.team?.name || 'the team';

  // ── Spotlight branch (ticket 0013) ───────────────────────────────────────
  // When a well-formed spotlight is present, the preview leads with the most
  // forward-worthy artifact: first name + "Player of the Week/Match" + headline.
  // buildSpotlightPreview() returns null for a null/malformed spotlight, so we
  // fall through to the generic card below — the link never breaks.
  const spotlight = buildSpotlightPreview(data.playerSpotlight, playerName);
  if (spotlight) {
    const title = `${spotlight.firstName} — ${spotlight.title} | SportsIQ`;
    const description = `${spotlight.headline} — ${spotlight.firstName}'s coach named ${spotlight.firstName} ${spotlight.title} for ${teamName}.`;
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        type: 'website',
        url: shareUrl,
        images: [
          { url: ogImageUrl, width: 1200, height: 630, alt: `${spotlight.firstName} — ${spotlight.title}` },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImageUrl],
      },
    };
  }

  // ── Generic Progress Report branch (unchanged from pre-0013) ─────────────
  const obsCount: number = data.totalObservationCount ?? 0;
  const skillArr: any[] = Array.isArray(data.skillProgress) ? data.skillProgress : [];
  const improvingCount = skillArr.filter(
    (s) => s.proficiency_level === 'got_it' || s.proficiency_level === 'game_ready'
  ).length;

  const statParts: string[] = [];
  if (obsCount > 0) statParts.push(`${obsCount} coaching observation${obsCount !== 1 ? 's' : ''}`);
  if (improvingCount > 0)
    statParts.push(`${improvingCount} skill${improvingCount !== 1 ? 's' : ''} at game level`);

  const title = `${playerName}'s Progress Report — SportsIQ`;
  const description =
    statParts.length > 0
      ? `${statParts.join(' · ')} — see how ${firstName} is growing this season with ${teamName}.`
      : `See ${playerName}'s coaching report from ${teamName} this season. Powered by SportsIQ.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: shareUrl,
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: `${playerName}'s SportsIQ Progress Report` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  };
}
