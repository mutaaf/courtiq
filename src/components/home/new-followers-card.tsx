'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';

// Ticket 0063 — publisher-side notification card on /home.
//
// Reads GET /api/coach-follows/new-followers and renders ONE line per new
// follower (first name only), capped at 5 with a "+ N more" tail. The
// Got-it button POSTs /api/coach-follows/new-followers/seen which advances
// the publisher's `coaches.preferences.last_seen_follow_count` bookmark; the
// card unmounts immediately so the publisher's /home stays calm.
//
// Empty payload → renders nothing. The card is self-gating: a publisher with
// no new followers since the bookmark sees no card.
//
// Voice: clipboard, not consumer-SaaS. Public coach profile (0026) does NOT
// expose the follower count — this card is the only surface where the
// publisher learns who is coming back. No AGENTS.md banned words.

interface NewFollowerLine {
  followerFirstName: string;
}

interface NewFollowersPayload {
  lines: NewFollowerLine[];
  extraCount: number;
  total: number;
}

export function NewFollowersCard() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<NewFollowersPayload>({
    queryKey: ['coach-follows-new-followers'],
    queryFn: async () => {
      const res = await fetch('/api/coach-follows/new-followers');
      if (!res.ok) return { lines: [], extraCount: 0, total: 0 };
      return (await res.json()) as NewFollowersPayload;
    },
    staleTime: 5 * 60_000,
  });

  // Reset the dismissed flag when the underlying data refreshes — the
  // publisher can be re-followed in a future render window.
  useEffect(() => {
    setDismissed(false);
  }, [data?.total]);

  if (dismissed) return null;
  if (!data) return null;
  if (data.total <= 0 || data.lines.length === 0) return null;

  async function acknowledge() {
    setDismissed(true);
    try {
      await fetch('/api/coach-follows/new-followers/seen', { method: 'POST' });
    } catch {
      // Best-effort — a failed POST just means the card may show again on
      // the next /home load; never blocks the render.
    }
    qc.invalidateQueries({ queryKey: ['coach-follows-new-followers'] });
  }

  return (
    <div
      data-testid="new-followers-card"
      className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
          <Users className="h-5 w-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            New coaches following your drops
          </p>
          <ul className="mt-2 space-y-1 text-sm text-zinc-100">
            {data.lines.map((line, i) => (
              <li key={`${line.followerFirstName}-${i}`} data-testid="new-followers-line">
                Coach <span className="font-semibold">{line.followerFirstName}</span> is following
                your drops.
              </li>
            ))}
          </ul>
          {data.extraCount > 0 && (
            <p
              data-testid="new-followers-extra"
              className="mt-1.5 text-xs text-zinc-400"
            >
              + {data.extraCount} more
            </p>
          )}
          <div className="mt-3 flex items-center justify-between">
            <a
              href="/coach-profile/followers"
              data-testid="new-followers-see-all"
              className="text-xs font-medium text-orange-300 hover:text-orange-200"
            >
              See full list
            </a>
            <button
              type="button"
              onClick={acknowledge}
              data-testid="new-followers-gotit"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
