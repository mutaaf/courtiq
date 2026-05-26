/**
 * Component test for SidelineCheatSheetCard — the coach-private sideline cheat
 * sheet on the home feed (ticket 0046).
 *
 * Unlike WeeklyDigestCard (which auto-fetches), this card is INTENTIONALLY
 * one-tap: the AI call only fires when the coach clicks the button. So the test
 * matrix:
 *   - entitled coach → button renders, click fires POST, rows render on success
 *   - entitled coach + below-threshold response (no content_structured) →
 *     a quiet "not enough notes" line renders, no row blocks
 *   - free coach → the <UpgradeGate feature="report_cards"> swaps in the gate
 *     card and the generate button is NOT in the DOM
 *
 * `feature="report_cards"` on the gate matches the route's
 * `canAccess(tier, 'report_cards')` server-side (LESSONS#0023 — the prop value
 * MUST equal the tier-key string verbatim).
 *
 * .test.tsx NOT .spec.tsx (LESSONS#0020/#38).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SidelineCheatSheetCard } from '@/components/home/sideline-cheat-sheet-card';
import type { Tier } from '@/lib/tier';
import { TIER_LIMITS } from '@/lib/tier';

const tierState: { current: { tier: Tier; canAccess: (k: string) => boolean } } = {
  current: {
    tier: 'coach',
    canAccess: (k: string) => TIER_LIMITS.coach.features.includes(k),
  },
};

vi.mock('@/hooks/use-tier', () => ({
  useTier: () => tierState.current,
}));

const TESTID = 'sideline-cheat-sheet-card';

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  tierState.current = {
    tier: 'coach',
    canAccess: (k: string) => TIER_LIMITS.coach.features.includes(k),
  };
});

describe('SidelineCheatSheetCard (ticket 0046)', () => {
  it('renders the card with the generate button for an entitled (Coach+) coach', () => {
    render(<SidelineCheatSheetCard teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent(/sideline cheat sheet/i);
    expect(screen.getByTestId('sideline-cheat-sheet-button')).toBeInTheDocument();
  });

  it('on success, replaces the button with one row per entry and shows both lines per row', async () => {
    const happy = {
      planId: 'plan-1',
      content_structured: {
        team_id: 't1',
        entries: [
          {
            player_id: 'p-maya',
            player_first_name: 'Maya',
            lead_line: 'Closeouts have come a long way; mention her hustle on Tuesday.',
            working_on_line: 'We are working on her finishing with contact.',
          },
          {
            player_id: 'p-devon',
            player_first_name: 'Devon',
            lead_line: 'First to dive for the loose ball this week.',
            working_on_line: 'We are working on holding his position on rebounds.',
          },
        ],
      },
    };
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => happy,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = fetchSpy;

    render(<SidelineCheatSheetCard teamId="t1" />);
    fireEvent.click(screen.getByTestId('sideline-cheat-sheet-button'));

    await waitFor(() => {
      expect(screen.getByTestId('sideline-cheat-sheet-entries')).toBeInTheDocument();
    });
    const rows = screen.getAllByTestId('sideline-cheat-sheet-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText(/closeouts have come a long way/i)).toBeInTheDocument();
    expect(screen.getByText(/finishing with contact/i)).toBeInTheDocument();
    expect(screen.getByText('Devon')).toBeInTheDocument();

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/ai/sideline-talking-points',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"teamId":"t1"'),
      }),
    );
  });

  it('renders a quiet "not enough notes" line on the below-threshold response (no rows, no error)', async () => {
    // The route's quiet-week response carries no content_structured.
    const cold = {
      // Route returns { sheet: null } shape for the quiet team — assert the card
      // handles the missing content_structured as the cold-team signal.
      planId: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => cold,
    });

    render(<SidelineCheatSheetCard teamId="t1" />);
    fireEvent.click(screen.getByTestId('sideline-cheat-sheet-button'));

    await waitFor(() => {
      expect(screen.getByTestId('sideline-cheat-sheet-cold')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('sideline-cheat-sheet-entries')).not.toBeInTheDocument();
  });

  it('uses clipboard voice — no AGENTS.md banned word in the rendered card copy', () => {
    render(<SidelineCheatSheetCard teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    const text = (card.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text).not.toContain(banned);
    }
  });

  it('renders the upgrade gate (not the card body) for a free coach', () => {
    tierState.current = {
      tier: 'free',
      canAccess: (k: string) => TIER_LIMITS.free.features.includes(k),
    };
    render(<SidelineCheatSheetCard teamId="t1" />);
    // The gate replaces the card body with the upgrade prompt — the testid
    // and the generate button are NOT in the DOM.
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(screen.queryByTestId('sideline-cheat-sheet-button')).not.toBeInTheDocument();
    // The upgrade prompt names the Sideline Cheat Sheet via featureLabel fallback.
    expect(document.body.textContent ?? '').toMatch(/upgrade/i);
  });
});
