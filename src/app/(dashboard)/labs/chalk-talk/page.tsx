'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { planFor } from '@/lib/chalk-talk-ai';
import { chalkTalkSportFor } from '@/lib/labs-sport-utils';
import type { ChalkTalkBoard } from 'chalk-talk';

// Chalk Talk mounts into one element and owns everything inside it (WebGL, mic, speech).
// It's browser-only, so it loads after mount and is destroyed on the way out.
export default function ChalkTalkPage() {
  const ref = useRef<HTMLDivElement>(null);
  const { sportSlug, activeTeamId, coach } = useActiveTeam();
  const sport = chalkTalkSportFor(sportSlug);
  // paid plans run Chalk Talk's AI on CourtIQ (no key needed); free plans keep the free daily AI and
  // see the upgrade wherever the AI isn't available (film room, AI settings, a play it can't draw)
  const paid = !!planFor((coach as any)?.organizations);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let board: ChalkTalkBoard | null = null;
    let cancelled = false;
    import('chalk-talk')
      .then(({ mount }) => {
        if (cancelled || !ref.current) return;
        // team: player names (saved on this device only) are kept per team
        board = mount(ref.current, {
          sport,
          title: false,
          team: activeTeamId || 'default',
          ...(paid
            ? { api: '/api/labs/chalk-talk' }
            : { upgrade: { label: 'Get Chalk Talk AI · $4.99/mo', href: '/labs/chalk-talk/ai', note: 'Launch price (regularly $9.99). Also included with every CourtIQ plan.' } }),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      board?.destroy();
    };
  }, [sport, paid, activeTeamId]);

  return (
    <div className="flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] flex-col lg:h-[calc(100dvh-3rem)]">
      <div className="flex items-center justify-between gap-3 px-4 py-2">
        <Link href="/labs" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-100">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Labs
        </Link>
        <a
          href="https://mutaafaziz.com/chalktalk/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300"
        >
          Open full screen <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      </div>
      {failed ? (
        <p className="px-4 text-sm text-zinc-400">Chalk Talk couldn&apos;t load on this device.</p>
      ) : (
        <div ref={ref} data-testid="chalk-talk-board" className="min-h-0 flex-1 overflow-hidden rounded-t-xl lg:mx-4 lg:rounded-xl" />
      )}
    </div>
  );
}
