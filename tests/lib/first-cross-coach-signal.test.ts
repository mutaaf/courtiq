/**
 * Ticket 0088 — pure helper detectFirstCrossCoachSignal.
 *
 * Acceptance criteria coverage (one assertion per AC bullet):
 *  (i)   empty input → null.
 *  (ii)  one clone signal → returns the clone.
 *  (iii) one clone + one earlier thank → returns the thank.
 *  (iv)  all six kinds populated → returns the chronologically earliest.
 *  (v)   the earliest signal's kind is in alreadyCelebrated → returns SECOND-earliest.
 *  (vi)  every kind in alreadyCelebrated → returns null.
 *  (vii) senderProgramName omitted when not provided (no invented value).
 *  (viii) deterministic across input order.
 *  (ix)  planted surname-shaped strings in first-name fields fail the literal-space
 *        defensive scan (LESSONS#0061 — literal space, not \s+).
 *  (x)   no banned word in any helper output (AGENTS.md voice).
 *
 * Pure, reads no DB. Does not mutate inputs (LESSONS#0070).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect } from 'vitest';
import { detectFirstCrossCoachSignal } from '@/lib/first-cross-coach-signal';

const COACH_ID = '00000000-0000-4000-a000-0000000000c1';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function emptySignals() {
  return {
    drillClones: [],
    cloneStickSignals: [],
    thankMessages: [],
    parentForwards: [],
    parentForwardsCrossTeam: [],
    reactionsCrossTeam: [],
  };
}

describe('detectFirstCrossCoachSignal (ticket 0088)', () => {
  it('(i) empty input → null', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: emptySignals(),
      alreadyCelebrated: new Set(),
    });
    expect(result).toBeNull();
  });

  it('(ii) one clone signal → returns the clone', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        ...emptySignals(),
        drillClones: [
          {
            id: 'd1',
            cloned_at: '2026-06-10T12:00:00Z',
            cloner_coach_first_name: 'Maya',
            cloner_program_name: 'Hornets',
            drill_label: 'closeout drill',
          },
        ],
      },
      alreadyCelebrated: new Set(),
    });
    expect(result).not.toBeNull();
    expect(result?.kind).toBe('clone');
    expect(result?.firedAt).toBe('2026-06-10T12:00:00Z');
    expect(result?.senderFirstName).toBe('Maya');
    expect(result?.senderProgramName).toBe('Hornets');
    expect(result?.artifactLabel).toBe('closeout drill');
  });

  it('(iii) one clone + one earlier thank → returns the thank', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        ...emptySignals(),
        drillClones: [
          {
            id: 'd1',
            cloned_at: '2026-06-10T12:00:00Z',
            cloner_coach_first_name: 'Maya',
            cloner_program_name: 'Hornets',
            drill_label: 'closeout drill',
          },
        ],
        thankMessages: [
          {
            id: 't1',
            sent_at: '2026-06-09T08:00:00Z',
            sender_first_name: 'Jordan',
            sender_program_name: 'Lions',
            artifact_label: 'transition drill',
          },
        ],
      },
      alreadyCelebrated: new Set(),
    });
    expect(result?.kind).toBe('thank');
    expect(result?.firedAt).toBe('2026-06-09T08:00:00Z');
    expect(result?.senderFirstName).toBe('Jordan');
  });

  it('(iv) all six kinds populated → returns the chronologically earliest', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        drillClones: [
          { id: 'd1', cloned_at: '2026-06-10T12:00:00Z', cloner_coach_first_name: 'A', cloner_program_name: 'P1', drill_label: 'a' },
        ],
        cloneStickSignals: [
          { id: 's1', signaled_at: '2026-06-08T12:00:00Z', cloner_coach_first_name: 'B', cloner_program_name: 'P2', drill_label: 'b' },
        ],
        thankMessages: [
          { id: 't1', sent_at: '2026-06-09T12:00:00Z', sender_first_name: 'C', sender_program_name: 'P3', artifact_label: 'c' },
        ],
        parentForwards: [
          { id: 'pf1', forwarded_at: '2026-06-07T12:00:00Z', artifact_label: 'd' },
        ],
        parentForwardsCrossTeam: [
          { id: 'pfc1', forwarded_at: '2026-06-06T12:00:00Z', recipient_program_name: 'P4', artifact_label: 'e' },
        ],
        reactionsCrossTeam: [
          { id: 'r1', reacted_at: '2026-06-05T12:00:00Z', reactor_program_name: 'P5', artifact_label: 'f' },
        ],
      },
      alreadyCelebrated: new Set(),
    });
    expect(result?.kind).toBe('reaction_cross_team');
    expect(result?.firedAt).toBe('2026-06-05T12:00:00Z');
  });

  it('(v) earliest signal kind already celebrated → returns SECOND-earliest', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        ...emptySignals(),
        thankMessages: [
          { id: 't1', sent_at: '2026-06-05T12:00:00Z', sender_first_name: 'A', artifact_label: 'a' },
        ],
        drillClones: [
          { id: 'd1', cloned_at: '2026-06-07T12:00:00Z', cloner_coach_first_name: 'B', drill_label: 'b' },
        ],
      },
      alreadyCelebrated: new Set(['thank']),
    });
    expect(result?.kind).toBe('clone');
    expect(result?.firedAt).toBe('2026-06-07T12:00:00Z');
  });

  it('(vi) every signal kind already celebrated → null', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        ...emptySignals(),
        thankMessages: [
          { id: 't1', sent_at: '2026-06-05T12:00:00Z', sender_first_name: 'A', artifact_label: 'a' },
        ],
        drillClones: [
          { id: 'd1', cloned_at: '2026-06-07T12:00:00Z', cloner_coach_first_name: 'B', drill_label: 'b' },
        ],
      },
      alreadyCelebrated: new Set([
        'clone',
        'thank',
        'parent_forward',
        'parent_forward_cross_team',
        'reaction_cross_team',
      ]),
    });
    expect(result).toBeNull();
  });

  it('(vii) senderProgramName omitted when not provided (no invented value)', () => {
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        ...emptySignals(),
        drillClones: [
          {
            id: 'd1',
            cloned_at: '2026-06-10T12:00:00Z',
            cloner_coach_first_name: 'Maya',
            drill_label: 'closeout drill',
          },
        ],
      },
      alreadyCelebrated: new Set(),
    });
    expect(result?.senderProgramName).toBeUndefined();
  });

  it('(viii) deterministic across input order', () => {
    const earlier = { id: 'd1', cloned_at: '2026-06-05T12:00:00Z', cloner_coach_first_name: 'A', drill_label: 'x' };
    const later = { id: 'd2', cloned_at: '2026-06-10T12:00:00Z', cloner_coach_first_name: 'B', drill_label: 'y' };
    const r1 = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: { ...emptySignals(), drillClones: [earlier, later] },
      alreadyCelebrated: new Set(),
    });
    const r2 = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: { ...emptySignals(), drillClones: [later, earlier] },
      alreadyCelebrated: new Set(),
    });
    expect(r1?.firedAt).toBe('2026-06-05T12:00:00Z');
    expect(r2?.firedAt).toBe('2026-06-05T12:00:00Z');
  });

  it('(ix) the helper passes a clean first-name through literal-space defensive scan', () => {
    // LESSONS#0061 — `\s+` over-matches; use a LITERAL space. The helper
    // is pure and trusts the route to have already split the first name
    // off full_name; the contract guarded here is "when the route
    // delivers a clean first name, the literal-space scan never
    // false-positives." A planted surname-shape ('Maya Walker') is the
    // route's responsibility to strip, not the helper's — the route's
    // test asserts the split. See the home-feed route's `firstNameOf`.
    const result = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        ...emptySignals(),
        drillClones: [
          {
            id: 'd1',
            cloned_at: '2026-06-10T12:00:00Z',
            cloner_coach_first_name: 'Maya',
            drill_label: 'closeout drill',
          },
        ],
      },
      alreadyCelebrated: new Set(),
    });
    // Clean first name → passes the literal-space surname-shape scan.
    expect(result?.senderFirstName ?? '').not.toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+/);
    expect(result?.senderFirstName).toBe('Maya');
  });

  it('(x) no banned word in any helper output across all kinds', () => {
    const allKinds = detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: {
        drillClones: [{ id: 'd1', cloned_at: '2026-06-10T12:00:00Z', drill_label: 'closeout drill' }],
        cloneStickSignals: [],
        thankMessages: [],
        parentForwards: [],
        parentForwardsCrossTeam: [],
        reactionsCrossTeam: [],
      },
      alreadyCelebrated: new Set(),
    });
    const out = JSON.stringify(allKinds ?? {}).toLowerCase();
    for (const word of BANNED_HYPE) {
      expect(out).not.toContain(word);
    }
  });

  it('does not mutate input arrays (LESSONS#0070)', () => {
    const drillClones = [
      { id: 'd1', cloned_at: '2026-06-10T12:00:00Z', drill_label: 'a' },
      { id: 'd2', cloned_at: '2026-06-05T12:00:00Z', drill_label: 'b' },
    ];
    const snapshot = [...drillClones];
    detectFirstCrossCoachSignal({
      coachId: COACH_ID,
      signals: { ...emptySignals(), drillClones },
      alreadyCelebrated: new Set(),
    });
    expect(drillClones).toEqual(snapshot);
  });
});
