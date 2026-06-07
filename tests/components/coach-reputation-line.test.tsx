/**
 * Ticket 0073 — <CoachReputationLine /> component test.
 *
 * Renders the small reputation line on a discovery-card row when
 * reputation is non-null and ABSENT when reputation is null.
 *
 * Acceptance criteria mapping:
 *  - reputation { 12, 4, 8 } → renders "Cloned by 8 coaches in 4
 *    programs this month."
 *  - reputation null → line is ABSENT.
 *  - rendered text contains no AGENTS.md banned word.
 *  - data-testid is per-card (scope safety per LESSONS#0029/#0082).
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CoachReputationLine } from '@/components/library/coach-reputation-line';

const BANNED_HYPE = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

describe('<CoachReputationLine /> (ticket 0073)', () => {
  it('renders the reputation line when reputation is non-null and above threshold', () => {
    render(
      <CoachReputationLine
        cardKey="card-1"
        reputation={{ cloneCount: 12, distinctProgramCount: 4, distinctCoachCount: 8 }}
      />,
    );
    const line = screen.getByTestId('coach-reputation-line-card-1');
    expect(line).toBeTruthy();
    expect(line.textContent).toContain('8');
    expect(line.textContent).toContain('4');
    expect(line.textContent?.toLowerCase()).toContain('coaches');
    expect(line.textContent?.toLowerCase()).toContain('programs');
  });

  it('renders nothing when reputation is null', () => {
    const { container } = render(
      <CoachReputationLine cardKey="card-2" reputation={null} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId(/coach-reputation-line-/)).toBeNull();
  });

  it('contains no AGENTS.md banned hype words', () => {
    const { container } = render(
      <CoachReputationLine
        cardKey="card-3"
        reputation={{ cloneCount: 25, distinctProgramCount: 6, distinctCoachCount: 18 }}
      />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of BANNED_HYPE) {
      expect(text).not.toContain(banned);
    }
  });

  it('the data-testid is scoped per card so digits like 4 / 12 don\'t strict-mode-collide on the discovery surface', () => {
    render(
      <>
        <CoachReputationLine
          cardKey="card-A"
          reputation={{ cloneCount: 12, distinctProgramCount: 4, distinctCoachCount: 8 }}
        />
        <CoachReputationLine
          cardKey="card-B"
          reputation={{ cloneCount: 5, distinctProgramCount: 2, distinctCoachCount: 4 }}
        />
      </>,
    );
    expect(screen.getByTestId('coach-reputation-line-card-A')).toBeTruthy();
    expect(screen.getByTestId('coach-reputation-line-card-B')).toBeTruthy();
  });
});
