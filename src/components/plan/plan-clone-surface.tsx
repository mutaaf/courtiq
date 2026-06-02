'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { FollowCoachInlineCard } from '@/components/plan/follow-coach-inline-card';

// Ticket 0063 — the clone-success surface on the public plan page.
//
// Wraps the 0049 "Save to my team" CTA with the post-clone follow inline
// card. The surface owns three phases:
//
//   - idle      → renders the Save-to-my-team button (mirrors 0049 UX).
//   - cloned    → renders a small "Saved" success line AND the inline
//                 FollowCoachInlineCard. The user can then tap Follow, or
//                 tap "Open in /home" to navigate. The success state stays
//                 on screen so the AC's "directly below the Save success
//                 state" requirement holds.
//   - error     → renders the error message; the user can retry.
//
// The clone POST is the same /api/practice-plan-shares/clone shipped by
// 0049. Source-of-truth for the publisher's first name + coach id is the
// plan-page payload, which the server component passes in as props.
//
// Theme: parent-portal aesthetic (gray-50 + orange accent), NOT dark.

interface PlanCloneSurfaceProps {
  token: string;
  publisherCoachId: string | null;
  publisherFirstName: string | null;
}

interface MeResponse {
  coach?: { id: string } | null;
  teams?: Array<{ id: string; name: string }>;
}

export function PlanCloneSurface({
  token,
  publisherCoachId,
  publisherFirstName,
}: PlanCloneSurfaceProps) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cloned, setCloned] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setMe(null);
        } else {
          const data = (await res.json().catch(() => null)) as MeResponse | null;
          setMe(data);
        }
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setMeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function clone(teamId: string) {
    setPending(teamId);
    setError(null);
    try {
      const res = await fetch('/api/practice-plan-shares/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, teamId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not save plan');
      }
      setCloned(true);
      setShowPicker(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save plan');
    } finally {
      setPending(null);
    }
  }

  // Loading state.
  if (!meReady) {
    return (
      <button
        disabled
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500/70 px-5 py-3.5 text-base font-semibold text-white"
        aria-label="Save to my team"
        data-testid="save-to-my-team-cta"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        Save to my team
      </button>
    );
  }

  const coachId = me?.coach?.id ?? null;
  const teams = (me?.teams ?? []).filter((t) => t && typeof t.id === 'string');

  // After a successful clone — show the success state + follow inline card.
  if (cloned) {
    return (
      <div className="space-y-3">
        <div
          data-testid="plan-cloned-success"
          className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
        >
          <Check className="h-4 w-4" />
          <span>Saved to your team.</span>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="ml-auto text-xs font-medium text-green-700 underline hover:text-green-900"
          >
            Open in /home
          </button>
        </div>
        {publisherCoachId && publisherFirstName && (
          <FollowCoachInlineCard
            publisherCoachId={publisherCoachId}
            publisherFirstName={publisherFirstName}
            token={token}
            viewerIsSignedIn={!!coachId}
          />
        )}
      </div>
    );
  }

  // Unauthed: deep-link to signup carrying the clone token.
  if (!coachId) {
    return (
      <a
        href={`/signup?clone_token=${encodeURIComponent(token)}`}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-semibold text-white hover:bg-orange-600 active:scale-[0.98] touch-manipulation transition-all"
        aria-label="Save to my team"
        data-testid="save-to-my-team-cta"
      >
        Save to my team
      </a>
    );
  }

  // One team — one tap.
  if (teams.length === 1) {
    const team = teams[0];
    return (
      <>
        <button
          onClick={() => clone(team.id)}
          disabled={pending !== null}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-semibold text-white hover:bg-orange-600 active:scale-[0.98] touch-manipulation transition-all disabled:opacity-60"
          aria-label="Save to my team"
          data-testid="save-to-my-team-cta"
        >
          {pending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Check className="h-4 w-4" />
              Save to {team.name}
            </>
          )}
        </button>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </>
    );
  }

  // Multi-team picker.
  return (
    <>
      <button
        onClick={() => setShowPicker(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-semibold text-white hover:bg-orange-600 active:scale-[0.98] touch-manipulation transition-all"
        aria-label="Save to my team"
        data-testid="save-to-my-team-cta"
      >
        Save to my team
      </button>

      {showPicker && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Choose a team"
        >
          <div className="w-full max-w-md rounded-t-2xl sm:rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Choose a team</h3>
            <p className="mt-1 text-xs text-gray-600">
              Pick the team you want to run this plan with.
            </p>
            <ul className="mt-4 space-y-2">
              {teams.map((t) => (
                <li key={t.id}>
                  <button
                    onClick={() => clone(t.id)}
                    disabled={pending !== null}
                    className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm font-medium text-gray-900 hover:bg-gray-50 active:scale-[0.98] disabled:opacity-60"
                  >
                    <span>{t.name}</span>
                    {pending === t.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                    ) : (
                      <span className="text-xs font-semibold text-orange-600">Save here</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <button
              onClick={() => setShowPicker(false)}
              className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
