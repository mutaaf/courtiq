/**
 * Ticket 0068 — <SeasonOpenerCard /> /home freshness predicate.
 *
 * The card renders ONLY when the active team's `created_at` is within the
 * last 7 days. A stale team does NOT see the card. The card itself wraps
 * the existing <SeasonOpenerEntry /> sheet — its only job is the 7-day
 * gate so /home stays clean for every coach past their first week.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  SeasonOpenerCard,
  isSeasonOpenerFresh,
} from '@/components/home/season-opener-card';

const TEAM_ID = '00000000-0000-4000-a000-000000000020';

function isoNDaysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe('isSeasonOpenerFresh (ticket 0068)', () => {
  it('returns true for a team created 3 days ago', () => {
    expect(isSeasonOpenerFresh(isoNDaysAgo(3))).toBe(true);
  });

  it('returns true at the 7-day boundary', () => {
    expect(isSeasonOpenerFresh(isoNDaysAgo(6))).toBe(true);
  });

  it('returns false for a team created 14 days ago', () => {
    expect(isSeasonOpenerFresh(isoNDaysAgo(14))).toBe(false);
  });

  it('returns false on a missing / null created_at', () => {
    expect(isSeasonOpenerFresh(null)).toBe(false);
    expect(isSeasonOpenerFresh(undefined as unknown as string)).toBe(false);
  });
});

describe('<SeasonOpenerCard /> (ticket 0068)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the entry point when the team is FRESH (created < 7 days)', () => {
    render(<SeasonOpenerCard teamId={TEAM_ID} teamCreatedAt={isoNDaysAgo(2)} />);
    expect(screen.getByTestId('season-opener-entry-btn')).toBeTruthy();
  });

  it('renders NOTHING when the team is older than 7 days', () => {
    const { container } = render(
      <SeasonOpenerCard teamId={TEAM_ID} teamCreatedAt={isoNDaysAgo(30)} />,
    );
    // Pure null render — no entry point.
    expect(container.querySelector('[data-testid="season-opener-entry-btn"]'))
      .toBeNull();
  });

  it('renders NOTHING when the team is missing created_at', () => {
    const { container } = render(
      <SeasonOpenerCard teamId={TEAM_ID} teamCreatedAt={null} />,
    );
    expect(container.querySelector('[data-testid="season-opener-entry-btn"]'))
      .toBeNull();
  });
});
