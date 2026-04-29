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

export const metadata: Metadata = {
  title: 'SportsIQ — Coaching Intelligence',
  description: 'Voice-first, AI-powered coaching intelligence platform for youth sports',
  metadataBase: new URL('https://youthsportsiq.com'),
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.svg',
    apple: '/icons/icon-192.png',
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
