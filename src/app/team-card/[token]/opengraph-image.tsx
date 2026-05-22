import { ImageResponse } from 'next/og';

// Mirrors src/app/share/[token]/opengraph-image.tsx (ticket 0010) — a single
// text-on-brand-background card for the public team card. v1 is intentionally NOT
// a per-artifact templating system (out of scope).

export const runtime = 'nodejs';
export const alt = 'Team Card — SportsIQ';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getTeamCardPreview(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/team-card/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function TeamCardOGImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getTeamCardPreview(token);

  const personality = data?.personality ?? {};
  const teamType: string = personality.team_type || 'Your Team';
  const emoji: string = personality.type_emoji || '🏆';
  const tagline: string = personality.tagline || 'Made with SportsIQ';
  const teamName: string = data?.teamName || 'Youth Sports';
  const accentColor = '#F97316';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#09090b',
          position: 'relative',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Orange accent stripe on the left */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 8,
            background: `linear-gradient(180deg, ${accentColor} 0%, #C2410C 100%)`,
            display: 'flex',
          }}
        />

        {/* Radial glow top-right */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            right: -100,
            width: 600,
            height: 600,
            borderRadius: 9999,
            background: `radial-gradient(circle, ${accentColor}55 0%, ${accentColor}18 40%, transparent 70%)`,
            display: 'flex',
          }}
        />

        {/* Dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '52px 72px 52px 80px',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Top: SportsIQ brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.20em',
                color: '#e4e4e7',
              }}
            >
              SPORTSIQ
            </span>
            <div
              style={{
                marginLeft: 8,
                padding: '5px 14px',
                borderRadius: 9999,
                border: '1px solid rgba(255,255,255,0.12)',
                fontSize: 13,
                color: '#71717a',
                letterSpacing: '0.05em',
                display: 'flex',
              }}
            >
              Team Card
            </div>
          </div>

          {/* Center: emoji + team type + tagline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 88, lineHeight: 1, display: 'flex' }}>{emoji}</div>
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.25em',
                color: '#71717a',
                textTransform: 'uppercase',
                display: 'flex',
              }}
            >
              {teamName}
            </div>
            <div
              style={{
                fontSize: 96,
                fontWeight: 800,
                lineHeight: 0.98,
                letterSpacing: '-0.03em',
                color: '#fafafa',
                display: 'flex',
              }}
            >
              {teamType}
            </div>
            <div
              style={{
                fontSize: 34,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                color: accentColor,
                display: 'flex',
              }}
            >
              {tagline}
            </div>
          </div>

          {/* Bottom: CTA line */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 24,
              fontSize: 22,
              color: '#a1a1aa',
            }}
          >
            Make your team&apos;s card — free at SportsIQ
          </div>
        </div>
      </div>
    ),
    size
  );
}
