import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'SportsIQ — Offline',
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-950 p-8 text-center">
      <div className="mb-6 text-5xl">📵</div>
      <h1 className="mb-3 text-2xl font-bold text-zinc-100">You&apos;re offline</h1>
      <p className="mb-8 max-w-xs text-sm leading-relaxed text-zinc-400">
        Check your connection &mdash; your data will sync as soon as you&apos;re back online.
      </p>
      <Link
        href="/home"
        className="inline-flex items-center rounded-xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white active:scale-95 transition-transform touch-manipulation"
      >
        Try again
      </Link>
    </div>
  );
}
