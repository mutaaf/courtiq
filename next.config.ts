import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent DNS prefetch leaking referrer info
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Block clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer to origin only on cross-origin requests
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restrict which browser features this app can request
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      // Default: only self
      "default-src 'self'",
      // Next.js requires unsafe-eval + unsafe-inline for dev HMR and hydration;
      // Vercel Analytics injects its own script tag
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com",
      // Tailwind/Next.js injects inline styles; no external style sheets
      "style-src 'self' 'unsafe-inline'",
      // next/font inlines fonts as data URIs; no external font CDN needed
      "font-src 'self' data:",
      // Player/coach photos come from any HTTPS host (Supabase storage, user URLs)
      "img-src 'self' blob: data: https:",
      // MediaRecorder produces blob: URLs; uploaded audio is a blob
      "media-src 'self' blob:",
      // Supabase (auth + DB + realtime websocket), AI providers are server-side only
      "connect-src 'self' https: wss:",
      // Service worker and audio worklets use blob: workers
      "worker-src 'self' blob:",
      // No plugins (Flash, etc.)
      "object-src 'none'",
      // Prevent base tag hijacking
      "base-uri 'self'",
      // This page must not be embedded in any frame
      "frame-ancestors 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
  images: {
    // Allow player/coach photos from any HTTPS host (Supabase storage,
    // external CDNs, user-provided URLs).
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
