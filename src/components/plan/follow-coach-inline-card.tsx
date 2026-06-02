'use client';

import { useState } from 'react';
import { Check, Loader2, UserPlus } from 'lucide-react';

// Inline "Follow Coach <First Name>" card on the public /plan/<token> page
// (ticket 0063). Mounts inside the clone-success client sub-tree (the parent
// /plan page is a server component; the SaveToMyTeamCTA already lives in a
// client component, and this card lives next to that flow).
//
// Two visitor states:
//   1. Signed-in coach → the card shows a Follow button that POSTs
//      /api/coach-follows with { followee_id: publisherCoachId }. On
//      success the card flips to "Following Coach <First Name>".
//   2. Unauthenticated visitor → the card shows a sign-in link pointing at
//      /login?next=/plan/<token>. No POST is fired.
//
// data-testid="follow-coach-control" + data-share-url=<profileUrl> per
// LESSONS#0056 / #0082 so the e2e + component test can scope cleanly.
//
// Voice: clipboard, not consumer-SaaS. No AGENTS.md banned words.
interface FollowCoachInlineCardProps {
  publisherCoachId: string;
  publisherFirstName: string;
  token: string;
  viewerIsSignedIn: boolean;
}

export function FollowCoachInlineCard({
  publisherCoachId,
  publisherFirstName,
  token,
  viewerIsSignedIn,
}: FollowCoachInlineCardProps) {
  const [phase, setPhase] = useState<'idle' | 'pending' | 'following' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Built once so the test can read the deep-link target via data-share-url.
  const profileUrl = `/coach-profile/${encodeURIComponent(publisherCoachId)}`;

  async function follow() {
    setPhase('pending');
    setErrorMessage(null);
    try {
      const res = await fetch('/api/coach-follows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followee_id: publisherCoachId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not save follow');
      }
      setPhase('following');
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not save follow');
      setPhase('error');
    }
  }

  // Unauthenticated visitor branch.
  if (!viewerIsSignedIn) {
    const next = encodeURIComponent(`/plan/${token}`);
    return (
      <div
        data-testid="follow-coach-control"
        data-share-url={profileUrl}
        className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm"
      >
        <p>
          Cloned from Coach <span className="font-semibold">{publisherFirstName}</span>.
        </p>
        <a
          href={`/login?next=${next}`}
          className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 touch-manipulation transition-colors"
          data-testid="follow-coach-signin-link"
        >
          Sign in to follow Coach {publisherFirstName}
        </a>
      </div>
    );
  }

  // Following success state.
  if (phase === 'following') {
    return (
      <div
        data-testid="follow-coach-control"
        data-share-url={profileUrl}
        className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-gray-800"
      >
        <p className="flex items-center gap-2">
          <Check className="h-4 w-4 text-orange-600" />
          <span>
            Following Coach <span className="font-semibold">{publisherFirstName}</span> — their next
            plan will appear at the top of your league feed.
          </span>
        </p>
      </div>
    );
  }

  // Default idle / pending / error state for the signed-in coach.
  return (
    <div
      data-testid="follow-coach-control"
      data-share-url={profileUrl}
      className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm"
    >
      <p>
        Cloned from Coach <span className="font-semibold">{publisherFirstName}</span>. Follow their
        drops?
      </p>
      <button
        type="button"
        onClick={follow}
        disabled={phase === 'pending'}
        aria-label={`Follow Coach ${publisherFirstName}`}
        className="mt-2 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 touch-manipulation transition-colors"
        data-testid="follow-coach-button"
      >
        {phase === 'pending' ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Following…
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            Follow Coach {publisherFirstName}
          </>
        )}
      </button>
      {phase === 'error' && errorMessage && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
