/**
 * Component test for SeasonMomentumCard — the coach-private "where am I in the
 * season" card near the top of the home feed (ticket 0032).
 *
 * Like WeeklyDigestCard (0023) and the AIUsageMeter (0008), this is a pure
 * presentational component that takes the result of a best-effort GET to
 * /api/analytics/season-momentum and decides what to render. It must NEVER block
 * the home screen: while loading, on failure, or when the team has no
 * observations yet (weeksActive 0 / no trend), it renders nothing. These tests
 * are the CI-gating proof for the card's UI states (the home page is
 * auth-protected, so its Playwright spec skips in CI).
 *
 * Contract:
 *   <SeasonMomentumCard data={...} teamId="t1" />
 *     data == null | undefined         → render nothing (loading / failed)
 *     data = { weekPosition, weekTotal, weeksActive, trend }
 *       weekTotal set                  → "Week N of M" + a progress element
 *       weekTotal null                 → falls back to a weeks-active display
 *       trend.totalCount === 0         → render nothing (no observations yet)
 *   Identified by data-testid="season-momentum-card".
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SeasonMomentumCard } from '@/components/home/season-momentum-card';
import type { SeasonMomentum } from '@/lib/season-momentum-utils';

const TESTID = 'season-momentum-card';

function seeded(overrides: Partial<SeasonMomentum> = {}): SeasonMomentum {
  return {
    weekPosition: 6,
    weekTotal: 12,
    weeksActive: 6,
    trend: { positiveCount: 23, totalCount: 30 },
    ...overrides,
  };
}

describe('SeasonMomentumCard (ticket 0032)', () => {
  beforeEach(() => cleanup());

  it('renders "Week N of M" and a progress element when weekTotal is set', () => {
    render(<SeasonMomentumCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('Week 6 of 12');
    // A thin progress element (not a heavy chart) reports its position.
    const progress = card.querySelector('[role="progressbar"]');
    expect(progress).not.toBeNull();
    expect(progress?.getAttribute('aria-valuenow')).toBe('6');
    expect(progress?.getAttribute('aria-valuemax')).toBe('12');
  });

  it('shows one factual trend line built from the counts (most recent notes are progress markers)', () => {
    render(<SeasonMomentumCard data={seeded({ trend: { positiveCount: 23, totalCount: 30 } })} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    // Deterministic sentence references the counts; clipboard tone.
    expect(card).toHaveTextContent(/23 of your last 30/i);
  });

  it('falls back to a weeks-active display when weekTotal is null (no season set)', () => {
    render(<SeasonMomentumCard data={seeded({ weekTotal: null, weeksActive: 4 })} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    // No "of M" — the fallback shows weeks active, never an error or a nag.
    expect(card).not.toHaveTextContent(/Week 6 of 12/);
    expect(card).toHaveTextContent(/4 weeks?/i);
  });

  it('renders NOTHING when the data is null/undefined (loading / failed) — never blocks the home screen', () => {
    const { container: c1 } = render(<SeasonMomentumCard data={null} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(c1).toBeEmptyDOMElement();

    cleanup();
    const { container: c2 } = render(<SeasonMomentumCard data={undefined} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(c2).toBeEmptyDOMElement();
    // Contributes nothing that could disable or block the page.
    expect(c2.querySelector('[disabled]')).toBeNull();
  });

  it('renders NOTHING when the team has no observations yet (totalCount 0) — no empty nag', () => {
    const { container } = render(
      <SeasonMomentumCard data={seeded({ weeksActive: 0, trend: { positiveCount: 0, totalCount: 0 } })} teamId="t1" />,
    );
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('the next-step control is sized for touch (min 44px target)', () => {
    render(<SeasonMomentumCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    const action = card.querySelector('a');
    expect(action).not.toBeNull();
    expect(action!.className).toMatch(/(min-h-\[44px\]|h-11|h-12|py-3)/);
  });

  it('uses clipboard-not-landing-page copy (no banned words, no emoji heading)', () => {
    render(<SeasonMomentumCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    const text = card.textContent ?? '';
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });
});
