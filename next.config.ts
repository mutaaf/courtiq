import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent DNS prefetch leakage while still allowing browser optimisations
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Block the app from being embedded in iframes (clickjacking protection)
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Stop MIME-type sniffing — browsers must respect declared Content-Type
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Only send origin as referrer when crossing to a different origin
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  // Limit info leaked via browser features (camera/mic permissions still work in-app)
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  // Force HTTPS for 2 years (includes subdomains)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js requires unsafe-eval for dev; unsafe-inline needed for styled-jsx / Tailwind
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://js.stripe.com https://js.stripe.com/v3/ https://checkout.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      // Allow images from Supabase storage, Stripe, OG images, data URIs, blobs
      "img-src 'self' blob: data: https:",
      "font-src 'self'",
      // Allow Supabase, Stripe, AI providers, and our own API routes
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://js.stripe.com https://api.stripe.com https://upstash.io https://*.upstash.io",
      // Stripe checkout needs to be framed
      "frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Prevent this app from being framed by other origins (stronger than X-Frame-Options)
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
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
        // Apply security headers to every route
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
