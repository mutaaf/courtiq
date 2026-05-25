'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, ArrowRight, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import {
  shouldShowFirstArtifactNudge,
  FIRST_ARTIFACT_CTA_HREF,
} from '@/lib/first-artifact-utils';

interface FirstArtifactCardProps {
  teamId: string;
  teamName: string;
  // The team's aggregate observation count (already on the home stats).
  observations: number;
  // How many artifacts (plans rows) the coach has generated for this team.
  // Read from existing data — no new tracking field on any table.
  artifactsGenerated: number;
}

// The missing final step of the activation arc: once a new coach has enough
// notes (and has not generated a single artifact yet), point them at the OUTPUT
// — a one-tap path to turn their notes into a report they can send a parent.
// Self-dismisses the moment the coach generates their first artifact (the
// eligibility helper returns false once artifactsGenerated > 0), and is
// manually dismissible for a bounded window so a coach who closes it is not
// re-nagged on every load (mirrors GettingStartedCard's dismiss pattern).
export function FirstArtifactCard({
  teamId,
  teamName,
  observations,
  artifactsGenerated,
}: FirstArtifactCardProps) {
  const dismissKey = `first-artifact-dismissed-${teamId}`;

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem(dismissKey);
    if (!val) return false;
    const ts = parseInt(val, 10);
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000; // 30 days
  });

  if (dismissed) return null;
  if (!shouldShowFirstArtifactNudge({ observations, artifactsGenerated })) return null;

  function dismiss() {
    localStorage.setItem(dismissKey, String(Date.now()));
    setDismissed(true);
  }

  return (
    <Card data-testid="first-artifact-card" className="overflow-hidden border-orange-500/30 bg-orange-500/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
              <FileText className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-zinc-100">
                You have {observations} note{observations !== 1 ? 's' : ''} on {teamName}
              </p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Turn them into a report you can send a parent.
              </p>
            </div>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss first report nudge"
            className="rounded p-1 text-zinc-600 hover:text-zinc-400 transition-colors touch-manipulation shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <Link href={FIRST_ARTIFACT_CTA_HREF}>
          <div className="group flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white transition-all hover:bg-orange-600 active:scale-[0.98] touch-manipulation">
            See what SportsIQ can make from your notes
            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
          </div>
        </Link>
      </CardContent>
    </Card>
  );
}
