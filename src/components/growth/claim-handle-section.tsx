'use client';

// ClaimHandleSection — the "Want a cleaner URL?" surface for the vanity
// coach handle (ticket 0054). Lives on /settings/referrals.
//
// Two states:
//   - Unclaimed: a text input pre-filled by proposeHandle(coach.full_name),
//     a debounced available-check that hits /api/coach-handle/available, and
//     a Claim button that POSTs /api/coach-handle/claim. On success the
//     section collapses to the read-only line.
//   - Already claimed: read-only "Your URL: sportsiq.app/coach/<handle>"
//     with a Copy button — no re-claim affordance in v1 (one-time-claim-
//     then-lock; rename is a future ticket).
//
// All copy is factual (cf. LESSONS#0023). No AGENTS.md banned word appears
// in this component's rendered DOM (asserted by the component test).
//
// Auth boundary is the server route; this client component never reads
// from Supabase directly (AGENTS.md rule 3).

import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check, Loader2 } from 'lucide-react';
import { proposeHandle } from '@/lib/coach-handle-utils';

interface ClaimHandleSectionProps {
  initialHandle: string | null;
  displayName: string | null;
}

type AvailableState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'ok' }
  | { status: 'rejected'; reason: 'taken' | 'reserved' | 'invalid' };

const APP_HOST = 'sportsiq.app';

function siteHost(): string {
  if (typeof window !== 'undefined') return window.location.host;
  return APP_HOST;
}

function buildHandleUrl(handle: string): string {
  return `${siteHost()}/coach/${handle}`;
}

export function ClaimHandleSection({ initialHandle, displayName }: ClaimHandleSectionProps) {
  const [claimedHandle, setClaimedHandle] = useState<string | null>(initialHandle);

  if (claimedHandle && claimedHandle.length > 0) {
    return <ClaimedView handle={claimedHandle} />;
  }

  return (
    <UnclaimedForm
      displayName={displayName ?? ''}
      onClaimed={(h) => setClaimedHandle(h)}
    />
  );
}

// ─── Read-only state ─────────────────────────────────────────────────────────

function ClaimedView({ handle }: { handle: string }) {
  const url = buildHandleUrl(handle);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    if (typeof navigator === 'undefined') return;
    navigator.clipboard?.writeText(`https://${url}`).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {
        /* clipboard refused — no-op */
      },
    );
  }

  return (
    <div
      data-testid="claim-handle-section"
      className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4"
    >
      <p className="text-sm text-zinc-400">Your URL</p>
      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
        <span className="flex-1 truncate font-mono text-sm text-zinc-200">{url}</span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy"
          className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-zinc-200 hover:bg-zinc-700"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          <span className="ml-1 text-xs">{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  );
}

// ─── Form state ──────────────────────────────────────────────────────────────

function UnclaimedForm({
  displayName,
  onClaimed,
}: {
  displayName: string;
  onClaimed: (handle: string) => void;
}) {
  const proposed = useMemo(
    () => proposeHandle(displayName || 'coach', new Set()),
    [displayName],
  );

  const [value, setValue] = useState(proposed);
  const [available, setAvailable] = useState<AvailableState>({ status: 'idle' });
  const [claiming, setClaiming] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastQueriedRef = useRef<string | null>(null);

  // Debounced availability check. The route is the auth boundary; client-side
  // shape validation is purely UX (the server re-checks every field).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value || value.length < 2) {
      setAvailable({ status: 'idle' });
      return;
    }
    setAvailable({ status: 'checking' });
    debounceRef.current = setTimeout(() => {
      const h = value;
      lastQueriedRef.current = h;
      fetch(`/api/coach-handle/available?handle=${encodeURIComponent(h)}`, {
        credentials: 'same-origin',
      })
        .then((r) => r.json())
        .then((data: { available?: boolean; reason?: 'taken' | 'reserved' | 'invalid' | null }) => {
          // A late response that's no longer the latest query is ignored.
          if (lastQueriedRef.current !== h) return;
          if (data?.available) {
            setAvailable({ status: 'ok' });
          } else {
            setAvailable({
              status: 'rejected',
              reason: (data?.reason as 'taken' | 'reserved' | 'invalid' | null) ?? 'invalid',
            });
          }
        })
        .catch(() => {
          if (lastQueriedRef.current !== h) return;
          setAvailable({ status: 'idle' });
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  async function handleClaim() {
    setClaiming(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/coach-handle/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ handle: value }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        handle?: string;
        error?: string;
      };
      if (res.ok && data.handle) {
        onClaimed(data.handle);
        return;
      }
      // Map server errors to short, factual copy.
      const reason = data?.error ?? 'failed';
      const map: Record<string, string> = {
        taken: 'That handle was just claimed by another coach.',
        already_claimed: 'You already have a handle.',
        invalid_handle: 'That handle has characters the URL cannot use.',
        reserved_handle: 'That handle is reserved.',
        invalid_body: 'That handle has characters the URL cannot use.',
        failed: 'Could not save the handle. Try again.',
        update_failed: 'Could not save the handle. Try again.',
      };
      setErrorMsg(map[reason] ?? map.failed);
    } catch {
      setErrorMsg('Could not save the handle. Try again.');
    } finally {
      setClaiming(false);
    }
  }

  // Hint copy is factual and lists the URL shape only — never enumerates the
  // banned tokens verbatim (LESSONS#0023). The reasons map above is also
  // factual.
  let indicator: React.ReactNode = null;
  if (available.status === 'checking') {
    indicator = (
      <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
        <Loader2 className="h-3 w-3 animate-spin" /> Checking
      </span>
    );
  } else if (available.status === 'ok') {
    indicator = (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
        <Check className="h-3 w-3" /> Free
      </span>
    );
  } else if (available.status === 'rejected') {
    const reasonText: Record<typeof available.reason, string> = {
      taken: 'Taken',
      reserved: 'Reserved',
      invalid: 'Use lowercase letters, numbers, and hyphens (2 to 32 characters).',
    };
    indicator = <span className="text-xs text-rose-400">{reasonText[available.reason]}</span>;
  }

  const canClaim = available.status === 'ok' && !claiming;

  return (
    <div
      data-testid="claim-handle-section"
      className="space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-4"
    >
      <div>
        <p className="text-sm font-medium text-zinc-100">Want a cleaner URL?</p>
        <p className="mt-0.5 text-xs text-zinc-400">
          Claim a handle so your profile fits in your email signature.
        </p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3">
        <span className="font-mono text-xs text-zinc-500">{siteHost()}/coach/</span>
        <input
          aria-label="Handle"
          value={value}
          onChange={(e) => setValue(e.target.value.toLowerCase())}
          maxLength={32}
          className="min-h-[44px] flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs">{indicator}</div>
        <button
          type="button"
          onClick={handleClaim}
          disabled={!canClaim}
          className="inline-flex h-11 min-w-[44px] items-center justify-center rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {claiming ? <Loader2 className="h-4 w-4 animate-spin" /> : `Claim ${value}`}
        </button>
      </div>

      {errorMsg && <p className="text-xs text-rose-400">{errorMsg}</p>}
    </div>
  );
}
