import type { NextConfig } from "next";

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
};

export default nextConfig;
