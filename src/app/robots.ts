import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://youthsportsiq.com';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/home',
          '/roster',
          '/sessions',
          '/observations',
          '/capture',
          '/plans',
          '/analytics',
          '/settings',
          '/curriculum',
          '/marketplace',
          '/parents/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
