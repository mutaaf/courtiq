/**
 * Ticket 0037 — the pure coaching-signature builder.
 *
 * `buildCoachingSignature(plans)` derives a compact, prompt-safe summary of how a
 * coach actually runs practice across ALL their teams, from the coach's OWN
 * persisted `plans` rows: their most-frequent `skills_targeted`, the
 * recurring drill names pulled from `content_structured` (practice plans AND
 * practice arcs), and a typical session length. It returns `null` for a
 * cold-start coach with too few plans, and bounds every list so the block stays
 * small enough to thread into a prompt.
 *
 * The helper touches ONLY `plans`-derived fields — never a `players` row, never
 * per-child observation text — so the signature can carry no minor data (COPPA /
 * data minimization).
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the Playwright spec glob (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import {
  buildCoachingSignature,
  MIN_PLANS_FOR_SIGNATURE,
  MAX_SIGNATURE_SKILLS,
  MAX_SIGNATURE_DRILLS,
  // Ticket 0070 — bounds for the new voice_anchors enrichment.
  MAX_SIGNATURE_VOICE_ANCHORS,
  MIN_VOICE_ANCHOR_RECURRENCE,
  type CoachPlanRow,
} from '@/lib/coaching-signature-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A practice plan row: drill names live under content_structured.warmup + drills[]. */
function practicePlan(
  skills: string[],
  drillNames: string[],
  durationMinutes: number,
  warmupName?: string,
): CoachPlanRow {
  return {
    type: 'practice',
    skills_targeted: skills,
    content_structured: {
      title: 'Practice',
      duration_minutes: durationMinutes,
      warmup: warmupName ? { name: warmupName, duration_minutes: 5, description: 'x' } : undefined,
      drills: drillNames.map((name) => ({ name, duration_minutes: 10, description: 'y' })),
    },
  };
}

/** A practice-arc row: drill names live under content_structured.sessions[].drills[]. */
function practiceArc(skills: string[], drillNames: string[], sessionMinutes: number): CoachPlanRow {
  return {
    type: 'practice_arc',
    skills_targeted: skills,
    content_structured: {
      arc_title: 'Arc',
      primary_focus: skills,
      sessions: [
        {
          session_number: 1,
          duration_minutes: sessionMinutes,
          warmup: { name: 'Arc warmup', duration_minutes: 5, description: 'z' },
          drills: drillNames.map((name) => ({ name, duration_minutes: 10, description: 'w' })),
        },
      ],
    },
  };
}

// ─── AC1: many plans → ranked summary ────────────────────────────────────────

describe('buildCoachingSignature — ranked summary from a coach with history', () => {
  it('ranks the most frequent skills_targeted across all the coach plans', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense', 'Passing'], ['Closeout Drill'], 60),
      practicePlan(['Defense', 'Spacing'], ['Shell Drill'], 60),
      practicePlan(['Defense'], ['Closeout Drill'], 60),
      practicePlan(['Passing'], ['Monkey in the Middle'], 60),
      practicePlan(['Spacing'], ['5-Out Motion'], 60),
    ];

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // Defense (3) is the clear leader, then Passing (2) and Spacing (2).
    expect(sig!.top_skills[0]).toBe('Defense');
    expect(sig!.top_skills).toContain('Passing');
    expect(sig!.top_skills).toContain('Spacing');
  });

  it('extracts recurring drill names from content_structured, ranked by recurrence', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense'], ['Closeout Drill', 'Shell Drill'], 60, 'Dynamic Warmup'),
      practicePlan(['Defense'], ['Closeout Drill'], 60, 'Dynamic Warmup'),
      practicePlan(['Passing'], ['Closeout Drill', 'Monkey in the Middle'], 60),
      practiceArc(['Spacing'], ['Shell Drill', '5-Out Motion'], 60),
      practicePlan(['Effort'], ['Suicides'], 60),
    ];

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // "Closeout Drill" recurs the most (3 plans) → first.
    expect(sig!.recurring_drills[0]).toBe('Closeout Drill');
    // A drill that only appears in a practice ARC is still picked up.
    expect(sig!.recurring_drills).toContain('Shell Drill');
  });

  it('derives a typical session length from the plans (representative, not the max outlier)', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense'], ['A'], 60),
      practicePlan(['Defense'], ['B'], 60),
      practicePlan(['Passing'], ['C'], 60),
      practicePlan(['Spacing'], ['D'], 90),
      practicePlan(['Effort'], ['E'], 45),
    ];

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // 60 is the most common session length → it is the typical one (not 90).
    expect(sig!.typical_session_minutes).toBe(60);
  });
});

// ─── AC1: <N plans → null (cold start) ───────────────────────────────────────

