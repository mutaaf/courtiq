import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent DNS prefetch leaking referrer data
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Block clickjacking via iframes
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer to same origin when crossing to http
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Restrict access to sensitive browser APIs
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'geolocation=()',
      'interest-cohort=()',
      // Microphone is used for voice capture — allow same origin
      'microphone=(self)',
    ].join(', '),
  },
  // Content Security Policy — permissive for Next.js + Supabase + Vercel
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-inline and unsafe-eval for RSC and hydration
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      // Images: self + data URIs + all HTTPS (Supabase storage, player photos)
      "img-src 'self' blob: data: https:",
      "font-src 'self' data:",
      // API calls: self + Supabase + Vercel analytics + Anthropic/OpenAI/Gemini (server-side only, but allow connect for SSE)
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://vitals.vercel-insights.com https://va.vercel-scripts.com",
      // Voice recording and media playback
      "media-src 'self' blob:",
      // Service worker
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
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
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
