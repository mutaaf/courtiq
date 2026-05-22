import { ImageResponse } from 'next/og';
import { buildSpotlightPreview } from '@/lib/player-spotlight-utils';

export const runtime = 'nodejs';
export const alt = "Player Progress Report — SportsIQ";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function getSharePreviewData(token: string) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/share/${token}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function ShareOGImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getSharePreviewData(token);

  const playerName: string = data?.player?.nickname || data?.player?.name || 'Player';
  const firstName: string = playerName.split(' ')[0];
  const teamName: string = data?.team?.name || 'Youth Sports';
  const coachName: string = data?.coachName || 'Coach';
  const obsCount: number = data?.totalObservationCount ?? 0;
  const skillArr: any[] = Array.isArray(data?.skillProgress) ? data.skillProgress : [];
  const improvingCount = skillArr.filter(
    (s: any) => s.proficiency_level === 'got_it' || s.proficiency_level === 'game_ready'
  ).length;
  const accentColor: string = data?.branding?.primary_color || '#F97316';

  // Ticket 0013: when this player has a well-formed spotlight, the preview leads
  // with the celebratory artifact instead of the generic Progress Report card.
  // buildSpotlightPreview() returns null for a null/malformed spotlight, so the
  // generic layout below renders unchanged — the preview never breaks the link.
  // COPPA: the preview carries ONLY the first name + coach headline (+ the
  // derived label); no last name, jersey, or roster on the public card.
  const spotlight = buildSpotlightPreview(data?.playerSpotlight, playerName);

  // Waveform bars — deterministic visual accent
  const bars = [
    18, 34, 56, 28, 72, 100, 64, 128, 84, 148, 104, 72, 44, 84, 132, 172, 108, 78, 50, 34,
    22, 44, 76, 116, 160, 196, 136, 96, 60, 36,
  ];

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
          {/* Top row: SportsIQ brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Logo mark */}
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: `radial-gradient(circle at 30% 22%, #FFB874 0%, ${accentColor} 55%, #C2410C 100%)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: `0 10px 28px ${accentColor}40`,
              }}
            >
              <svg width="30" height="30" viewBox="0 0 120 120" fill="none">
                <path
                  d="M76 24C58 24 42 32 42 46C42 60 62 62 72 66C82 70 86 76 86 84C86 96 72 104 54 104"
                  stroke="#FFFFFF"
                  strokeWidth="10"
                  strokeLinecap="round"
                  fill="none"
                />
              </svg>
            </div>
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
                border: spotlight ? `1px solid ${accentColor}55` : '1px solid rgba(255,255,255,0.12)',
                background: spotlight ? `${accentColor}1f` : 'transparent',
                fontSize: 13,
                color: spotlight ? accentColor : '#71717a',
                letterSpacing: '0.05em',
                fontWeight: spotlight ? 700 : 400,
                display: 'flex',
              }}
            >
              {spotlight ? spotlight.title : 'Progress Report'}
            </div>
          </div>

          {spotlight ? (
            /* ── Spotlight variant (ticket 0013): celebratory artifact ── */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* "PLAYER OF THE WEEK / MATCH" eyebrow */}
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  letterSpacing: '0.28em',
                  color: accentColor,
                  textTransform: 'uppercase',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div style={{ width: 36, height: 4, borderRadius: 2, background: accentColor, display: 'flex' }} />
                {spotlight.title}
              </div>
              {/* Player FIRST name only (COPPA) */}
              <div
                style={{
                  fontSize: 92,
                  fontWeight: 800,
                  lineHeight: 0.95,
                  letterSpacing: '-0.03em',
                  color: '#fafafa',
                  display: 'flex',
                }}
              >
                {spotlight.firstName}
              </div>
              {/* Coach-authored headline (the only free text on the card) */}
              <div
                style={{
                  fontSize: 38,
                  fontWeight: 600,
                  lineHeight: 1.15,
                  letterSpacing: '-0.01em',
                  color: '#d4d4d8',
                  maxWidth: 920,
                  display: 'flex',
                }}
              >
                {spotlight.headline}
              </div>
            </div>
          ) : (
            /* Center: player name + team (generic Progress Report — unchanged) */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                  fontSize: obsCount > 0 ? 96 : 108,
                  fontWeight: 800,
                  lineHeight: 0.95,
                  letterSpacing: '-0.03em',
                  color: '#fafafa',
                  display: 'flex',
                }}
              >
                {firstName}
              </div>
              {playerName !== firstName && (
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 500,
                    letterSpacing: '-0.01em',
                    color: '#71717a',
                    marginTop: -8,
                    display: 'flex',
                  }}
                >
                  {playerName.split(' ').slice(1).join(' ')}
                </div>
              )}
            </div>
          )}

          {/* Bottom row: stats + waveform */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 24,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Stat chips */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {obsCount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 20px',
                      borderRadius: 9999,
                      background: `${accentColor}18`,
                      border: `1px solid ${accentColor}40`,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 9999,
                        background: accentColor,
                        display: 'flex',
                      }}
                    />
                    <span style={{ fontSize: 16, fontWeight: 700, color: accentColor }}>
                      {obsCount}
                    </span>
                    <span style={{ fontSize: 15, color: '#a1a1aa' }}>
                      coaching observation{obsCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
                {improvingCount > 0 && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '10px 20px',
                      borderRadius: 9999,
                      background: '#10b98118',
                      border: '1px solid #10b98140',
                    }}
                  >
                    <span style={{ fontSize: 16, color: '#34d399' }}>↑</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#34d399' }}>
                      {improvingCount}
                    </span>
                    <span style={{ fontSize: 15, color: '#a1a1aa' }}>
                      skill{improvingCount !== 1 ? 's' : ''} at game level
                    </span>
                  </div>
                )}
              </div>
              {/* Coach attribution (spotlight card folds in the team name the
                  eyebrow row displaced from the center) */}
              <div style={{ display: 'flex', fontSize: 14, color: '#52525b' }}>
                {spotlight ? `${teamName} · Tracked by ${coachName}` : `Tracked by ${coachName}`}
              </div>
            </div>

            {/* Mini waveform */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 52 }}>
              {bars.map((h, i) => {
                const scaled = Math.max(4, h * 0.26);
                const intensity = Math.min(1, h / 200);
                const isHot = i > 8 && i < 22;
                return (
                  <div
                    key={i}
                    style={{
                      width: 4,
                      height: scaled,
                      borderRadius: 3,
                      background: isHot
                        ? `rgba(249,115,22,${0.5 + intensity * 0.5})`
                        : `rgba(244,244,245,${0.12 + intensity * 0.20})`,
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
    size
  );
}
