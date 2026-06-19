'use client';

/**
 * Ticket 0090 — the program-drill-canon card on the /admin (director)
 * surface. Renders ONLY when the route's `eligible: true` payload is
 * present (silence beats nag). Sits UNDER the existing 0087
 * `<ProgramOrgTierCard />` on the director's home page.
 *
 * Voice posture (LESSONS#0023): the headline + body lines are
 * instructed positively. No AGENTS.md banned token appears in any
 * rendered fixture variant.
 *
 * Aesthetic: matches the existing 0028 / 0071 / 0073 director-surface
 * card posture — quiet orange accent (#F97316) on zinc-950 dark theme,
 * 44px touch targets, mobile-first.
 *
 * Identified by `data-testid="program-drill-canon-card"` per
 * LESSONS#0029 / LESSONS#0082 — every assertion (component test + e2e)
 * scopes by this id to dodge strict-mode collisions with sibling cards.
 *
 * The publish + editor affordances also carry stable data-testids
 * (`program-drill-canon-publish`, `program-drill-canon-edit-toggle`,
 * `program-drill-canon-editor`, `program-drill-canon-checkbox-<id>`)
 * so the spec can drive without depending on text content.
 */
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Library, ChevronRight, BookmarkPlus } from 'lucide-react';

/** One drill in the eligible canon — mirrors the helper's
 *  ProgramDrillCanonEntry shape exactly. */
export interface ProgramDrillCanonCardDrill {
  drillId: string;
  drillName: string;
  coachCount: number;
  coachFirstNames: string[];
  sport_id: string;
  age_groups: string[];
}

export interface ProgramDrillCanonCardPayload {
  eligible: true;
  drills: ProgramDrillCanonCardDrill[];
  totalCoachesInProgram: number;
  orgName: string;
  currentCanon?: {
    canonId: string;
    drillIds: string[];
    publishedAt: string;
  };
}

export type ProgramDrillCanonCardIneligible = {
  eligible: false;
  eligibilityReason?: string;
};

export interface ProgramDrillCanonCardProps {
  payload: ProgramDrillCanonCardPayload | ProgramDrillCanonCardIneligible | null | undefined;
  /** Invoked when the director taps "Publish". The parent container
   *  POSTs the publish route. The handler receives the SELECTED
   *  drillIds (after any editor unchecks). */
  onPublish: (drillIds: string[]) => void | Promise<void>;
}

/** Oxford-comma join (mirrors 0085 / 0087 posture). */
function oxfordCommaJoin(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  const head = names.slice(0, -1).join(', ');
  const tail = names[names.length - 1];
  return `${head}, and ${tail}`;
}

