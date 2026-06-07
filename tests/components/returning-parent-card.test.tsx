/**
 * Component test for ReturningParentCard — ticket 0072.
 *
 * The pure presentational card receives `signals` + an `onConsume`
 * callback. Asserts:
 *  - one unconsumed signal → card renders with the player first name +
 *    team name + a See-season button with the right href + a Got-it
 *    button;
 *  - signals empty → card is ABSENT (silence beats nag);
 *  - See-season button href contains the priorPlayerId AND points at
 *    `/roster/<id>/trajectory` (the existing 0061 surface);
 *  - tapping Got-it calls onConsume(signal.id);
 *  - two signals → card shows "+ 1 more" pill;
 *  - rendered text contains NO AGENTS.md banned word for 0, 1, 2, 5
 *    signal counts.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020 / #38).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import {
  ReturningParentCard,
  type ReturningParentSignal,
} from '@/components/home/returning-parent-card';

const TESTID = 'returning-parent-card';

const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

function signal(overrides: Partial<ReturningParentSignal> = {}): ReturningParentSignal {
  return {
    id: 'sig-1',
    priorPlayerId: '00000000-0000-4000-a000-0000000000c1',
    priorPlayerFirstName: 'Liam',
    priorTeamName: 'Spring Hawks',
    firedAt: '2026-11-14T00:00:00Z',
    ...overrides,
  };
}

function noop() {
  /* no-op */
}

describe('ReturningParentCard (ticket 0072)', () => {
  beforeEach(() => cleanup());

  it('renders the card with the prior player first name and the prior team name', () => {
    render(<ReturningParentCard signals={[signal()]} onConsume={noop} />);
    const card = screen.getByTestId(TESTID);
    expect(card).toHaveTextContent('Liam');
    expect(card).toHaveTextContent(/Spring Hawks/);
  });

  it('renders NOTHING when the signals list is empty (silence beats nag)', () => {
    render(<ReturningParentCard signals={[]} onConsume={noop} />);
    expect(screen.queryByTestId(TESTID)).toBeNull();
  });

  it("the See-season button's href contains the priorPlayerId and points at /roster/<id>/trajectory", () => {
    render(<ReturningParentCard signals={[signal()]} onConsume={noop} />);
    const link = screen.getByTestId('returning-parent-card-see-season') as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe(
      `/roster/${signal().priorPlayerId}/trajectory`,
    );
  });

  it('tapping the Got-it button invokes onConsume with the current signal id', () => {
    const onConsume = vi.fn();
    render(<ReturningParentCard signals={[signal()]} onConsume={onConsume} />);
    const btn = screen.getByTestId('returning-parent-card-got-it');
    fireEvent.click(btn);
    expect(onConsume).toHaveBeenCalledWith(signal().id);
  });

  it('renders "+ 1 more" pill when there are two signals (and points at the most-recent first)', () => {
    const signals = [
      signal({ id: 'sig-1', priorPlayerFirstName: 'Liam', firedAt: '2026-11-14T00:00:00Z' }),
      signal({ id: 'sig-2', priorPlayerFirstName: 'Maya', firedAt: '2026-11-13T00:00:00Z' }),
    ];
    render(<ReturningParentCard signals={signals} onConsume={noop} />);
    const pill = screen.getByTestId('returning-parent-card-more-pill');
    expect(pill).toHaveTextContent(/\+\s*1\s+more/i);
    const card = screen.getByTestId(TESTID);
    expect(card).toHaveTextContent('Liam');
  });

  it('contains no AGENTS.md banned word across signal counts 0, 1, 2, 5', () => {
    for (const count of [0, 1, 2, 5]) {
      cleanup();
      const signals = Array.from({ length: count }, (_, i) =>
        signal({ id: `sig-${i}`, priorPlayerFirstName: `Kid${i}` }),
      );
      render(<ReturningParentCard signals={signals} onConsume={noop} />);
      const card = screen.queryByTestId(TESTID);
      const text = (card?.textContent || '').toLowerCase();
      for (const word of BANNED) {
        expect(text).not.toContain(word);
      }
    }
  });

  it('disables the Got-it button while isConsuming is true (prevents double-fire)', () => {
    render(<ReturningParentCard signals={[signal()]} onConsume={noop} isConsuming />);
    const btn = screen.getByTestId('returning-parent-card-got-it') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});
