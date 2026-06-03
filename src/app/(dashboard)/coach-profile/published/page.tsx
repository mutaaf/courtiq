'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// Ticket 0064 — /coach-profile/published
//
// The authed page listing the caller's own published drills with the
// per-share clone count. Mirrors the 0063 /coach-profile/followers page's
// shape (read-only list with one row per artifact, with a small action
// link per row).
//
// COPPA: the panel reads /api/drill-shares/mine, which is an EXPLICIT
// allow-list of public-by-construction fields (drill name + caption + the
// caller's own clone count). Cloner identities are never read or returned.
// The page is auth-required by default (NOT in publicPaths).
//
// The existing public coach profile (0026 at /coach/<handle>) is
// BYTE-IDENTICAL — this list lives only on the AUTHED dashboard surface.

interface MineShare {
  token: string;
  drillId: string;
  drillName: string;
  caption: string | null;
  publishedAt: string;
  isActive: boolean;
  cloneCount: number;
}

export default function PublishedDrillsPage() {
  const [shares, setShares] = useState<MineShare[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/drill-shares/mine')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setError(`Could not load published drills (${res.status})`);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { shares?: MineShare[] };
        setShares(Array.isArray(body.shares) ? body.shares : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load published drills');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function unpublish(token: string) {
    const res = await fetch(
      `/api/drill-shares/${encodeURIComponent(token)}/unpublish`,
      { method: 'POST' },
    );
    if (res.ok) {
      setShares((cur) =>
        cur === null
          ? cur
          : cur.map((s) => (s.token === token ? { ...s, isActive: false } : s)),
      );
    }
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8" data-testid="published-drills-page">
      <div>
        <h1 className="text-2xl font-bold text-zinc-100">Drills I have published</h1>
        <p className="text-sm text-zinc-400">
          Each row is a drill you shared as a clone card. Tap a row to copy the link.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-900/40 bg-red-950/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {shares !== null && shares.length === 0 && (
        <div
          className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 text-sm text-zinc-400"
          data-testid="published-drills-empty"
        >
          No drills published yet. Open a drill from your library and tap Publish to share it.
        </div>
      )}

      {shares !== null && shares.length > 0 && (
        <ul className="space-y-2" data-testid="published-drills-list">
          {shares.map((s) => (
            <li
              key={s.token}
              data-testid="published-drills-row"
              className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    href={`/drill/${encodeURIComponent(s.token)}`}
                    className="text-sm font-semibold text-zinc-100 hover:text-orange-300"
                  >
                    {s.drillName}
                  </Link>
                  {s.caption && (
                    <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                      &ldquo;{s.caption}&rdquo;
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-zinc-800 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-300">
                  {s.cloneCount} {s.cloneCount === 1 ? 'clone' : 'clones'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="text-zinc-500">
                  {s.isActive ? 'Public' : 'Unpublished'} ·{' '}
                  {new Date(s.publishedAt).toLocaleDateString()}
                </span>
                {s.isActive && (
                  <button
                    type="button"
                    onClick={() => unpublish(s.token)}
                    className="text-xs font-medium text-orange-400 hover:text-orange-300"
                  >
                    Unpublish
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div>
        <Link
          href="/home"
          className="text-xs font-medium text-orange-400 hover:text-orange-300"
        >
          ← Back to /home
        </Link>
      </div>
    </div>
  );
}
