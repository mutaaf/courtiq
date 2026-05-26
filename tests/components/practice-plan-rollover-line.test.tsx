/**
 * Ticket 0045 — PracticePlanRolloverLine component test.
 *
 * The plan view renders a quiet single-line "Carrying from last week: …" above
 * the drills section ONLY when the freshly-generated practice plan's
 * `content_structured.rollover_from_last_week` array is non-empty.
 *
 *  - non-empty rollover → line is visible, names the drills
 *  - empty / undefined  → component renders nothing (no empty container)
 *
 * .test.ts NOT .spec.ts (LESSONS#38). Pure presentational; no network, no router.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PracticePlanRolloverLine } from '@/components/plans/practice-plan-rollover-line';

const TESTID = 'practice-plan-rollover-line';

const ROLLOVER_FIXTURE = [
  { drill_id: 'corner-shooting', drill_name: 'Corner Shooting', source_plan_id: 'prior-1' },
  { drill_id: '3-on-3-to-shot', drill_name: '3-on-3 to Shot', source_plan_id: 'prior-1' },
];

describe('PracticePlanRolloverLine (ticket 0045)', () => {
  beforeEach(() => cleanup());

  it('renders the carrying-from-last-week line when rollover drills are present', () => {
    render(<PracticePlanRolloverLine rollover={ROLLOVER_FIXTURE} />);
    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent(/carrying from last week/i);
    expect(line).toHaveTextContent('Corner Shooting');
    expect(line).toHaveTextContent('3-on-3 to Shot');
  });

  it('renders NOTHING when the rollover array is empty', () => {
    const { container } = render(<PracticePlanRolloverLine rollover={[]} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING when the rollover prop is undefined (no prior plan)', () => {
    const { container } = render(<PracticePlanRolloverLine rollover={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('uses clipboard-not-landing-page copy (no AGENTS.md banned words)', () => {
    render(<PracticePlanRolloverLine rollover={ROLLOVER_FIXTURE} />);
    const text = screen.getByTestId(TESTID).textContent ?? '';
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });
});
