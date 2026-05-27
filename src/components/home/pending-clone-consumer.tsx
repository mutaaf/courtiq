'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Ticket 0049 — consume a `sportsiq_pending_clone_token` stashed on signup by
// the public /plan/<token> CTA, and once the new coach has their first team,
// POST the dedicated clone route. Auto-removes the bookmark whether the clone
// succeeds or fails (a stale token must never re-fire on every /home load).
//
// Renders nothing. Lives on /home — by the time the page mounts, /api/me has
// the new coach's first team (created during onboarding/setup).
export function PendingCloneConsumer({ activeTeamId }: { activeTeamId: string | null }) {
  const fired = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (fired.current) return;
    if (!activeTeamId) return;
    let token: string | null = null;
    try {
      token = sessionStorage.getItem('sportsiq_pending_clone_token');
    } catch {
      return;
    }
    if (!token) return;
    fired.current = true;
    // Always remove the bookmark first so a stale or invalid token never
    // re-fires on the next /home load.
    try {
      sessionStorage.removeItem('sportsiq_pending_clone_token');
    } catch {
      // ignore
    }
    fetch('/api/practice-plan-shares/clone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, teamId: activeTeamId }),
    })
      .then((res) => {
        if (res.ok) {
          // Refresh the home queries so the freshly-cloned plan surfaces.
          router.refresh();
        }
      })
      .catch(() => {
        // Best-effort; a failed clone just means the bookmark is gone and
        // the coach can revisit /plan/<token> if they kept the link.
      });
  }, [activeTeamId, router]);

  return null;
}
