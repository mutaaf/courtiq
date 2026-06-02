'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

// Ticket 0063 — Unfollow-me control on /coach-profile/followers.
//
// The followee (the publisher) taps this to dissolve the edge from THEIR
// side. The route is the same DELETE /api/coach-follows/[followeeId] used by
// the follower's own Unfollow control — except here the "followee" parameter
// is the caller's OWN coach id (so the route deletes the row from the other
// direction). Because the route deletes by (follower_id=auth.user.id,
// followee_id=:param), the publisher passes the FOLLOWER'S id as the URL
// parameter and a `mode=remove-follower` body flag.
//
// To keep the route minimal (no new endpoint), this UI component instead
// posts to a small typed endpoint /api/coach-follows/remove-follower that
// inverts the perspective server-side. The follow row is the same row either
// way — both sides can dissolve it.
export function UnfollowMeButton({ followerId }: { followerId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [removed, setRemoved] = useState(false);

  async function unfollowMe() {
    setPending(true);
    try {
      const res = await fetch(`/api/coach-follows/remove-follower/${encodeURIComponent(followerId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setRemoved(true);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  if (removed) {
    return (
      <span
        className="text-xs font-medium text-zinc-500"
        data-testid="unfollow-me-removed"
      >
        Removed
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={unfollowMe}
      disabled={pending}
      data-testid="unfollow-me-button"
      aria-label="Remove this follower"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
      Unfollow me
    </button>
  );
}