describe('buildCoachingSignature — cold-start coach returns null', () => {
  it('returns null when the coach has fewer than the minimum number of plans', () => {
    const tooFew = Array.from({ length: MIN_PLANS_FOR_SIGNATURE - 1 }, () =>
      practicePlan(['Defense'], ['Closeout Drill'], 60),
    );
    expect(buildCoachingSignature(tooFew)).toBeNull();
  });

  it('returns null for an empty plan list', () => {
    expect(buildCoachingSignature([])).toBeNull();
  });

  it('returns null when there are enough rows but none carry usable plan signal', () => {
    // Enough rows, but no skills and no drills to rank → no honest signature.
    const empty: CoachPlanRow[] = Array.from({ length: MIN_PLANS_FOR_SIGNATURE + 2 }, () => ({
      type: 'practice',
      skills_targeted: [],
      content_structured: null,
    }));
    expect(buildCoachingSignature(empty)).toBeNull();
  });
});

// ─── AC1: bounded length ─────────────────────────────────────────────────────

describe('buildCoachingSignature — bounded, prompt-safe size', () => {
  it('caps top_skills and recurring_drills to a small bound', () => {
    const manySkills = Array.from({ length: 20 }, (_, i) => `Skill${i}`);
    const manyDrills = Array.from({ length: 20 }, (_, i) => `Drill${i}`);
    // Repeat each plan so every skill/drill recurs (rank is stable) and we clear N.
    const plans: CoachPlanRow[] = [];
    for (let r = 0; r < 3; r++) {
      manySkills.forEach((s, i) => plans.push(practicePlan([s], [manyDrills[i]], 60)));
    }

    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    expect(sig!.top_skills.length).toBeLessThanOrEqual(MAX_SIGNATURE_SKILLS);
    expect(sig!.recurring_drills.length).toBeLessThanOrEqual(MAX_SIGNATURE_DRILLS);
  });
});

// ─── AC7: COPPA — only coach-plan-derived aggregates, no minor data ───────────

describe('buildCoachingSignature — COPPA / data minimization', () => {
  it('the signature object has only coach-plan-derived aggregate keys', () => {
    const plans: CoachPlanRow[] = [
      practicePlan(['Defense'], ['Closeout Drill'], 60),
      practicePlan(['Defense'], ['Shell Drill'], 60),
      practicePlan(['Passing'], ['Monkey in the Middle'], 60),
      practicePlan(['Spacing'], ['5-Out Motion'], 60),
      practicePlan(['Effort'], ['Suicides'], 60),
    ];

    const sig = buildCoachingSignature(plans)!;
    // Ticket 0070 widened the signature with the OPTIONAL voice_anchors key
    // (LESSONS#0103 optional widening). The new key carries only the coach's
    // OWN prior parent-report phrasings; the COPPA contract is unchanged —
    // the COPPA-leak assertions below still apply byte-identically.
    expect(Object.keys(sig).sort()).toEqual(
      ['recurring_drills', 'top_skills', 'typical_session_minutes', 'voice_anchors'].sort(),
    );
  });

  it('never surfaces player names or observation text even if a plan row carries them', () => {
    // A maliciously-shaped plan row carrying minor data must NOT leak it into the
    // signature — the builder only reads skills_targeted + drill/warmup names.
    const poisoned: CoachPlanRow[] = Array.from({ length: 6 }, () => ({
      type: 'practice',
      skills_targeted: ['Defense'],
      content_structured: {
        // Real plan fields the builder uses:
        drills: [{ name: 'Closeout Drill', duration_minutes: 10, description: 'x' }],
        duration_minutes: 60,
        // Minor data that must never appear in the output:
        player_name: 'Maya Johnson',
        players: [{ name: 'Maya Johnson', date_of_birth: '2013-04-01' }],
        observations: [{ text: 'Maya struggled with closeouts', player_name: 'Maya Johnson' }],
      },
    }));

    const sig = buildCoachingSignature(poisoned)!;
    const serialized = JSON.stringify(sig);
    expect(serialized).not.toContain('Maya Johnson');
    expect(serialized).not.toContain('date_of_birth');
    expect(serialized).not.toContain('observations');
    expect(serialized).not.toContain('player_name');
    // It still produced the legitimate drill-derived signal.
    expect(sig.recurring_drills).toContain('Closeout Drill');
  });
});

