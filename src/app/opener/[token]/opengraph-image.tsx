import { ImageResponse } from 'next/og';

// Ticket 0068 — share-friendly OG card for /opener/[token].
//
// Mirrors src/app/team-card/[token]/opengraph-image.tsx for the structural
// shape; the visual is parent-portal flavored (white card + orange accent)
// to match the page itself. Per LESSONS#0060 the metadata text branching
// lives in src/lib/season-opener-metadata.ts so the social title cannot
// disagree with the page metadata; this file owns the pixels only.

export const runtime = 'nodejs';
export const alt = 'Season Opener — SportsIQ';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

interface SeasonOpenerOgPayload {
  teamName?: string | null;
  ageGroup?: string | null;
  sportName?: string | null;
  seasonLabel?: string | null;
  coachFirstName?: string | null;
  focusLine?: string | null;
}

async function getOpenerPayload(token: string): Promise<SeasonOpenerOgPayload | null> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(
      `${baseUrl}/api/season-opener/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getOpenerPayload(token);

  const teamName = data?.teamName?.trim() || 'A new season';
  const coachFirstName = data?.coachFirstName?.trim() || '';
  const seasonLabel = data?.seasonLabel?.trim() || '';
  const sportName = data?.sportName?.trim() || '';
  const ageGroup = data?.ageGroup?.trim() || '';
  const focusLine = data?.focusLine?.trim() || '';
  const accent = '#F97316';
  const subParts = [sportName, ageGroup, seasonLabel].filter(
    (s) => s && s.length > 0,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#F9FAFB',
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
            background: `linear-gradient(180deg, ${accent} 0%, #C2410C 100%)`,
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '60px 72px 60px 80px',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Top: brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: '0.20em',
                color: '#374151',
              }}
            >
              SPORTSIQ
            </span>
            <div
              style={{
                marginLeft: 8,
                padding: '5px 14px',
                borderRadius: 9999,
                border: '1px solid rgba(0,0,0,0.08)',
                fontSize: 13,
                color: '#6B7280',
                letterSpacing: '0.05em',
                display: 'flex',
              }}
            >
              Season Opener
            </div>
          </div>

          {/* Center: welcome + team + subline + focus */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div
              style={{
                fontSize: 28,
                fontWeight: 500,
                color: '#6B7280',
                display: 'flex',
              }}
            >
              Welcome to
            </div>
            <div
              style={{
                fontSize: 88,
                fontWeight: 800,
                lineHeight: 1.0,
                letterSpacing: '-0.02em',
                color: '#111827',
                display: 'flex',
              }}
            >
              {teamName}
            </div>
            {subParts.length > 0 && (
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#6B7280',
                  display: 'flex',
                  letterSpacing: '0.02em',
                }}
              >
                {subParts.join(' — ')}
              </div>
            )}
            {focusLine && (
              <div
                style={{
                  marginTop: 8,
                  fontSize: 30,
                  fontWeight: 600,
                  color: accent,
                  display: 'flex',
                  lineHeight: 1.2,
                }}
              >
                {`“${focusLine}”`}
              </div>
            )}
          </div>

          {/* Bottom: coach attribution */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              borderTop: '1px solid rgba(0,0,0,0.08)',
              paddingTop: 24,
              fontSize: 22,
              color: '#4B5563',
            }}
          >
            {coachFirstName
              ? `Made by Coach ${coachFirstName} with SportsIQ`
              : 'Made with SportsIQ'}
          </div>
        </div>
      </div>
    ),
    size,
  );
}
