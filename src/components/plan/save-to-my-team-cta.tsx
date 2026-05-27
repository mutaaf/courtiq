'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';

// "Save to my team" CTA on the public /plan/<token> page (ticket 0049).
//
// Three behaviors depending on the visitor's session state:
//   1. Unauthed → links to /signup?clone_token=<token>. Signup persists the
//      token so first-team-setup auto-clones the plan onto the new team.
//   2. Authed with ONE team → POST /api/practice-plan-shares/clone with that
//      team's id, then router.push('/home') to land on the cloned plan.
//   3. Authed with MULTIPLE teams → opens a team picker; on choose, same POST.
//
// The component asks /api/me for the visitor's teams (no auth on /api/me means
// no Set-Cookie, no leak — the endpoint returns 401 for the unauthed branch).
//
// Voice: clipboard, not consumer-SaaS. "Save to my team" is the entire frame.
// No banned words (AGENTS.md).
interface MeResponse {
  coach?: { id: string } | null;
  teams?: Array<{ id: string; name: string }>;
}

export function SaveToMyTeamCTA({ token }: { token: string }) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.push('/home');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not save plan');
      setPending(null);
    }
  }

  // Loading state — keep the CTA visible but inert.
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

  // Authed with exactly one team — one-tap save.
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

  // Authed with multiple teams — opens a small picker.
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
            <p className="mt-1 text-xs text-gray-600">Pick the team you want to run this plan with.</p>
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
