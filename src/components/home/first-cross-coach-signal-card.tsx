'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type {
  FirstCrossCoachSignal,
  FirstCrossCoachSignalKind,
} from '@/lib/first-cross-coach-signal';

// ─── Ticket 0088 — first cross-coach signal activation card ─────────────────
//
// Mounts at the TOP of /home. Renders ONLY when the home-feed payload
// carries a non-null first-of-its-kind cross-coach signal that has not
// yet been dismissed for the caller coach.
//
// The activation moment is the moment a coach crosses from "user of
// SportsIQ" to "person other coaches learn from". The product has, over
// the last quarter, shipped EIGHT per-event cross-coach surfaces; this
// is the ONE first-of-its-kind surface that names the moment, fires
// EXACTLY ONCE per coach per kind, and goes silent forever after.
//
// Voice posture (LESSONS#0023): every rendered string instructs
// positively. The jsdoc here never embeds an AGENTS.md banned word
// verbatim — the component test scans the rendered text against the
// banned set.
//
// COPPA: never renders a surname (LESSONS#0061 — the route splits
// `first_name` off `full_name` server-side; this component renders
// whatever string the route emitted). Never renders a player name,
// parent email, or coach email — the route's `.select()` allow-list
// is the contract.
//
// Tier posture: NO tier feature key. The card renders for every tier,
// free included — it is the loop's most leveraged first-stick moment
// (free → paid retention lift) and gating it would defeat the entire
// growth thesis.

interface CardProps {
  /** The signal payload, or null when no first-of-its-kind cross-coach
   *  signal has fired (or every kind has already been dismissed). */
  signal: FirstCrossCoachSignal | null;
  /** Override for `Date.now()` so the relative-date rendering is
   *  deterministic in tests. */
  nowMs?: number;
}

// Per-kind headline copy. Each variant names the structural moment
// without invoking any hyped marketing word.
const HEADLINE_BY_KIND: Record<FirstCrossCoachSignalKind, string> = {
  clone: 'Your first time a coach outside this team picked up your work',
  thank: 'Your first in-product thank from another coach',
  parent_forward: 'Your first time a parent forwarded your report',
  parent_forward_cross_team:
    'Your first time a parent forwarded your report to another team',
  reaction_cross_team:
    'Your first time a parent on another team reacted to your work',
};

// Per-kind CTA destination. The card's primary button routes to the
// EXISTING publish surface for the artifact kind:
//  - clone / thank (drill-shaped) → the drills page (0064's publish
//    affordance lives there);
//  - parent_forward / parent_forward_cross_team / reaction_cross_team →
//    the parent-portal-shaped artifacts surface, which today is /plans
//    (where parent reports are generated).
//
// The route prose names these per-kind paths in the AC; the URLs below
// are the actual in-product surfaces those affordances live on today
// (read at pickup per LESSONS#0096).
const PUBLISH_HREF_BY_KIND: Record<FirstCrossCoachSignalKind, string> = {
  clone: '/drills',
  thank: '/drills',
  parent_forward: '/plans',
  parent_forward_cross_team: '/plans',
  reaction_cross_team: '/plans',
};

// Per-kind primary-button label. The artifact noun changes by kind so
// the CTA reads naturally — "Publish another drill" for the clone/thank
// kinds, "Send another report" for the parent-forward kinds.
const PUBLISH_LABEL_BY_KIND: Record<FirstCrossCoachSignalKind, string> = {
  clone: 'Publish another drill',
  thank: 'Publish another drill',
  parent_forward: 'Send another report',
  parent_forward_cross_team: 'Send another report',
  reaction_cross_team: 'Send another report',
};

/** Convert a UTC ISO timestamp + a now-in-ms into a short relative
 *  phrase. LESSONS#0115 — the parsed timestamp must be UTC-safe; the
 *  route emits ISO `Z`-suffixed strings so this parser is timezone-
 *  neutral.
 *
 *  Buckets:
 *   - within 6 hours → "this morning"
 *   - same calendar day → "today"
 *   - 1 day → "yesterday"
 *   - 2-6 days → "<weekday> afternoon" (defensive shape, never lands
 *     on a future weekday — only past days reach this branch)
 *   - 7+ days → "<N> days ago"
 */
