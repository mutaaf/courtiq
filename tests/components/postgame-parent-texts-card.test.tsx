/**
 * Component test for PostgameParentTextsCard — the coach-private post-game
 * parent-text artifact rendered on the session detail page (ticket 0048).
 *
 * The card is INTENTIONALLY one-tap: the AI call only fires when the coach
 * clicks the button after a game. So the test matrix:
 *   - entitled coach → button renders, click fires POST, rows render on
 *     success WITH a per-row Copy button that writes the row's `text_message`
 *     verbatim to the clipboard.
 *   - entitled coach + below-threshold response (no content_structured) →
 *     a quiet "not enough notes" line renders, no row blocks.
 *   - free coach → the <UpgradeGate feature="report_cards"> swaps in the gate
 *     card and the generate button is NOT in the DOM.
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
import { PostgameParentTextsCard } from '@/components/sessions/postgame-parent-texts-card';
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

const TESTID = 'postgame-parent-texts';

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
  tierState.current = {
    tier: 'coach',
    canAccess: (k: string) => TIER_LIMITS.coach.features.includes(k),
  };
});

describe('PostgameParentTextsCard (ticket 0048)', () => {
  it('renders the card with the generate button for an entitled (Coach+) coach', () => {
    render(<PostgameParentTextsCard sessionId="sess-1" teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent(/parent text/i);
    expect(screen.getByTestId('postgame-parent-texts-button')).toBeInTheDocument();
  });

  it('on success, replaces the button with one row per entry and shows a Copy button per row', async () => {
    const happy = {
      planId: 'plan-1',
      content_structured: {
        session_id: 'sess-1',
        entries: [
          {
            player_id: 'p-maya',
            player_first_name: 'Maya',
            text_message: "Maya's defense in the second half was the difference today; she boxed out twice in a row.",
          },
          {
            player_id: 'p-devon',
            player_first_name: 'Devon',
            text_message: 'Devon was first to dive for the loose ball today and held his position all four quarters.',
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

    render(<PostgameParentTextsCard sessionId="sess-1" teamId="t1" />);
    fireEvent.click(screen.getByTestId('postgame-parent-texts-button'));

    await waitFor(() => {
      expect(screen.getByTestId('postgame-parent-texts-entries')).toBeInTheDocument();
    });
    const rows = screen.getAllByTestId(/^postgame-parent-texts-row-/);
    expect(rows).toHaveLength(2);
    expect(screen.getByText('Maya')).toBeInTheDocument();
    expect(screen.getByText("Maya's defense in the second half was the difference today; she boxed out twice in a row.")).toBeInTheDocument();
    expect(screen.getByText('Devon')).toBeInTheDocument();

    // Each row has its own Copy button.
    const copyButtons = screen.getAllByRole('button', { name: /copy/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/ai/postgame-parent-texts',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"sessionId":"sess-1"'),
      }),
    );
  });

  it('clicking the per-row Copy button writes the row\'s text_message verbatim to the clipboard', async () => {
    const happy = {
      planId: 'plan-1',
      content_structured: {
        session_id: 'sess-1',
        entries: [
          {
            player_id: 'p-maya',
            player_first_name: 'Maya',
            text_message: 'Exact verbatim text the coach pastes into Messages.',
          },
        ],
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => happy,
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    render(<PostgameParentTextsCard sessionId="sess-1" teamId="t1" />);
    fireEvent.click(screen.getByTestId('postgame-parent-texts-button'));

    await waitFor(() => {
      expect(screen.getByTestId('postgame-parent-texts-row-p-maya')).toBeInTheDocument();
    });

    const copyBtn = screen.getByTestId('postgame-parent-texts-copy-p-maya');
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('Exact verbatim text the coach pastes into Messages.');
    });
  });

  it('renders a quiet "not enough notes" line on the below-threshold response (no rows, no error)', async () => {
    const cold = {
      planId: null,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => cold,
    });

    render(<PostgameParentTextsCard sessionId="sess-1" teamId="t1" />);
    fireEvent.click(screen.getByTestId('postgame-parent-texts-button'));

    await waitFor(() => {
      expect(screen.getByTestId('postgame-parent-texts-cold')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('postgame-parent-texts-entries')).not.toBeInTheDocument();
  });

  it('uses clipboard voice — no AGENTS.md banned word in the rendered card copy', () => {
    render(<PostgameParentTextsCard sessionId="sess-1" teamId="t1" />);
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
    render(<PostgameParentTextsCard sessionId="sess-1" teamId="t1" />);
    // The gate replaces the card body with the upgrade prompt — the testid
    // and the generate button are NOT in the DOM.
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(screen.queryByTestId('postgame-parent-texts-button')).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').toMatch(/upgrade/i);
  });
});