// ─── Ticket 0070 — voice_anchors enrichment from prior parent reports ──────────
//
// The 0037 signature is the plan-side primitive. Ticket 0070 extends the SAME
// builder with an OPTIONAL second source: the coach's OWN prior parent_report
// plan rows. The builder walks each report's `content_structured.highlights[]`
// and `content_structured.coach_note`, extracts 8–80 char phrases the coach has
// used more than once, ranks by recurrence, caps at MAX_SIGNATURE_VOICE_ANCHORS,
// and surfaces them on the signature as `voice_anchors: string[]`. When the
// coach has fewer than 3 prior reports, voice_anchors is []; the prompt branch
// keys off `.length > 0` and falls back to the post-0066 byte-identical body.
//
// Per LESSONS#0103 — declare the field OPTIONAL on the `CoachingSignature` type
// so every existing call site (the 0037 practicePlan / practiceArc / pregame /
// newsletter / pulse routes) stays byte-identical without a sweep.
//
// Per LESSONS#0061 — the surname guard uses a literal SPACE, not `\s+`, so a
// labelled-key newline ("Maya\nAge group:") can't false-positive.
//
// Per LESSONS#0023 — banned tokens (journey / amazing / exciting / elevate /
// empower / synergy / unlock your potential) are filtered DURING extraction,
// so the prompt block can be instructed positively without re-listing them.
//
// Per LESSONS#0034 — `--`-comment lines are stripped from any scanned content
// before phrase extraction, so a documentation comment in a coach's note never
// trips the helper.

/** A prior parent-report plan row in the shape the builder consumes. */
function parentReportPlan(highlights: string[], coachNote?: string): CoachPlanRow {
  return {
    type: 'parent_report',
    skills_targeted: null,
    content_structured: {
      player_name: 'Maya',
      highlights,
      coach_note: coachNote ?? '',
    },
  };
}

/** Enough practice-plan rows to clear MIN_PLANS_FOR_SIGNATURE so the helper returns a signature. */
function basePlans(): CoachPlanRow[] {
  return Array.from({ length: MIN_PLANS_FOR_SIGNATURE }, () => ({
    type: 'practice',
    skills_targeted: ['Defense'],
    content_structured: {
      drills: [{ name: 'Closeout Drill', duration_minutes: 10 }],
      duration_minutes: 60,
    },
  }));
}

