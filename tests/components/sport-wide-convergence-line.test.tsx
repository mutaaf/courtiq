/**
 * Ticket 0091 — <SportWideConvergenceLine /> component test.
 *
 * The line mounts on /capture UNDER the existing 0075
 * <CrossProgramFocusLine />. It renders ONLY when the route returns
 * `eligible: true`. Three variants:
 *   - full: 2 named programs (top 2 with named directors)
 *   - singular: 1 named program
 *   - ambient: 0 named programs (all qualifying programs are
 *     opted-out) — counts only, no names
 *
 * Acceptance criteria mapping:
 *  (i)    eligible: false → line ABSENT (silence beats nag)
 *  (ii)   eligible with 25 programs + 2 named → renders both director
 *         names + program names + counts
 *  (iii)  eligible with 25 programs + 1 named → singular variant
 *  (iv)   eligible with 25 programs + 0 named → ambient variant
 *         (no names)
 *  (v)    tapping the count phrase opens the overlay
 *  (vi)   overlay lists the named programs + age groups
 *  (vii)  no banned word across every fixture variant
 *  (viii) data-testid="sport-wide-convergence-line" present
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0038).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SportWideConvergenceLine } from '@/components/capture/sport-wide-convergence-line';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];
const DEFENSIVE_HYPE = [
  'everyone is doing it',
  'trending',
  'viral',
  'hot right now',
  'popular this week',
];

function eligiblePayload(opts: {
  namedCount: 0 | 1 | 2;
  distinctProgramCount?: number;
  totalPlanCount?: number;
}) {
  const named = [
    {
      orgId: 'org-hawks',
      programName: 'Hawks Basketball',
      directorFirstName: 'Riya',
      planCount: 4,
      ageGroupsServed: ['U10', 'U12'],
    },
    {
      orgId: 'org-riverside',
      programName: 'Riverside U10',
      directorFirstName: 'Ben',
      planCount: 2,
      ageGroupsServed: ['U10'],
    },
  ];
  return {
    eligible: true as const,
    distinctProgramCount: opts.distinctProgramCount ?? 25,
    totalPlanCount: opts.totalPlanCount ?? 6,
    namedPrograms: named.slice(0, opts.namedCount),
  };
}

describe('<SportWideConvergenceLine /> (ticket 0091)', () => {
  it('(i) eligible: false → line is ABSENT', () => {
    const { container } = render(
      <SportWideConvergenceLine
        data={{
          eligible: false,
          distinctProgramCount: 10,
          totalPlanCount: 20,
          namedPrograms: [],
          eligibilityReason: 'too_few_programs',
        }}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(i) null data → line is ABSENT (loading)', () => {
    const { container } = render(
      <SportWideConvergenceLine
        data={null}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('(ii) eligible + 2 named → renders both director names + program names + counts (data-testid)', () => {
    render(
      <SportWideConvergenceLine
        data={eligiblePayload({ namedCount: 2 })}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    const line = screen.getByTestId('sport-wide-convergence-line');
    const text = line.textContent ?? '';
    expect(text).toContain('Hawks Basketball');
    expect(text).toContain('Riya');
    expect(text).toContain('Riverside U10');
    expect(text).toContain('Ben');
    expect(text).toContain('6');
    expect(text).toContain('25');
    expect(text).toContain('basketball');
    expect(text).toContain('closeouts');
  });

  it('(iii) eligible + 1 named → singular variant', () => {
    render(
      <SportWideConvergenceLine
        data={eligiblePayload({ namedCount: 1 })}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    const line = screen.getByTestId('sport-wide-convergence-line');
    const text = line.textContent ?? '';
    expect(text).toContain('Hawks Basketball');
    expect(text).toContain('Riya');
    // singular phrasing: "has published" not "have published"
    expect(text).toMatch(/has published/i);
    expect(text).not.toContain('Riverside U10');
  });

  it('(iv) eligible + 0 named → ambient variant (no names)', () => {
    render(
      <SportWideConvergenceLine
        data={eligiblePayload({ namedCount: 0 })}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    const line = screen.getByTestId('sport-wide-convergence-line');
    const text = line.textContent ?? '';
    expect(text).not.toContain('Hawks Basketball');
    expect(text).not.toContain('Riverside U10');
    expect(text).not.toContain('Riya');
    expect(text).not.toContain('Ben');
    // ambient still names the count + sport + skill
    expect(text).toContain('25');
    expect(text).toContain('basketball');
    expect(text).toContain('closeouts');
  });

  it('(v) tapping the count phrase opens the overlay', () => {
    render(
      <SportWideConvergenceLine
        data={eligiblePayload({ namedCount: 2 })}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    expect(screen.queryByTestId('sport-wide-convergence-overlay')).toBeNull();
    const trigger = screen.getByTestId('sport-wide-convergence-count-trigger');
    fireEvent.click(trigger);
    expect(screen.getByTestId('sport-wide-convergence-overlay')).toBeTruthy();
  });

  it('(vi) overlay lists the named programs + age groups', () => {
    render(
      <SportWideConvergenceLine
        data={eligiblePayload({ namedCount: 2 })}
        sportName="basketball"
        skillName="closeouts"
      />,
    );
    fireEvent.click(screen.getByTestId('sport-wide-convergence-count-trigger'));
    const overlay = screen.getByTestId('sport-wide-convergence-overlay');
    const text = overlay.textContent ?? '';
    expect(text).toContain('Hawks Basketball');
    expect(text).toContain('Riverside U10');
    expect(text).toContain('U10');
    expect(text).toContain('U12');
    expect(text).toContain('4'); // hawks plan count
    expect(text).toContain('2'); // riverside plan count
  });

  it('(vii) no banned word across every fixture variant', () => {
    const variants = [
      eligiblePayload({ namedCount: 2 }),
      eligiblePayload({ namedCount: 1 }),
      eligiblePayload({ namedCount: 0 }),
    ];
    for (const data of variants) {
      const { container, unmount } = render(
        <SportWideConvergenceLine
          data={data}
          sportName="basketball"
          skillName="closeouts"
        />,
      );
      const text = (container.textContent ?? '').toLowerCase();
      for (const word of BANNED_HYPE) {
        expect(text).not.toContain(word);
      }
      for (const word of DEFENSIVE_HYPE) {
        expect(text).not.toContain(word);
      }
      unmount();
    }
  });

  it('skill name does not double-fire if sportName / skillName carry trailing spaces (clipboard voice)', () => {
    render(
      <SportWideConvergenceLine
        data={eligiblePayload({ namedCount: 2 })}
        sportName=" basketball "
        skillName=" closeouts "
      />,
    );
    const line = screen.getByTestId('sport-wide-convergence-line');
    const text = line.textContent ?? '';
    // No double-space artifacts in the rendered copy.
    expect(text).not.toMatch(/ {2}/);
  });
});
