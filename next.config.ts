import type { NextConfig } from "next";

// Security headers applied to every response.
// CSP is intentionally permissive on script-src/style-src because Next.js 14
// uses inline scripts for hydration and Tailwind injects styles at build time.
// The headers that matter most for XSS/clickjacking/MIME sniffing are all here.
const securityHeaders = [
  // Clickjacking protection (belt-and-suspenders with frame-ancestors in CSP)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing attacks
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Limit referrer info sent to third-party origins
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // DNS prefetch for faster navigation
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Disable sensitive browser features not used by this app
  {
    key: 'Permissions-Policy',
    value: 'camera=(), geolocation=(), payment=(), usb=()',
  },
  // Content Security Policy
  // - connect-src https: wss: covers Supabase, AI APIs, Stripe, PostHog, Vercel
  // - frame-ancestors 'none' prevents embedding in third-party iframes
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data: https:",
      "media-src 'self' blob:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
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
        source: '/:path*',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
