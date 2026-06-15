'use client';

// Ticket 0083 — program-scoped Practice Arc memory hint.
//
// Quiet zinc-500 line above the empty Practice Arc card on the plans
// surface. When the caller's arc is empty AND the program's prior-season
// coverage is sufficient, render one line summarising the program's last
// year arc shape ("Last year's U10 Hawks spent weeks 2-4 on closeouts
// and weeks 5-7 on transitions; that arc carried for them") + one
// orange-pill button "Use this as my starting arc" that POSTs the adopt
// endpoint and fires `onAdopted` so the parent surface refetches.
//
// Strict contract:
//   - Render NOTHING when arcIsEmpty is false OR coverage !== 'sufficient'.
//   - The summary line uses the deterministic composeProgramArcSummary
//     helper — never AI-generated.
//   - The component reads no DB; it's a pure presenter the parent
//     surface drives with the GET /api/program/arc-history payload.
//
// Voice (AGENTS.md): clipboard tone. No banned words. The summary
// composer has its own banned-word matrix scan (LESSONS#0023). Defensive
// scans elsewhere use literal spaces per LESSONS#0061.

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { composeProgramArcSummary } from '@/lib/program-arc-summary';

export interface ProgramArcHistoryData {
  coverage: 'sufficient' | 'thin';
  weeks: Array<{
    week_index: number;
    top_skills: string[];
    team_count: number;
    practice_count: number;
  }>;
  programName: string | null;
  ageGroup: string;
}

export interface ProgramArcHistoryHintProps {
  arcIsEmpty: boolean;
  data: ProgramArcHistoryData | null;
  teamId: string;
  orgId: string;
  ageGroup: string;
  sportId: string;
  /** Called when the adopt POST returns 200 so the parent can refetch
   *  the plans list and the surface flips out of the empty state. */
  onAdopted: () => void;
}

export function ProgramArcHistoryHint(props: ProgramArcHistoryHintProps) {
  const {
    arcIsEmpty,
    data,
    teamId,
    orgId,
    ageGroup,
    sportId,
    onAdopted,
  } = props;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per LESSONS#0027 — the visibility check reads arcIsEmpty + coverage
  // as a SNAPSHOT; never put a set-controlled state value into deps.
  // Here the gate is a synchronous prop read, not an effect, so we just
  // return null early.
  if (!arcIsEmpty) return null;
  if (!data || data.coverage !== 'sufficient') return null;
  if (!data.programName) return null;
  if (!Array.isArray(data.weeks) || data.weeks.length === 0) return null;

  const summary = composeProgramArcSummary(data.weeks, {
    programName: data.programName,
    ageGroup: data.ageGroup || ageGroup,
  });
  if (!summary) return null;

  async function handleAdopt() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/program/arc-history/adopt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ teamId, orgId, ageGroup, sportId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // The 409 case ("arc_already_populated") is what the parent's
        // next refetch will resolve anyway — surface a quiet note.
        setError(body?.error === 'arc_already_populated'
          ? 'Your arc already has data — refresh the plans page.'
          : 'Could not seed the arc — try again.');
        return;
      }
      onAdopted();
    } catch {
      setError('Could not seed the arc — try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      data-testid="program-arc-history-hint"
      className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-3 space-y-2"
    >
      <div className="flex items-start gap-2">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
        <p
          data-testid="program-arc-history-summary"
          className="text-xs leading-snug text-zinc-500"
        >
          {summary}
        </p>
      </div>
      <button
        data-testid="program-arc-history-adopt"
        type="button"
        onClick={handleAdopt}
        disabled={submitting}
        className="inline-flex items-center gap-1.5 rounded-full bg-orange-500/20 border border-orange-500/40 px-3 py-1 text-xs font-medium text-orange-300 hover:bg-orange-500/30 transition-colors disabled:opacity-50 touch-manipulation"
      >
        {submitting ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            Seeding…
          </>
        ) : (
          'Use this as my starting arc'
        )}
      </button>
      {error && (
        <p className="text-xs text-zinc-500" data-testid="program-arc-history-error">
          {error}
        </p>
      )}
    </div>
  );
}