describe('buildCoachingSignature — voice_anchors from prior parent reports (ticket 0070)', () => {
  it('exports MAX_SIGNATURE_VOICE_ANCHORS = 6 and MIN_VOICE_ANCHOR_RECURRENCE = 2', () => {
    // Mirrors the 0037 MAX_SIGNATURE_DRILLS = 6 / MIN_DRILL_RECURRENCE = 2 bounds.
    expect(MAX_SIGNATURE_VOICE_ANCHORS).toBe(6);
    expect(MIN_VOICE_ANCHOR_RECURRENCE).toBe(2);
  });

  it('returns voice_anchors: [] when the coach has zero prior parent reports', () => {
    const sig = buildCoachingSignature(basePlans(), { priorParentReports: [] });
    expect(sig).not.toBeNull();
    expect(sig!.voice_anchors).toEqual([]);
  });

  it('returns voice_anchors: [] when the coach has fewer than 3 prior parent reports (cold-start cap)', () => {
    const priorParentReports: CoachPlanRow[] = [
      parentReportPlan(['playing with her hands ready']),
      parentReportPlan(['playing with her hands ready']),
    ];
    const sig = buildCoachingSignature(basePlans(), { priorParentReports });
    expect(sig).not.toBeNull();
    // Two reports is below the cold-start threshold of 3 — no voice signal yet.
    expect(sig!.voice_anchors).toEqual([]);
  });

  it('extracts and ranks the top voice_anchors by recurrence across reports', () => {
    // "playing with her hands ready" appears in 3 reports; "hearing the call before the ball comes"
    // appears in 2; "she finished left" appears once (below MIN, dropped).
    const priorParentReports: CoachPlanRow[] = [
      parentReportPlan(['playing with her hands ready', 'hearing the call before the ball comes']),
      parentReportPlan(['playing with her hands ready']),
      parentReportPlan(['playing with her hands ready', 'hearing the call before the ball comes']),
      parentReportPlan(['she finished left']),
      parentReportPlan(['totally different observation']),
    ];
    const sig = buildCoachingSignature(basePlans(), { priorParentReports });
    expect(sig).not.toBeNull();
    expect(sig!.voice_anchors![0]).toBe('playing with her hands ready');
    expect(sig!.voice_anchors).toContain('hearing the call before the ball comes');
    // Below-MIN phrase is filtered.
    expect(sig!.voice_anchors).not.toContain('she finished left');
    expect(sig!.voice_anchors).not.toContain('totally different observation');
  });

  it('strips surname-shape from a phrase using a literal space (LESSONS#0061)', () => {
    // "Maya Walker is finding the ball" should become "is finding the ball" (Walker
    // is the FirstName-then-Capitalized surname shape stripped from the LEFT). The
    // guard uses a LITERAL SPACE — a label-newline like "Maya\nAge" must never trip.
    // Reports use the same phrase multiple times so it clears MIN_VOICE_ANCHOR_RECURRENCE.
    const priorParentReports: CoachPlanRow[] = [
      parentReportPlan(['Maya Walker is finding the ball']),
      parentReportPlan(['Maya Walker is finding the ball']),
      parentReportPlan(['Maya Walker is finding the ball']),
    ];
    const sig = buildCoachingSignature(basePlans(), { priorParentReports });
    expect(sig).not.toBeNull();
    // The surname-stripped form is what surfaces. First names alone are kept (the
    // phrase loses meaning without them) — but the FirstName SPACE LastName pair
    // is replaced by just the first name.
    const serialized = JSON.stringify(sig!.voice_anchors);
    expect(serialized).not.toContain('Walker');
    // The remainder of the phrase is preserved.
    expect(serialized).toContain('is finding the ball');
  });

  it('filters phrases containing AGENTS.md banned tokens during extraction (LESSONS#0023)', () => {
    // "the kids are on an amazing journey" carries TWO banned tokens — the
    // pre-filter drops the whole phrase so the prompt block never enumerates them.
    const priorParentReports: CoachPlanRow[] = [
      parentReportPlan(['the kids are on an amazing journey']),
      parentReportPlan(['the kids are on an amazing journey']),
      parentReportPlan(['the kids are on an amazing journey']),
      parentReportPlan(['playing with her hands ready']),
      parentReportPlan(['playing with her hands ready']),
      parentReportPlan(['playing with her hands ready']),
    ];
    const sig = buildCoachingSignature(basePlans(), { priorParentReports });
    expect(sig).not.toBeNull();
    const serialized = JSON.stringify(sig!.voice_anchors).toLowerCase();
    for (const banned of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
      'unlock your potential',
    ]) {
      expect(serialized).not.toContain(banned);
    }
    // The clean phrase still surfaces.
    expect(sig!.voice_anchors).toContain('playing with her hands ready');
  });

  it('strips `--` comment lines from coach_note before extraction (LESSONS#0034)', () => {
    // A coach_note containing a documentation-style `--` line should not surface as
    // an anchor; only the natural-language portion is scanned.
    const noteWithComment = [
      '-- internal documentation: this carries no minor data',
      'playing with her hands ready',
      'and the rest of the note.',
    ].join('\n');
    const priorParentReports: CoachPlanRow[] = [
      parentReportPlan([], noteWithComment),
      parentReportPlan([], noteWithComment),
      parentReportPlan([], noteWithComment),
    ];
    const sig = buildCoachingSignature(basePlans(), { priorParentReports });
    expect(sig).not.toBeNull();
    const serialized = JSON.stringify(sig!.voice_anchors);
    expect(serialized).not.toContain('internal documentation');
  });

  it('byte-identity guard: the existing top_skills + recurring_drills + typical_session_minutes outputs do NOT change when priorParentReports is provided', () => {
    // The widening must be ADDITIVE — the original output keys for the same input
    // remain byte-identical when the new optional argument is passed (LESSONS#0103).
    const plans = basePlans();
    const baseline = buildCoachingSignature(plans);
    const widened = buildCoachingSignature(plans, { priorParentReports: [] });
    expect(baseline).not.toBeNull();
    expect(widened).not.toBeNull();
    expect(widened!.top_skills).toEqual(baseline!.top_skills);
    expect(widened!.recurring_drills).toEqual(baseline!.recurring_drills);
    expect(widened!.typical_session_minutes).toEqual(baseline!.typical_session_minutes);
  });

  it('byte-identity guard: a call WITHOUT priorParentReports returns voice_anchors: [] (absent-input branch, LESSONS#0103)', () => {
    // The widening keeps existing callers byte-identical: they pass no
    // priorParentReports, the field surfaces as []; existing top_skills /
    // recurring_drills / typical_session_minutes are unchanged.
    const plans = basePlans();
    const sig = buildCoachingSignature(plans);
    expect(sig).not.toBeNull();
    // voice_anchors is OPTIONAL on the type but the builder always surfaces it
    // as [] when no priorParentReports are passed — the prompt's
    // `.length > 0` branch then evaluates false and the prompt body is
    // byte-identical to today's post-0066 baseline.
    expect(sig!.voice_anchors ?? []).toEqual([]);
  });

  it('caps voice_anchors at MAX_SIGNATURE_VOICE_ANCHORS even when many recurring phrases exist', () => {
    // Build 10 distinct recurring phrases (each appearing twice → above MIN).
    const phrases = Array.from({ length: 10 }, (_, i) => `voice anchor phrase number ${i}`);
    const priorParentReports: CoachPlanRow[] = phrases.flatMap((p) => [
      parentReportPlan([p]),
      parentReportPlan([p]),
    ]);
    const sig = buildCoachingSignature(basePlans(), { priorParentReports });
    expect(sig).not.toBeNull();
    expect(sig!.voice_anchors!.length).toBeLessThanOrEqual(MAX_SIGNATURE_VOICE_ANCHORS);
  });
});
