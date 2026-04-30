import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from '@/components/providers';
import { SwRegister } from '@/components/ui/sw-register';
import { ErrorTrackingInit } from '@/components/ui/error-tracking-init';
import { AnalyticsInit } from '@/components/ui/analytics-init';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_URL = 'https://youthsportsiq.com';
const SITE_NAME = 'SportsIQ';
const TITLE = 'SportsIQ — Voice-first coaching intelligence';
const DESCRIPTION =
  'Hit record, coach like normal, and let AI turn your words into organized player notes. Built for youth sports.';

export const metadata: Metadata = {
  title: {
    default: TITLE,
    template: '%s · SportsIQ',
  },
  description: DESCRIPTION,
  metadataBase: new URL(SITE_URL),
  manifest: '/manifest.json',
  applicationName: SITE_NAME,
  keywords: [
    'youth sports',
    'coaching',
    'voice AI',
    'player notes',
    'practice notes',
    'coaching intelligence',
    'youth basketball',
    'youth soccer',
  ],
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: SITE_NAME,
    title: TITLE,
    description: DESCRIPTION,
    locale: 'en_US',
    // The OG image is generated dynamically by src/app/opengraph-image.tsx
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    creator: '@youthsportsiq',
  },
  robots: { index: true, follow: true },
  verification: {
    // Proves youthsportsiq.com ownership to Google (Search Console + OAuth consent screen branding).
    google: 'xc1Us6A0PsAngfDv4UDQVS2LTbrWam4eAAocEeDEfH8',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased light`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100">
        {/* Apply persisted theme before hydration to avoid a light-to-dark flash for
            users who toggled to dark previously. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('courtiq-theme');if(!t)t='light';var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.classList.toggle('light',t==='light');}catch(e){}})()`,
          }}
        />
        {/* Skip-to-content: visible only on keyboard focus; jumps past nav to main content */}
        <a href="#main-content" className="skip-to-content">
          Skip to main content
        </a>
        <SwRegister />
        <ErrorTrackingInit />
        <AnalyticsInit />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
