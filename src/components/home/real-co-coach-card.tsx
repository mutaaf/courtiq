'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';

// ─── Ticket 0092 — /home real-co-coach card ─────────────────────────────────
//
// Mounts under the daily-focus card and the 0088 first-cross-coach-signal
// card. Renders ONLY when the GET /api/coach/recurring-observers route
// returns `eligible: true` AND at least one qualifying helper has not been
// dismissed by the coach for that helper-team pair in the last 30 days.
//
// The card names the structural recurrence the coach has lived through
// without inviting: the same helper has shown up for them 2+ times across
// 2+ practices in the last 14 days. The card converts that lived
// relationship into a one-tap warm invite that carries the helper's first
// name through the share path.
//
// Voice posture (LESSONS#0023): this jsdoc instructs positively. Every
// rendered string speaks like a coach's clipboard. The component test
// scans the rendered text against the AGENTS.md banned set across every
// fixture variant.
//
// COPPA: never renders a surname (LESSONS#0061 — the literal-space split
// happens HERE; the route preserves the raw `displayName` and the
// component takes only the first token). Never renders a player name, a
// parent email, a raw helper_identifier string, or a jersey shape.
//
// Tier posture: NO new tier feature key. The card surfaces for free AND
// paid coaches alike — it is an ACQUISITION surface, not a feature gate.
// The "free until your next renewal" sub-line on the primary button ONLY
// renders for paid coaches in an active grace status (active / past_due /
// trialing); free coaches and canceled coaches see the primary button
// without that sub-line.
//
// LESSONS#0029 / #0082 — `data-testid` scoping on the card AND on each
// rendered helper row so the seeded e2e can anchor assertions without
// strict-mode-colliding on substrings the seed itself uses.

type Tier = 'free' | 'coach' | 'pro_coach' | 'organization';

const PAID_TIERS = new Set<Tier>(['coach', 'pro_coach', 'organization']);
const PAID_GRACE_STATUSES = new Set(['active', 'past_due', 'trialing']);

const MAX_HELPERS_RENDERED = 3;

export interface RealCoCoachHelperPayload {
  helperIdentifier: string;
  displayName: string | null;
  openCount: number;
  distinctPracticeCount: number;
  ranDrill: boolean;
  lastOpenAt: string;
  teamId: string;
  teamName: string;
}

export interface RealCoCoachCardProps {
  eligible: boolean;
  helpers: RealCoCoachHelperPayload[];
  tier: Tier;
  subscriptionStatus: string | null;
  /** Caller's deterministic referral code, threaded into the share text
   *  when the primary button fires. Optional — when absent, the share
   *  text omits the referral URL gracefully. */
  referralCode?: string;
}

/** Take the first literal-space-separated token of a display name. The
 *  literal space (NEVER `\s+`) is the load-bearing posture per
 *  LESSONS#0061 — `\s+` walks past newlines on labelled payloads. */
function firstNameOf(displayName: string | null): string | null {
  if (!displayName) return null;
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  const [first] = trimmed.split(' ');
  return first || null;
}

/** Render text for the per-helper line. Composed defensively so the
 *  "ran a drill" sub-line only appears when the structural counter
 *  earned it; silence on the unearned counter beats a confident lie. */
function buildHelperLine(h: RealCoCoachHelperPayload, firstName: string | null): string {
  const subject = firstName ?? 'They';
  const helperLine = `${subject} opened your ${h.teamName} observer link ${h.openCount} times across the last 14 days`;
  return helperLine;
}

/** Render the share text the primary button forwards through
 *  `navigator.share` / clipboard. Carries the helper's first name and
 *  the team name so the recipient (Aisha) sees the named context the
 *  card carried for the coach (Marco). The referral URL is appended
 *  when the caller has a referralCode. */
function buildShareText(
  h: RealCoCoachHelperPayload,
  firstName: string | null,
  referralCode?: string,
): string {
  const subject = firstName ?? 'You';
  const ranLine = h.ranDrill
    ? ` and ran a drill on a recent practice`
    : '';
  const refLine = referralCode
    ? `\n\nhttps://sportsiq.app/signup?ref=${encodeURIComponent(referralCode)}`
    : '';
  return (
    `${subject} — you've been helping with ${h.teamName} ` +
    `(${h.openCount} opens across the last 14 days${ranLine}). ` +
    `Want to coach alongside me on SportsIQ?${refLine}`
  );
}

