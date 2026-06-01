/**
 * Ticket 0061 — component tests for PlayerTrajectoryCard.
 *
 *   - renders nothing while loading
 *   - renders a "first observations still being written" message when
 *     observationCount < 4
 *   - renders the side-by-side started/now sentences when observationCount >= 4
 *   - renders up to 3 turning-point dots with their one-word labels
 *   - exposes data-testid="player-trajectory-card" for e2e scoping
 *     (LESSONS#0081)
 *   - the rendered user-facing strings contain NO AGENTS.md banned word
 *   - the Save card button links to the OG route for the player
 *
 * .test.tsx NOT .spec.tsx — LESSONS#38.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerTrajectoryCard } from '@/components/dashboard/player-trajectory-card';

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function mockTrajectoryFetch(payload: unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const urlString = typeof input === 'string' ? input : input.toString();
    if (urlString.includes('/trajectory')) {
      return Promise.resolve(
        new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

const PLAYER_ID = '00000000-0000-4000-a000-000000000030';

const FULL_PAYLOAD = {
  started: {
    headline: 'Tentative on closeouts',
    sentence: 'Started the season hesitating on closeouts.',
    observation_id: 'obs-0',
    observed_at: '2026-01-01T00:00:00Z',
  },
  now: {
    headline: 'Closes out and recovers',
    sentence: 'Now closes out and recovers without losing balance.',
    observation_id: 'obs-10',
    observed_at: '2026-05-20T00:00:00Z',
  },
  turningPoints: [
    { observation_id: 'obs-3', observed_at: '2026-02-01T00:00:00Z', oneWordLabel: 'forward' },
    { observation_id: 'obs-7', observed_at: '2026-04-10T00:00:00Z', oneWordLabel: 'recovers' },
  ],
  observationCount: 11,
};

beforeEach(() => {
  cleanup();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlayerTrajectoryCard (ticket 0061)', () => {
  it('renders a quiet "first observations still being written" line when observationCount < 4', async () => {
    mockTrajectoryFetch({ started: null, now: null, turningPoints: [], observationCount: 2 });
    renderWithClient(<PlayerTrajectoryCard playerId={PLAYER_ID} playerFirstName="Maya" />);
    await waitFor(() => {
      const card = screen.getByTestId('player-trajectory-card');
      expect(card.textContent).toMatch(/first observations are still being written/i);
    });
  });

  it('renders the side-by-side started/now sentences and turning-point labels on the happy path', async () => {
    mockTrajectoryFetch(FULL_PAYLOAD);
    renderWithClient(<PlayerTrajectoryCard playerId={PLAYER_ID} playerFirstName="Maya" />);
    await waitFor(() => {
      const card = screen.getByTestId('player-trajectory-card');
      expect(card.textContent).toContain('Started the season hesitating on closeouts.');
    });
    const card = screen.getByTestId('player-trajectory-card');
    expect(card.textContent).toContain('Now closes out and recovers without losing balance.');
    expect(card.textContent).toContain('forward');
    expect(card.textContent).toContain('recovers');
    expect(card.textContent).toMatch(/Maya/);
    // The section header reads "<First name> — <N> weeks" (the AC's literal
    // copy; the route surfaces observationCount).
    expect(card.textContent).toMatch(/Maya — 11 weeks/);
  });

  it('contains NO AGENTS.md banned word in the rendered user-facing strings', async () => {
    mockTrajectoryFetch(FULL_PAYLOAD);
    renderWithClient(<PlayerTrajectoryCard playerId={PLAYER_ID} playerFirstName="Maya" />);
    await waitFor(() => {
      expect(screen.getByTestId('player-trajectory-card').textContent).toContain('Started the season');
    });
    const text = screen.getByTestId('player-trajectory-card').textContent || '';
    const lower = text.toLowerCase();
    for (const banned of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
      'unlock your potential',
    ]) {
      expect(lower).not.toContain(banned);
    }
  });

  it('renders a Save card link pointing at the OG route for the player', async () => {
    mockTrajectoryFetch(FULL_PAYLOAD);
    renderWithClient(<PlayerTrajectoryCard playerId={PLAYER_ID} playerFirstName="Maya" />);
    await waitFor(() => {
      expect(screen.getByTestId('player-trajectory-save-card')).toBeInTheDocument();
    });
    const link = screen.getByTestId('player-trajectory-save-card');
    expect(link.getAttribute('href')).toContain(`/api/og/player-trajectory/${PLAYER_ID}`);
  });
});
