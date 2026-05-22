/**
 * Aria-labels regression suite for icon-only buttons.
 *
 * Each test renders the actual source component and asserts the accessible
 * name added in feat/aria-labels-accessibility so a future edit that removes
 * or misspells an aria-label will fail here.
 *
 * Coverage (representative; one per distinct label):
 *   "Remove player"   — onboarding/roster/page (mutation-free render path)
 *   "Back to settings" — settings/referrals/page (back-nav pattern ×6 pages)
 *   "Go back"          — sessions/new/page (back-nav in session flow)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ─── Shared mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

vi.mock('@/hooks/use-active-team', () => ({
  useActiveTeam: () => ({
    activeTeamId: 'team-1',
    activeTeam: { id: 'team-1', name: 'Tigers', current_week: 1 },
    teams: [{ id: 'team-1', name: 'Tigers' }],
    coach: { id: 'coach-1', full_name: 'Coach Smith' },
  }),
}));

vi.mock('@/lib/api', () => ({
  query: vi.fn().mockResolvedValue([]),
  mutate: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function withQuery(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Onboarding / Roster ──────────────────────────────────────────────────────

import RosterSetupPage from '@/app/(auth)/onboarding/roster/page';

describe('RosterSetupPage — aria-labels', () => {
  it('"Remove player" button is accessible to screen readers', () => {
    render(<RosterSetupPage />);
    // Page initialises with 3 rows; remove buttons appear whenever players.length > 1
    const removeBtns = screen.getAllByRole('button', { name: 'Remove player' });
    expect(removeBtns.length).toBeGreaterThan(0);
  });
});

// ─── Settings / Referrals ─────────────────────────────────────────────────────
// Represents the back-nav pattern shared by all six settings sub-pages.

import ReferralsPage from '@/app/(dashboard)/settings/referrals/page';

describe('ReferralsPage — aria-labels', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ code: 'TESTCODE', referralCount: 0, rewardEarned: false }),
      })
    );
  });

  it('"Back to settings" button is accessible to screen readers', () => {
    withQuery(<ReferralsPage />);
    expect(
      screen.getByRole('button', { name: 'Back to settings' })
    ).toBeInTheDocument();
  });
});

// ─── Sessions / New ───────────────────────────────────────────────────────────

import NewSessionPage from '@/app/(dashboard)/sessions/new/page';

describe('NewSessionPage — aria-labels', () => {
  it('"Go back" button is accessible to screen readers', () => {
    withQuery(<NewSessionPage />);
    expect(screen.getByRole('button', { name: 'Go back' })).toBeInTheDocument();
  });
});
