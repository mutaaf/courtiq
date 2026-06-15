/**
 * Ticket 0083 — pure summary-line composer for the
 * <ProgramArcHistoryHint /> card. Deterministic; never AI-generated.
 *
 * Given the week-by-week arc shape from computeProgramArcShape, picks the
 * two CONTIGUOUS week ranges with the strongest top-skill frequency and
 * composes one sentence:
 *   "Last year's <ageGroup> <programName> spent weeks A-B on X and
 *    weeks C-D on Y; that arc carried for them."
 *
 * Also exposes a banned-word scan helper (LESSONS#0023 / #0061 — literal
 * spaces in defensive scans, never `\s+`) so the route + the component
 * test can assert the composed line never contains an AGENTS.md banned
 * word for any matrix of program / age / skill / week-range inputs.
 *
 * .test.ts (NOT .spec.ts) — per docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import {
  composeProgramArcSummary,
  containsBannedWord,
  type ProgramArcSummaryWeek,
} from '@/lib/program-arc-summary';

function makeWeek(
  week_index: number,
  topSkills: string[],
  team_count = 1,
  practice_count = 2,
): ProgramArcSummaryWeek {
  return {
    week_index,
    top_skills: topSkills,
    team_count,
    practice_count,
  };
}

describe('composeProgramArcSummary (ticket 0083) — deterministic summary line', () => {
  it('returns null when the input is empty', () => {
    expect(
      composeProgramArcSummary([], { programName: 'Hawks', ageGroup: 'U10' }),
    ).toBeNull();
  });

  it('renders the canonical two-range sentence on the canonical input', () => {
    // Weeks 2-4 closeouts, weeks 5-7 transitions.
    const weeks: ProgramArcSummaryWeek[] = [
      makeWeek(1, ['warmup']),
      makeWeek(2, ['closeouts']),
      makeWeek(3, ['closeouts']),
      makeWeek(4, ['closeouts']),
      makeWeek(5, ['transitions']),
      makeWeek(6, ['transitions']),
      makeWeek(7, ['transitions']),
      makeWeek(8, ['warmup']),
    ];
    const out = composeProgramArcSummary(weeks, {
      programName: 'Hawks',
      ageGroup: 'U10',
    });
    expect(out).not.toBeNull();
    expect(out).toContain('Hawks');
    expect(out).toContain('U10');
    expect(out).toContain('closeouts');
    expect(out).toContain('transitions');
    expect(out).toMatch(/weeks 2-4/);
    expect(out).toMatch(/weeks 5-7/);
  });

  it('renders a single-range sentence when only one contiguous block exists', () => {
    const weeks: ProgramArcSummaryWeek[] = [
      makeWeek(2, ['closeouts']),
      makeWeek(3, ['closeouts']),
      makeWeek(4, ['closeouts']),
    ];
    const out = composeProgramArcSummary(weeks, {
      programName: 'Hawks',
      ageGroup: 'U10',
    });
    expect(out).not.toBeNull();
    expect(out).toContain('closeouts');
    expect(out).toMatch(/weeks 2-4/);
    expect(out).not.toMatch(/and weeks/);
  });

  it('falls back to single-week labels when the range is one week long', () => {
    const weeks: ProgramArcSummaryWeek[] = [
      makeWeek(3, ['closeouts']),
    ];
    const out = composeProgramArcSummary(weeks, {
      programName: 'Hawks',
      ageGroup: 'U10',
    });
    expect(out).not.toBeNull();
    expect(out).toContain('closeouts');
    expect(out).toMatch(/week 3/);
  });

  it('is deterministic across input order', () => {
    const weeks: ProgramArcSummaryWeek[] = [
      makeWeek(1, ['warmup']),
      makeWeek(2, ['closeouts']),
      makeWeek(3, ['closeouts']),
      makeWeek(4, ['closeouts']),
      makeWeek(5, ['transitions']),
      makeWeek(6, ['transitions']),
      makeWeek(7, ['transitions']),
    ];
    const out1 = composeProgramArcSummary(weeks, {
      programName: 'Hawks',
      ageGroup: 'U10',
    });
    const out2 = composeProgramArcSummary(
      [...weeks].reverse(),
      { programName: 'Hawks', ageGroup: 'U10' },
    );
    expect(out1).toEqual(out2);
  });

  it('renders the program name verbatim and never invents a coach name', () => {
    const weeks: ProgramArcSummaryWeek[] = [
      makeWeek(2, ['closeouts']),
      makeWeek(3, ['closeouts']),
      makeWeek(4, ['closeouts']),
    ];
    const out = composeProgramArcSummary(weeks, {
      programName: 'Riverside Academy',
      ageGroup: 'U10',
    });
    expect(out).toContain('Riverside Academy');
    // The composer never injects a name pattern like "Coach <Word>".
    expect(out).not.toMatch(/Coach [A-Z][a-z]+/);
  });

  // Voice scan over a small matrix of program / age / skill inputs — the
  // composer must never emit a banned token for any reasonable input.
  it('produces no AGENTS.md banned token across a program/age/skill matrix', () => {
    const programs = ['Hawks', 'Riverside Academy', 'St. Mary Lions', 'East Side Bulls'];
    const ages = ['U8', 'U10', 'U12'];
    const skillMatrix: string[][] = [
      ['closeouts', 'transitions'],
      ['rebounding', 'spacing'],
      ['ball-handling', 'finishing'],
    ];
    for (const programName of programs) {
      for (const ageGroup of ages) {
        for (const [a, b] of skillMatrix) {
          const weeks: ProgramArcSummaryWeek[] = [
            makeWeek(2, [a]),
            makeWeek(3, [a]),
            makeWeek(4, [a]),
            makeWeek(5, [b]),
            makeWeek(6, [b]),
            makeWeek(7, [b]),
          ];
          const out = composeProgramArcSummary(weeks, { programName, ageGroup });
          expect(out).not.toBeNull();
          expect(containsBannedWord(out ?? '')).toBe(false);
        }
      }
    }
  });
});

describe('containsBannedWord — defensive voice scan', () => {
  it('catches AGENTS.md banned tokens', () => {
    expect(containsBannedWord('your amazing season')).toBe(true);
    expect(containsBannedWord('what an exciting week')).toBe(true);
    expect(containsBannedWord('unlock your potential here')).toBe(true);
    expect(containsBannedWord('a coach clipboard tone')).toBe(false);
    expect(containsBannedWord('Last year U10 Hawks worked on closeouts')).toBe(false);
  });

  it('uses literal spaces — not \\s+ — per LESSONS#0061', () => {
    // A labelled-key newline like "skill:\nname" must NOT be a false
    // positive even when the next line starts with a capitalized word.
    expect(containsBannedWord('skill:\nNeighborhood')).toBe(false);
  });
});
