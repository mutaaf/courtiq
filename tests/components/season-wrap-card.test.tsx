/**
 * Component test for SeasonWrapCard — the coach-private "that's a wrap" card that
 * appears at the top of the home feed ONLY when the active team's season is
 * complete (ticket 0036).
 *
 * Like SeasonMomentumCard (0032), this is a pure presentational component that
 * takes the result of a best-effort GET and decides what to render. It must NEVER
 * block the home screen: while loading, on failure, or when the season is NOT
 * complete (in_progress / not_started), it renders nothing — no empty nag, no
 * "you've been inactive" guilt (banned tone). When complete it shows the factual
 * totals + one growth highlight and a single "Start next season" button.
 *
 * These component tests are the CI-gating proof of the card's UI states (the home
 * page is auth-protected, so its Playwright spec skips in CI without creds).
 *
 * Contract:
 *   <SeasonWrapCard data={...} teamId="t1" />
 *     data == null | undefined          → render nothing (loading / failed)
 *     data.phase !== 'complete'         → render nothing
 *     data.phase === 'complete'         → totals + highlight + Start-next-season button
 *   Identified by data-testid="season-wrap-card".
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SeasonWrapCard, type SeasonWrapData } from '@/components/home/season-wrap-card';

const TESTID = 'season-wrap-card';

function seeded(overrides: Partial<SeasonWrapData> = {}): SeasonWrapData {
  return {
    phase: 'complete',
    season: 'Spring 2026',
    weeksCoached: 10,
    practiceCount: 18,
    playersObserved: 12,
    highlight: "Devon's defense was the biggest jump this season.",
    ...overrides,
  };
}

describe('SeasonWrapCard (ticket 0036)', () => {
  beforeEach(() => cleanup());

  it('renders the factual totals when the season is complete', () => {
    render(<SeasonWrapCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('10');  // weeks coached
    expect(card).toHaveTextContent('18');  // practices
    expect(card).toHaveTextContent('12');  // players observed
  });

  it('shows the single growth highlight derived from the coach’s own data', () => {
    render(<SeasonWrapCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toHaveTextContent(/Devon's defense/i);
  });

  it('offers a single "Start next season" control sized for touch (min 44px)', () => {
    render(<SeasonWrapCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    const button = screen.getByRole('button', { name: /start next season/i });
    expect(button).toBeInTheDocument();
    expect(button.className).toMatch(/(min-h-\[44px\]|h-11|h-12|py-3)/);
    // exactly one primary action
    expect(card.querySelectorAll('button').length).toBeGreaterThanOrEqual(1);
  });

  it('renders NOTHING when the season is in progress — card absent', () => {
    const { container } = render(<SeasonWrapCard data={seeded({ phase: 'in_progress' })} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING when the season has not started — card absent', () => {
    const { container } = render(<SeasonWrapCard data={seeded({ phase: 'not_started' })} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING when the data is null/undefined (loading / failed) — never blocks home', () => {
    const { container: c1 } = render(<SeasonWrapCard data={null} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(c1).toBeEmptyDOMElement();

    cleanup();
    const { container: c2 } = render(<SeasonWrapCard data={undefined} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(c2).toBeEmptyDOMElement();
  });

  it('renders without a highlight line when no highlight exists (still shows totals, no error)', () => {
    render(<SeasonWrapCard data={seeded({ highlight: null })} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('18'); // totals still render
  });

  it('uses clipboard-not-landing-page copy (no banned words, no emoji heading)', () => {
    render(<SeasonWrapCard data={seeded()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    const text = (card.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text).not.toContain(banned);
    }
  });

  it('fires the rollover handler when "Start next season" is pressed', async () => {
    const onStart = vi.fn();
    render(<SeasonWrapCard data={seeded()} teamId="t1" onStartNextSeason={onStart} />);
    const button = screen.getByRole('button', { name: /start next season/i });
    button.click();
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
