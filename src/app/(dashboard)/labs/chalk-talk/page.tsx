'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ExternalLink } from 'lucide-react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { chalkTalkSportFor } from '@/lib/labs-sport-utils';
import type { ChalkTalkBoard } from 'chalk-talk';

// Chalk Talk mounts into one element and owns everything inside it (WebGL, mic, speech).
// It's browser-only, so it loads after mount and is destroyed on the way out.
export default function ChalkTalkPage() {
  const ref = useRef<HTMLDivElement>(null);
  const { sportSlug, activeTeamId } = useActiveTeam();
  const sport = chalkTalkSportFor(sportSlug);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let board: ChalkTalkBoard | null = null;
    let cancelled = false;
    import('chalk-talk')
      .then(({ mount }) => {
        if (cancelled || !ref.current) return;
        // team: player names (saved on this device only) are kept per team
        board = mount(ref.current, { sport, title: false, team: activeTeamId || 'default' });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      board?.destroy();
    };
  }, [sport]);

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
