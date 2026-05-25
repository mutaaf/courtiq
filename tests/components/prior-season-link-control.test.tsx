/**
 * Ticket 0034 — roster "Did you coach this player last season?" link control.
 *
 * The control lets a coach set/clear a returning player's `prior_player_id`
 * (the coach-confirmed cross-season link) via the client `mutate()` path
 * (NOT direct Supabase — AGENTS.md rule 3). Candidate prior players come from a
 * server-scoped read that returns ONLY the coach's own org's prior-season
 * players — the component renders exactly what the server hands it.
 *
 * Maps to AC6:
 *  - the control writes prior_player_id via mutate() (insert/update path)
 *  - clearing the link writes prior_player_id: null
 *  - the candidate list is whatever the (org-scoped) fetch returns — no other
 *    org's players appear because the server never sends them
 *  - 44px touch target; no banned breathless words; no emoji-decorated heading
 *
 * Pattern mirrors tests/components/staff-invite-button.test.tsx (fetch-mocked
 * candidate read) + the mutate() spy used elsewhere.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Spy on the client mutate() so we assert the write goes through it (not direct Supabase).
const { mockMutate } = vi.hoisted(() => ({ mockMutate: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, mutate: mockMutate };
});

import { PriorSeasonLinkControl } from '@/components/roster/prior-season-link-control';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const CANDIDATES = [
  { id: 'prior-1', name: 'Maya Johnson', team_name: 'Tigers', season: 'Spring 2025' },
  { id: 'prior-2', name: 'Maya Jones', team_name: 'Lions', season: 'Fall 2024' },
];

function mockCandidateFetch(candidates = CANDIDATES) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ candidates }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

describe('PriorSeasonLinkControl — cross-season link (ticket 0034)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockMutate.mockReset();
    mockMutate.mockResolvedValue([{ id: 'player-now', prior_player_id: 'prior-1' }]);
  });

  it('asks the coach whether they coached this player last season', async () => {
    mockCandidateFetch();
    render(<PriorSeasonLinkControl playerId="player-now" priorPlayerId={null} />, { wrapper });
    expect(
      await screen.findByText(/did you coach this player last season/i)
    ).toBeInTheDocument();
  });

  it('lists ONLY the candidates the server returns (org-scoped read)', async () => {
    mockCandidateFetch();
    render(<PriorSeasonLinkControl playerId="player-now" priorPlayerId={null} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Maya Johnson/)).toBeInTheDocument();
      expect(screen.getByText(/Maya Jones/)).toBeInTheDocument();
    });
    // It renders exactly the two candidates the (org-scoped) endpoint returned.
    const options = screen.getAllByTestId('prior-candidate-option');
    expect(options).toHaveLength(2);
  });

  it('writes prior_player_id via mutate() (not direct Supabase) when a candidate is linked', async () => {
    mockCandidateFetch();
    render(<PriorSeasonLinkControl playerId="player-now" priorPlayerId={null} />, { wrapper });

    const firstOption = await screen.findByRole('button', { name: /Maya Johnson/ });
    fireEvent.click(firstOption);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'players',
          operation: 'update',
          data: { prior_player_id: 'prior-1' },
          filters: { id: 'player-now' },
        })
      );
    });
  });

  it('clears the link (prior_player_id: null) via mutate() when unlinked', async () => {
    mockCandidateFetch();
    render(<PriorSeasonLinkControl playerId="player-now" priorPlayerId="prior-1" />, { wrapper });

    const clearBtn = await screen.findByRole('button', { name: /remove link|not the same player|clear/i });
    fireEvent.click(clearBtn);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'players',
          operation: 'update',
          data: { prior_player_id: null },
          filters: { id: 'player-now' },
        })
      );
    });
  });

  it('uses clipboard voice with no banned breathless words and no emoji heading', async () => {
    mockCandidateFetch();
    const { container } = render(
      <PriorSeasonLinkControl playerId="player-now" priorPlayerId={null} />,
      { wrapper }
    );
    await screen.findByText(/did you coach this player last season/i);
    const text = (container.textContent || '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text).not.toContain(banned);
    }
    // No emoji-decorated headings (AGENTS.md rule 7).
    expect(container.textContent || '').not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });

  it('shows a quiet empty state (not a broken list) when there are no candidates', async () => {
    mockCandidateFetch([]);
    render(<PriorSeasonLinkControl playerId="player-now" priorPlayerId={null} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/no returning players|no prior-season players|nobody to link/i)).toBeInTheDocument();
    });
    expect(screen.queryAllByTestId('prior-candidate-option')).toHaveLength(0);
  });
});
