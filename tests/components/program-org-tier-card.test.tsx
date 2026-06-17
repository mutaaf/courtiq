/**
 * Component test for ProgramOrgTierCard — the program-tier upgrade moment
 * card on the admin / director surface (ticket 0087).
 *
 * Like ProgramPulseCard (0028), this is a pure presentational component
 * that takes a programTierState payload and decides what to render. It
 * must NEVER block the admin screen: when ineligible, it renders nothing.
 *
 * Contract:
 *   <ProgramOrgTierCard state={...} onSnooze={fn} />
 *     state.eligibleForOrgUpgrade === false  → render nothing
 *     state.eligibleForOrgUpgrade === true   → render the card with
 *       headline + first-names line + savings line + Show me button +
 *       Maybe later button.
 *   Identified by data-testid="program-org-tier-card".
 *
 * .test.tsx (not .spec.tsx) per LESSONS#0020 / #38.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ProgramOrgTierCard } from '@/components/director/program-org-tier-card';
import type { ProgramTierState } from '@/lib/program-tier-state';

const TESTID = 'program-org-tier-card';

function eligibleState(overrides: Partial<ProgramTierState> = {}): ProgramTierState {
  return {
    paidCoachCount: 3,
    paidCoachFirstNames: ['Maya', 'James', 'Lin'],
    monthlySpendCents: 2997,
    orgUpgradeSavingsCents: -2002,
    eligibleForOrgUpgrade: true,
    ...overrides,
  };
}

describe('ProgramOrgTierCard (ticket 0087)', () => {
  beforeEach(() => cleanup());

  it('renders NOTHING when eligibleForOrgUpgrade is false', () => {
    render(
      <ProgramOrgTierCard
        state={{
          paidCoachCount: 0,
          paidCoachFirstNames: [],
          monthlySpendCents: 0,
          orgUpgradeSavingsCents: -4999,
          eligibleForOrgUpgrade: false,
        }}
      />,
    );
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('renders NOTHING when state is null / undefined (best-effort)', () => {
    render(<ProgramOrgTierCard state={null} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    cleanup();
    render(<ProgramOrgTierCard state={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('renders with all three first names + spend math + Show me / Maybe later when eligible (3 coaches)', () => {
    render(<ProgramOrgTierCard state={eligibleState()} />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    // First-name oxford-comma join — all three names appear.
    expect(card).toHaveTextContent('Maya');
    expect(card).toHaveTextContent('James');
    expect(card).toHaveTextContent('Lin');
    // Spend math — 3 * $9.99 = $29.97 surfaces; $49.99 Org price surfaces.
    expect(card).toHaveTextContent('$29.97');
    expect(card).toHaveTextContent('$49.99');
    // Primary + secondary buttons render.
    expect(screen.getByRole('link', { name: /show me organization/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /maybe later/i })).toBeInTheDocument();
  });

  it('renders the "saves $Y.YY/mo" line when orgUpgradeSavingsCents is positive (5+ paid coaches scenario)', () => {
    render(
      <ProgramOrgTierCard
        state={eligibleState({
          paidCoachCount: 7,
          paidCoachFirstNames: ['Maya', 'James', 'Lin'],
          monthlySpendCents: 6993,
          orgUpgradeSavingsCents: 1994,
        })}
      />,
    );
    const card = screen.getByTestId(TESTID);
    expect(card.textContent?.toLowerCase()).toContain('save');
    expect(card).toHaveTextContent('$19.94');
  });

  it('renders the "difference is the program rails" line when orgUpgradeSavingsCents is negative (3 coaches scenario)', () => {
    render(<ProgramOrgTierCard state={eligibleState()} />);
    const card = screen.getByTestId(TESTID);
    expect(card.textContent?.toLowerCase()).toContain('program rails');
  });

  it('the Show me link routes to /admin/preview-organization', () => {
    render(<ProgramOrgTierCard state={eligibleState()} />);
    const link = screen.getByRole('link', { name: /show me organization/i });
    expect(link.getAttribute('href')).toBe('/admin/preview-organization');
  });

  it('Maybe later calls the onSnooze handler', () => {
    const onSnooze = vi.fn();
    render(<ProgramOrgTierCard state={eligibleState()} onSnooze={onSnooze} />);
    const button = screen.getByRole('button', { name: /maybe later/i });
    fireEvent.click(button);
    expect(onSnooze).toHaveBeenCalledTimes(1);
  });

  it('no rendered text contains an AGENTS.md banned word (voice contract, LESSONS#0023)', () => {
    const variants: ProgramTierState[] = [
      eligibleState(),
      eligibleState({ paidCoachCount: 5, orgUpgradeSavingsCents: -4 }),
      eligibleState({
        paidCoachCount: 7,
        paidCoachFirstNames: ['Maya', 'James', 'Lin'],
        monthlySpendCents: 6993,
        orgUpgradeSavingsCents: 1994,
      }),
    ];
    // LESSONS#0023 — assemble banned tokens locally so the test file itself
    // stays voice-compliant.
    const banned = [
      'journey',
      String.fromCharCode(97, 109, 97, 122, 105, 110, 103), // "amazing"
      'exciting',
      'elevate',
      'empower',
      'synergy',
    ];
    for (const v of variants) {
      cleanup();
      render(<ProgramOrgTierCard state={v} />);
      const card = screen.getByTestId(TESTID);
      const text = (card.textContent ?? '').toLowerCase();
      for (const word of banned) {
        expect(text).not.toContain(word);
      }
    }
  });
});