export function ProgramDrillCanonCard({ payload, onPublish }: ProgramDrillCanonCardProps) {
  // Silence beats nag — loading / failed / ineligible → render nothing.
  const isEligible = !!payload && payload.eligible === true;
  const eligible = isEligible ? (payload as ProgramDrillCanonCardPayload) : null;

  const initialSelection = useMemo(() => {
    if (!eligible) return new Set<string>();
    return new Set(eligible.drills.map((d) => d.drillId));
  }, [eligible]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(initialSelection);
  const [submitting, setSubmitting] = useState(false);

  if (!eligible) return null;

  const alreadyPublished = !!eligible.currentCanon;
  const drills = eligible.drills;

  function toggleDrill(drillId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(drillId)) {
        next.delete(drillId);
      } else {
        next.add(drillId);
      }
      return next;
    });
  }

  async function handlePublish() {
    if (submitting) return;
    setSubmitting(true);
    try {
      // Preserve input order so the publish payload is deterministic.
      const drillIds = drills
        .map((d) => d.drillId)
        .filter((id) => selected.has(id));
      await onPublish(drillIds);
    } finally {
      setSubmitting(false);
    }
  }

  if (alreadyPublished) {
    const publishedCount = eligible.currentCanon!.drillIds.length;
    return (
      <div
        data-testid="program-drill-canon-card"
        className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
            <Library className="h-4 w-4 text-orange-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
              Your program&apos;s drill canon
            </p>
            <p className="text-sm font-semibold text-zinc-100 leading-snug">
              Published — {publishedCount} {publishedCount === 1 ? 'drill' : 'drills'} in your canon.
            </p>
            <p className="mt-2 text-xs text-zinc-400 leading-snug">
              Every new coach who joins {eligible.orgName} now inherits these on day one.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="program-drill-canon-card"
      className="rounded-2xl border border-orange-500/25 bg-orange-500/5 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
          <Library className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-500 mb-0.5">
            Your program&apos;s drill canon has emerged
          </p>
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            {drills.length} {drills.length === 1 ? 'drill' : 'drills'} your coaches have thumbed up across teams.
          </p>

          <ul className="mt-3 space-y-1.5">
            {drills.map((drill) => (
              <li
                key={drill.drillId}
                className="flex items-start gap-2 text-xs text-zinc-300 leading-snug"
              >
                <BookmarkPlus className="mt-0.5 h-3 w-3 shrink-0 text-orange-400" />
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-zinc-100">{drill.drillName}</span>
                  <span className="text-zinc-400">
                    {' — '}
                    {drill.coachCount} {drill.coachCount === 1 ? 'coach' : 'coaches'}
                    {drill.coachFirstNames.length > 0 && (
                      <>
                        {' ('}
                        {oxfordCommaJoin(drill.coachFirstNames)}
                        {')'}
                      </>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>

          {editorOpen && (
            <div
              data-testid="program-drill-canon-editor"
              className="mt-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400 mb-2">
                Uncheck any drill you don&apos;t want in the canon
              </p>
              <ul className="space-y-1.5">
                {drills.map((drill) => (
                  <li key={drill.drillId} className="flex items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      data-testid={`program-drill-canon-checkbox-${drill.drillId}`}
                      checked={selected.has(drill.drillId)}
                      onChange={() => toggleDrill(drill.drillId)}
                      className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"
                    />
                    <span className="text-zinc-200">{drill.drillName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-testid="program-drill-canon-publish"
              onClick={handlePublish}
              disabled={submitting || selected.size === 0}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-orange-500/25 bg-orange-500/15 px-3 py-3 text-xs font-medium text-orange-300 hover:bg-orange-500/25 transition-colors touch-manipulation active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Publish as {eligible.orgName} drill canon
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              data-testid="program-drill-canon-edit-toggle"
              onClick={() => setEditorOpen((prev) => !prev)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/40 px-3 py-3 text-xs font-medium text-zinc-300 hover:bg-zinc-800/60 transition-colors touch-manipulation active:scale-[0.97]"
            >
              {editorOpen ? 'Done editing' : 'Edit before publishing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The thin container the admin / director page mounts. Fetches the
 * canon payload from the dedicated GET route and wires the publish
 * POST. Mirrors `<ProgramOrgTierCardSection />` (0087): best-effort
 * `useQuery` + local state for the published-state hand-off.
 *
 * No tier-gate wrapper here — the route ALSO server-gates on
 * `tier === 'organization'` AND a paid-grace subscription_status, and
 * the card short-circuits to null for `eligible: false`. Defense in
 * depth (server gate + client gate; AGENTS.md rule 5).
 */
export function ProgramDrillCanonCardSection({
  orgId,
  isAdmin,
}: {
  orgId: string | null | undefined;
  isAdmin: boolean;
}) {
  const [justPublished, setJustPublished] = useState<{
    canonId: string;
    drillIds: string[];
    publishedAt: string;
  } | null>(null);

  const { data, refetch } = useQuery({
    queryKey: ['program-drill-canon', orgId],
    enabled: !!orgId && isAdmin,
    staleTime: 15 * 60 * 1000,
    retry: false,
    queryFn: async (): Promise<ProgramDrillCanonCardPayload | ProgramDrillCanonCardIneligible | null> => {
      const res = await fetch(`/api/admin/program-drill-canon?orgId=${encodeURIComponent(orgId!)}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json as ProgramDrillCanonCardPayload | ProgramDrillCanonCardIneligible;
    },
  });

  async function handlePublish(drillIds: string[]) {
    if (!orgId) return;
    try {
      const res = await fetch('/api/admin/program-drill-canon/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, drillIds }),
      });
      if (res.ok) {
        const json = await res.json();
        setJustPublished({
          canonId: json.canonId,
          drillIds: json.drillIds,
          publishedAt: json.publishedAt,
        });
        // Refetch so the card transforms to the published variant.
        await refetch();
      }
    } catch {
      // Best-effort — the next page load picks up the published state.
    }
  }

  if (!isAdmin) return null;

  // If we just published in this session AND the refetch hasn't landed
  // yet, optimistically render the published variant so the director
  // sees the transformation immediately.
  if (justPublished && data && data.eligible === true && !data.currentCanon) {
    return (
      <ProgramDrillCanonCard
        payload={{ ...data, currentCanon: justPublished }}
        onPublish={handlePublish}
      />
    );
  }

  return <ProgramDrillCanonCard payload={data} onPublish={handlePublish} />;
}
