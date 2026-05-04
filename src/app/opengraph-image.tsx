import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const alt = 'SportsIQ — Voice-first AI coaching intelligence for youth sports';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

async function loadGoogleFont(family: string, weight: number, text: string) {
  const url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const match = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/);
  if (!match) throw new Error(`font load failed: ${family}`);
  const res = await fetch(match[1]);
  if (!res.ok) throw new Error(`font fetch failed: ${family}`);
  return res.arrayBuffer();
}

const HEADLINE = 'Coach like normal.';
const HEADLINE_TWO = 'Let AI take the notes.';
const WORDMARK = 'SPORTSIQ';
const URL_TEXT = 'youthsportsiq.com';
const KICKER = 'COACHING INTELLIGENCE — V1';
const QUOTE = '“Hit record. Move on with practice.”';
const SUBTITLE = 'Voice-first coaching intelligence built for youth sports.';

const ALL_TEXT = HEADLINE + HEADLINE_TWO + WORDMARK + URL_TEXT + KICKER + QUOTE + SUBTITLE + '0123456789:. →•';

export default async function OGImage() {
  let serifFont: ArrayBuffer | null = null;
  let sansFont: ArrayBuffer | null = null;
  try {
    [serifFont, sansFont] = await Promise.all([
      loadGoogleFont('Fraunces', 600, HEADLINE + HEADLINE_TWO + QUOTE),
      loadGoogleFont('JetBrains Mono', 600, WORDMARK + URL_TEXT + KICKER + SUBTITLE + '0123456789:. →•'),
    ]);
  } catch {
    // fall back to default sans if the font CDN is unreachable at render time
  }

  const fonts: { name: string; data: ArrayBuffer; weight: 400 | 600; style: 'normal' }[] = [];
  if (serifFont) fonts.push({ name: 'Fraunces', data: serifFont, weight: 600, style: 'normal' });
  if (sansFont) fonts.push({ name: 'JetBrains Mono', data: sansFont, weight: 600, style: 'normal' });

  const display = serifFont ? 'Fraunces' : 'serif';
  const mono = sansFont ? 'JetBrains Mono' : 'monospace';

  // Stylized waveform — deterministic but irregular bar heights
  const bars = [
    14, 28, 46, 22, 60, 88, 54, 110, 72, 132, 90, 60, 38, 72, 118, 156, 96, 68, 42, 28,
    18, 36, 64, 102, 144, 178, 120, 84, 52, 30, 22, 48, 80, 130, 168, 200, 140, 96, 60, 32,
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: '#09090b',
          fontFamily: mono,
          color: '#fafafa',
          overflow: 'hidden',
        }}
      >
        {/* Radial orange glow, top-right */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -120,
            width: 720,
            height: 720,
            borderRadius: 9999,
            background:
              'radial-gradient(circle, rgba(249,115,22,0.55) 0%, rgba(249,115,22,0.18) 38%, rgba(249,115,22,0) 70%)',
            display: 'flex',
          }}
        />
        {/* Subtle dot grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)',
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

        {/* Main content column */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '52px 64px',
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {/* Top row: brand lockup + REC pill */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 13,
                  background:
                    'radial-gradient(circle at 30% 22%, #FFB874 0%, #F97316 55%, #C2410C 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 12px 32px rgba(249,115,22,0.35)',
                }}
              >
                <svg width="34" height="34" viewBox="0 0 120 120" fill="none">
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
                  fontSize: 28,
                  fontWeight: 600,
                  letterSpacing: '0.22em',
                  color: '#fafafa',
                }}
              >
                {WORDMARK}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                border: '1px solid rgba(249,115,22,0.5)',
                borderRadius: 9999,
                fontSize: 13,
                letterSpacing: '0.22em',
                color: '#fb923c',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  background: '#F97316',
                  boxShadow: '0 0 14px #F97316',
                  display: 'flex',
                }}
              />
              REC · LIVE
            </div>
          </div>

          {/* Center: kicker + headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span
              style={{
                fontFamily: mono,
                fontSize: 14,
                letterSpacing: '0.34em',
                color: '#71717a',
              }}
            >
              {KICKER}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 1080 }}>
              <span
                style={{
                  fontFamily: display,
                  fontSize: 92,
                  fontWeight: 600,
                  lineHeight: 1.0,
                  letterSpacing: '-0.035em',
                  color: '#fafafa',
                }}
              >
                {HEADLINE}
              </span>
              <span
                style={{
                  fontFamily: display,
                  fontSize: 92,
                  fontWeight: 600,
                  lineHeight: 1.06,
                  letterSpacing: '-0.035em',
                  color: '#F97316',
                }}
              >
                {HEADLINE_TWO}
              </span>
            </div>
            <span
              style={{
                fontFamily: mono,
                fontSize: 19,
                color: '#d4d4d8',
                letterSpacing: '0.01em',
                lineHeight: 1.4,
                marginTop: 6,
              }}
            >
              {SUBTITLE}
            </span>
          </div>

          {/* Bottom row: domain pill + waveform */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 32,
              borderTop: '1px solid rgba(255,255,255,0.08)',
              paddingTop: 22,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '14px 24px',
                borderRadius: 9999,
                background: '#F97316',
                color: '#0c0a09',
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: '-0.005em',
              }}
            >
              <span>{URL_TEXT}</span>
              <span style={{ fontSize: 22 }}>→</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 56 }}>
              {bars.map((h, i) => {
                const scaled = Math.max(6, h * 0.28);
                const intensity = Math.min(1, h / 200);
                const isHot = i > 10 && i < 30;
                return (
                  <div
                    key={i}
                    style={{
                      width: 3,
                      height: scaled,
                      borderRadius: 2,
                      background: isHot
                        ? `rgba(249,115,22,${0.55 + intensity * 0.45})`
                        : `rgba(244,244,245,${0.16 + intensity * 0.22})`,
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
    {
      ...size,
      fonts: fonts.length ? fonts : undefined,
    },
  );
}
