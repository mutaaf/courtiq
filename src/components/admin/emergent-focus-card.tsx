'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Copy, X } from 'lucide-react';
import { UpgradeGate } from '@/components/ui/upgrade-gate';
import { useTier } from '@/hooks/use-tier';
import { buildEmergentFocusShareText } from '@/lib/emergent-focus-share-text';

// ─── Ticket 0071 — director-private "your program is rallying around X" card ──
//
// EmergentFocusCard is the PURE presentational component the vitest suite
// pins. EmergentFocusSection is the thin wrapper the admin page mounts:
// fire-and-forget GET /api/org/emergent-focus + <UpgradeGate /> wrap.
//
// The card NEVER blocks the admin screen:
//   - loading (focus === undefined) → render nothing
//   - failed read (focus === undefined per best-effort) → render nothing
//   - empty / quiet program week (focus === null) → render nothing
//
// Dismiss posture (LESSONS#0023 — silent, no nag): tap "Got it" → localStorage
// stamp → card hidden for 7 days. The dismiss key is namespaced so a sibling
// card can never collide with it.

const DISMISS_KEY = 'sportsiq:emergent-focus-dismissed-at';
const DISMISS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export interface EmergentFocusTeam {
  id: string;
  name: string;
}

export interface EmergentFocusViewModel {
  skill: string;
  teamCount: number;
  teams: EmergentFocusTeam[];
}

/**
 * Tiny localStorage probe — returns true when the user dismissed the card
 * within the last 7 days. Guards SSR + a hostile or absent localStorage.
 */
function isCardDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const stamp = Number(raw);
    if (!Number.isFinite(stamp) || stamp <= 0) return false;
    return Date.now() - stamp < DISMISS_WINDOW_MS;
  } catch {
    return false;
  }
}

function stampDismiss(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // No-op: a hostile storage adapter shouldn't break the click.
  }
}

export function EmergentFocusCard({
  focus,
}: {
  focus: EmergentFocusViewModel | null | undefined;
}) {
  const [dismissed, setDismissed] = useState<boolean>(() => isCardDismissed());
  const [shareOpen, setShareOpen] = useState(false);

  // Re-check the localStorage dismissal whenever the focus arrives (so a
  // later mount with a still-active dismiss hides immediately without a
  // separate effect chain).
  useEffect(() => {
    if (isCardDismissed()) setDismissed(true);
  }, [focus]);

  if (!focus) return null;
  if (dismissed) return null;

  const teamNames = focus.teams.map((t) => t.name);
  const shareText = buildEmergentFocusShareText({
    skill: focus.skill,
    teamCount: focus.teamCount,
    teamNames,
  });

  // Up to 3 named teams in the body (matches the share-text truncation).
  const namedTeams = teamNames.slice(0, 3);
  const extra = Math.max(0, teamNames.length - 3);

  return (
    <div
      data-testid="emergent-focus-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <Sparkles className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            Emergent focus
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            This week, {focus.teamCount} of your coaches are working on{' '}
            <span className="text-orange-300">{focus.skill}</span>
          </p>
          <p className="text-xs text-zinc-400 mt-1 leading-snug">
            {namedTeams.join(', ')}
            {extra > 0 ? ` + ${extra} more` : ''}
            {' '}— a pattern that emerged on its own from their practice plans.
          </p>

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
            >
              Share this with the coaches
            </button>
            <button
              type="button"
              onClick={() => {
                stampDismiss();
                setDismissed(true);
              }}
              className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-3 text-xs font-medium text-zinc-300 hover:bg-zinc-900 transition-colors touch-manipulation active:scale-[0.97]"
            >
              Got it
            </button>
          </div>
        </div>
      </div>

      {shareOpen && (
        <ShareSheet
          shareText={shareText}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Small inline sheet: a textarea pre-filled with the drafted line + a Copy
 * button that exposes `data-share-text` so the vitest component test +
 * Playwright spec can both assert the exact text the director would paste
 * (text-only navigator.share variant per LESSONS#0056 / #0082 — the
 * surface has no URL, only text).
 */
function ShareSheet({
  shareText,
  onClose,
}: {
  shareText: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(shareText);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
      setCopied(true);
    } catch {
      // Fallback is just visual — the text is in the textarea either way.
      setCopied(true);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-medium text-zinc-300">
          Paste this into your all-coaches text — tweak anything you want first.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-zinc-500 hover:text-zinc-300"
          aria-label="Close share sheet"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleCopy}
          data-share-text={text}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97]"
        >
          <Copy className="h-3.5 w-3.5" />
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/**
 * Thin section: org-tier admin only. Loads the focus via useQuery (server-
 * gated by /api/org/emergent-focus's role+tier check — the section just
 * avoids the wasted round-trip for non-admins).
 */
export function EmergentFocusSection({
  orgId,
  isAdmin,
}: {
  orgId: string | null | undefined;
  isAdmin: boolean;
}) {
  const { canAccess } = useTier();
  const gated = !canAccess('feature_program_emergent_focus');

  const { data } = useQuery({
    queryKey: ['emergent-focus', orgId],
    enabled: !!orgId && isAdmin && !gated,
    staleTime: 30 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<EmergentFocusViewModel | null> => {
      const res = await fetch(`/api/org/emergent-focus?orgId=${encodeURIComponent(orgId!)}`);
      if (!res.ok) return null;
      const json = await res.json();
      const focuses = Array.isArray(json?.focuses) ? json.focuses : [];
      return focuses.length > 0 ? (focuses[0] as EmergentFocusViewModel) : null;
    },
  });

  if (!isAdmin) return null;

  if (gated) {
    return (
      <UpgradeGate
        feature="feature_program_emergent_focus"
        featureLabel="Emergent Focus"
      >
        <EmergentFocusCard focus={data} />
      </UpgradeGate>
    );
  }

  return <EmergentFocusCard focus={data} />;
}
