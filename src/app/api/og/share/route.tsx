import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';

export const runtime = 'nodejs';

const SIZE = { width: 1200, height: 630 };

// Deterministic skill bars seeded from the player name
function seedBars(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const bars: number[] = [];
  for (let i = 0; i < 32; i++) {
    h = ((h << 5) - h + i * 37) | 0;
    bars.push(Math.abs(h % 160) + 20);
  }
  return bars;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const playerName = (searchParams.get('name') || 'Player').slice(0, 40);
  const teamName   = (searchParams.get('team') || 'the team').slice(0, 50);
  const coachFirst = (searchParams.get('coach') || 'Coach').slice(0, 24);
  const obsRaw     = parseInt(searchParams.get('obs') || '0', 10);
  const obsCount   = isNaN(obsRaw) ? 0 : Math.max(0, obsRaw);

  const firstName = playerName.split(' ')[0];
  const obsLabel  = obsCount > 0
    ? `${obsCount} coaching observation${obsCount === 1 ? '' : 's'}`
    : 'Coaching progress report';

  const bars = seedBars(playerName);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#09090b',
          color: '#fafafa',
          overflow: 'hidden',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Radial orange glow, top-left */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            left: -80,
            width: 640,
            height: 640,
            borderRadius: 9999,
            background:
              'radial-gradient(circle, rgba(249,115,22,0.48) 0%, rgba(249,115,22,0.14) 40%, rgba(249,115,22,0) 70%)',
            display: 'flex',
          }}
        />

        {/* Subtle dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
            display: 'flex',
          }}
        />

        {/* Orange accent stripe, far left */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: 6,
            background: 'linear-gradient(180deg, #F97316 0%, #C2410C 100%)',
            display: 'flex',
          }}
        />

        {/* Main content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '48px 64px',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Top row: wordmark + pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background:
                    'radial-gradient(circle at 30% 22%, #FFB874 0%, #F97316 55%, #C2410C 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 10px 28px rgba(249,115,22,0.4)',
                }}
              >
                <svg width="30" height="30" viewBox="0 0 120 120" fill="none">
                  <path
                    d="M76 24C58 24 42 32 42 46C42 60 62 62 72 66C82 70 86 76 86 84C86 96 72 104 54 104"
                    stroke="#FFFFFF"
                    strokeWidth="9"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <g transform="translate(98, 26)" fill="#FFFFFF">
                    <path d="M0 -12 L3 -3 L12 0 L3 3 L0 12 L-3 3 L-12 0 L-3 -3Z" />
                  </g>
                </svg>
              </div>
              <span
                style={{
                  fontSize: 24,
                  fontWeight: 700,
                  letterSpacing: '0.2em',
                  color: '#fafafa',
                }}
              >
                SPORTSIQ
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 20px',
                background: 'rgba(249,115,22,0.15)',
                border: '1px solid rgba(249,115,22,0.45)',
                borderRadius: 9999,
                fontSize: 14,
                letterSpacing: '0.15em',
                color: '#fb923c',
                fontWeight: 600,
              }}
            >
              PROGRESS REPORT
            </div>
          </div>

          {/* Center: player headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <div
              style={{
                fontSize: 13,
                letterSpacing: '0.3em',
                color: '#71717a',
                fontWeight: 600,
                marginBottom: 4,
              }}
            >
              {teamName.toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              <span
                style={{
                  fontSize: 84,
                  fontWeight: 700,
                  lineHeight: 1.0,
                  letterSpacing: '-0.03em',
                  color: '#fafafa',
                }}
              >
                {firstName}&apos;s
              </span>
              <span
                style={{
                  fontSize: 84,
                  fontWeight: 700,
                  lineHeight: 1.04,
                  letterSpacing: '-0.03em',
                  color: '#F97316',
                }}
              >
                Season Story
              </span>
            </div>
          </div>

          {/* Bottom row: stats + skill bars */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 20,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 20px',
                    background: '#F97316',
                    borderRadius: 9999,
                    color: '#0c0a09',
                    fontSize: 18,
                    fontWeight: 700,
                    letterSpacing: '-0.01em',
                  }}
                >
                  🏆 {obsLabel}
                </div>
              </div>
              <div
                style={{
                  fontSize: 15,
                  color: '#71717a',
                  letterSpacing: '0.01em',
                  marginTop: 2,
                }}
              >
                Shared by Coach {coachFirst} · youthsportsiq.com
              </div>
            </div>

            {/* Mini skill bars */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 52 }}>
              {bars.map((h, i) => {
                const scaled = Math.max(5, h * 0.32);
                const intensity = Math.min(1, h / 180);
                const isHot = i > 6 && i < 22;
                return (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: scaled,
                      borderRadius: 2,
                      background: isHot
                        ? `rgba(249,115,22,${0.5 + intensity * 0.5})`
                        : `rgba(244,244,245,${0.14 + intensity * 0.2})`,
                      display: 'flex',
                    }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    ),
    SIZE,
  );
}