export function RealCoCoachCard({
  eligible,
  helpers,
  tier,
  subscriptionStatus,
  referralCode,
}: RealCoCoachCardProps) {
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  if (!eligible) return null;
  if (!helpers || helpers.length === 0) return null;

  const visible = helpers
    .filter((h) => !dismissedIds.has(`${h.helperIdentifier}::${h.teamId}`))
    .slice(0, MAX_HELPERS_RENDERED);
  if (visible.length === 0) return null;

  const showFreeRenewalSubline =
    PAID_TIERS.has(tier) &&
    subscriptionStatus !== null &&
    PAID_GRACE_STATUSES.has(subscriptionStatus);

  async function handlePrimary(h: RealCoCoachHelperPayload) {
    const firstName = firstNameOf(h.displayName);
    const text = buildShareText(h, firstName, referralCode);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to clipboard
      }
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        // best-effort — never throw on /home
      }
    }
  }

  async function handleDismiss(h: RealCoCoachHelperPayload) {
    const key = `${h.helperIdentifier}::${h.teamId}`;
    setDismissingId(key);
    try {
      await fetch('/api/coach/recurring-observers/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          helperIdentifier: h.helperIdentifier,
          teamId: h.teamId,
        }),
      });
    } catch {
      // best-effort — the row hides locally regardless; the route is
      // idempotent so a retry on the next /home open is harmless.
    } finally {
      setDismissedIds((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
      setDismissingId(null);
    }
  }

  // Headline names the lead helper when present; falls back to "Someone"
  // when display_name is null (the helper used the link without a name).
  const lead = visible[0];
  const leadFirstName = firstNameOf(lead.displayName);
  const headline = leadFirstName
    ? `${leadFirstName}'s been co-coaching with you`
    : `Someone's been co-coaching with you`;

  return (
    <div
      data-testid="real-co-coach-card"
      className="rounded-2xl border border-zinc-500/40 bg-zinc-950 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-orange-500/15 p-2 shrink-0">
          <Users className="h-4 w-4 text-orange-500" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{headline}</p>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {visible.map((h) => {
          const firstName = firstNameOf(h.displayName);
          const subject = firstName ?? 'Someone';
          const rowKey = `${h.helperIdentifier}::${h.teamId}`;
          const isDismissing = dismissingId === rowKey;
          return (
            <div
              key={rowKey}
              data-testid="real-co-coach-card-row"
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <p className="text-sm text-zinc-300">
                {buildHelperLine(h, firstName)}.
              </p>
              {h.ranDrill ? (
                <p className="mt-1 text-sm text-zinc-400">
                  And ran a drill on a recent practice.
                </p>
              ) : null}
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  data-testid="real-co-coach-card-primary"
                  onClick={() => handlePrimary(h)}
                  className="inline-flex items-center justify-center rounded-lg bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
                >
                  {firstName
                    ? `Bring ${firstName} on as a Coach-tier teammate`
                    : `Bring them on as a Coach-tier teammate`}
                </button>
                <button
                  type="button"
                  data-testid="real-co-coach-card-dismiss"
                  onClick={() => handleDismiss(h)}
                  disabled={isDismissing}
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                >
                  Not yet
                </button>
              </div>
              {showFreeRenewalSubline ? (
                <p
                  className="mt-2 text-xs text-zinc-500"
                  data-testid="real-co-coach-card-renewal-line"
                >
                  Free until your next renewal.
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Container component ────────────────────────────────────────────────────
//
// Fetches the GET endpoint and renders the card. The /home page mounts
// THIS section under the daily-focus card and the 0088 first-cross-
// coach-signal card per LESSONS#0065 / #0066 / #0162 — smallest possible
// touch on the home surface (one import + one JSX entry).

interface RecurringObserversPayload {
  eligible: boolean;
  helpers?: RealCoCoachHelperPayload[];
}

export interface RealCoCoachSectionProps {
  tier: Tier;
  subscriptionStatus: string | null;
  referralCode?: string;
}

export function RealCoCoachSection({
  tier,
  subscriptionStatus,
  referralCode,
}: RealCoCoachSectionProps) {
  const [mountedAt, setMountedAt] = useState<number>(() => Date.now());

  // Refresh the "mounted at" reference once per page render (LESSONS#0027
  // — no setState-controlled deps; the empty deps make this a mount-only
  // sample so the relative-date drift never re-fires the effect).
  useEffect(() => {
    setMountedAt(Date.now());
  }, []);
  void mountedAt;

  const { data } = useQuery({
    queryKey: ['recurring-observers'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<RecurringObserversPayload> => {
      try {
        const res = await fetch('/api/coach/recurring-observers');
        if (!res.ok) return { eligible: false };
        return (await res.json()) as RecurringObserversPayload;
      } catch {
        return { eligible: false };
      }
    },
  });

  if (!data || !data.eligible) return null;
  const helpers = data.helpers ?? [];
  if (helpers.length === 0) return null;

  return (
    <RealCoCoachCard
      eligible={true}
      helpers={helpers}
      tier={tier}
      subscriptionStatus={subscriptionStatus}
      referralCode={referralCode}
    />
  );
}
