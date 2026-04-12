'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">
        <AlertTriangle className="h-8 w-8 text-red-500" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-zinc-100">Something went wrong</h2>
        <p className="max-w-sm text-sm text-zinc-400">
          An unexpected error occurred. Try again or return to the home screen.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-zinc-600">ID: {error.digest}</p>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={reset}
          className="flex h-12 items-center gap-2 rounded-lg bg-orange-500 px-6 text-sm font-medium text-white touch-manipulation active:scale-[0.98]"
        >
          <RefreshCw className="h-4 w-4" />
          Try again
        </button>
        <Link
          href="/"
          className="flex h-12 items-center gap-2 rounded-lg bg-zinc-800 px-6 text-sm font-medium text-zinc-100 touch-manipulation active:scale-[0.98]"
        >
          <Home className="h-4 w-4" />
          Go home
        </Link>
      </div>
    </div>
  );
}