function relativeDate(firedAt: string, nowMs: number): string {
  const fired = Date.parse(firedAt);
  if (!Number.isFinite(fired)) return 'recently';
  const elapsedMs = nowMs - fired;
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  if (elapsedMs < 0) return 'just now';
  if (elapsedMs <= 6 * HOUR) return 'this morning';
  if (elapsedMs < DAY) return 'today';
  if (elapsedMs < 2 * DAY) return 'yesterday';
  if (elapsedMs < 7 * DAY) {
    const weekday = new Date(fired).toLocaleString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    return `${weekday} afternoon`;
  }
  const days = Math.floor(elapsedMs / DAY);
  return `${days} days ago`;
}

export function FirstCrossCoachSignalCard({ signal, nowMs }: CardProps) {
  const [dismissed, setDismissed] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  if (!signal || dismissed) return null;

  const headline = HEADLINE_BY_KIND[signal.kind];
  const publishHref = PUBLISH_HREF_BY_KIND[signal.kind];
  const publishLabel = PUBLISH_LABEL_BY_KIND[signal.kind];
  const relative = relativeDate(signal.firedAt, nowMs ?? Date.now());

  // The body line is composed defensively: each segment renders only
  // when the underlying value is present (no invented program name or
  // sender name — LESSONS#0096 schema-wins-over-prose extends to
  // "render only what the helper returned").
  const senderName = signal.senderFirstName;
  const programName = signal.senderProgramName;
  const artifact = signal.artifactLabel;

  async function handleDismiss() {
    if (isDismissing) return;
    setIsDismissing(true);
    try {
      await fetch('/api/home/first-cross-coach-signal/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: signal!.kind, firedAt: signal!.firedAt }),
      });
    } catch {
      // Best-effort: never throw on the home screen. The card hides
      // locally regardless; the route is idempotent so a retry on the
      // next /home open is harmless.
    } finally {
      setDismissed(true);
      setIsDismissing(false);
    }
  }

  return (
    <div
      data-testid="first-cross-coach-signal-card"
      className="rounded-2xl border border-orange-500/30 bg-zinc-950 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-orange-500/15 p-2 shrink-0">
          <Sparkles className="h-4 w-4 text-orange-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{headline}</p>
          <p className="mt-1 text-sm text-zinc-400">
            {senderName ? `${senderName} ` : ''}
            {programName ? (
              <>in the <span className="text-zinc-200">{programName}</span> program </>
            ) : null}
            picked up <span className="text-zinc-200">{artifact}</span>{' '}
            {relative}.
          </p>
        </div>
      </div>
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <Link
          href={publishHref}
          data-testid="first-cross-coach-signal-card-publish"
          className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          {publishLabel}
        </Link>
        <button
          type="button"
          data-testid="first-cross-coach-signal-card-got-it"
          onClick={handleDismiss}
          disabled={isDismissing}
          className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
        >
          Got it
        </button>
      </div>
    </div>
  );
}

/** Container component that fetches the GET endpoint and renders the
 *  card. The /home page mounts THIS section at the top of the feed.
 *
 *  Per LESSONS#0065 / #0066 / #0162 — smallest possible touch on the
 *  home page: one import + one JSX entry. The fetch lives here, not
 *  in the page component. */
export function FirstCrossCoachSignalSection() {
  const queryClient = useQueryClient();
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Refresh the "now" reference once per render of the page — the
  // relative-date display drifts as the page lingers but never needs
  // a recurring interval (LESSONS#0027 — no set-controlled state in a
  // useEffect dep list; the empty deps make this a mount-only sample).
  useEffect(() => {
    setNowMs(Date.now());
  }, []);

  const { data } = useQuery({
    queryKey: ['first-cross-coach-signal'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<{ firstCrossCoachSignal: FirstCrossCoachSignal | null }> => {
      const res = await fetch('/api/home/first-cross-coach-signal');
      if (!res.ok) return { firstCrossCoachSignal: null };
      return (await res.json()) as { firstCrossCoachSignal: FirstCrossCoachSignal | null };
    },
  });

  const signal = data?.firstCrossCoachSignal ?? null;
  if (!signal) return null;

  // The dismiss happens inside the inner card; the query cache is
  // invalidated on the next /home open via the server-side dedup
  // table (the source of truth). We keep queryClient in scope only
  // so future refactors can wire a cache-bust without restructuring.
  void queryClient;

  return (
    <FirstCrossCoachSignalCard
      signal={signal}
      nowMs={nowMs}
      key={signal.firedAt + signal.kind}
    />
  );
}
