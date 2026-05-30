/**
 * Ticket 0059 — component tests for HandoffBadge (the RECEIVING coach's
 * per-row badge on /roster).
 *
 *   - renders nothing when /for-player returns { handoff: null }
 *   - renders the badge when a handoff is found
 *   - tapping the badge renders the body, source coach first name, season
 *   - tapping "Save to my coach notes" calls /api/player-handoffs/[id]/claim
 *   - tapping "Close" dismisses the sheet
 *   - the rendered strings contain NO AGENTS.md banned words
 *
 * .test.tsx NOT .spec.tsx — LESSONS#38. Uses data-testid scoping per
 * LESSONS#0081.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { HandoffBadge } from '@/components/roster/handoff-badge';

function mockForPlayer(handoff: unknown) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const urlString = typeof input === 'string' ? input : input.toString();
    if (urlString.includes('/api/player-handoffs/for-player')) {
      return Promise.resolve(
        new Response(JSON.stringify({ handoff }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    if (/\/api\/player-handoffs\/[\w-]+\/claim/.test(urlString)) {
      return Promise.resolve(
        new Response(JSON.stringify({ handoffId: 'h-1', claimed_player_id: 'p-receiver' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
}

const PLAYER_ID = 'p-receiver';
const SAMPLE_HANDOFF = {
  handoffId: 'h-1',
  sourceCoachFirstName: 'Maya',
  seasonLabel: '2025 fall',
  cardBody:
    "Eli responds well to short, specific cues. One drill that landed for me: stationary form-shoot.",
};

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HandoffBadge — receiving coach roster row (ticket 0059)', () => {
  it('renders nothing when /for-player returns handoff: null', async () => {
    mockForPlayer(null);
    const { container } = render(<HandoffBadge playerId={PLAYER_ID} />);
    // Wait for the fetch to settle, then verify still empty.
    await waitFor(() => {
      // The component sets `loaded` true; with no handoff, returns null.
      expect(container.textContent).toBe('');
    });
  });

  it('renders the badge when a handoff is found', async () => {
    mockForPlayer(SAMPLE_HANDOFF);
    render(<HandoffBadge playerId={PLAYER_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`)).toBeInTheDocument();
    });
  });

  it('tapping the badge opens a sheet with body, source coach, and season label', async () => {
    mockForPlayer(SAMPLE_HANDOFF);
    render(<HandoffBadge playerId={PLAYER_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`));

    expect(screen.getByTestId(`handoff-sheet-${PLAYER_ID}`)).toBeInTheDocument();
    expect(screen.getByText(/Coach Maya/i)).toBeInTheDocument();
    expect(screen.getByText('2025 fall')).toBeInTheDocument();
    expect(screen.getByTestId(`handoff-body-${PLAYER_ID}`)).toHaveTextContent(
      /Eli responds well/i,
    );
  });

  it('tapping "Save to my coach notes" POSTs to the claim route', async () => {
    mockForPlayer(SAMPLE_HANDOFF);
    render(<HandoffBadge playerId={PLAYER_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`));
    fireEvent.click(screen.getByTestId(`handoff-save-${PLAYER_ID}`));

    await waitFor(() => {
      expect(screen.getByTestId(`handoff-saved-${PLAYER_ID}`)).toBeInTheDocument();
    });

    const fetchCalls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const claimCall = fetchCalls.find((c) =>
      String(c[0]).includes(`/api/player-handoffs/${SAMPLE_HANDOFF.handoffId}/claim`),
    );
    expect(claimCall).toBeDefined();
    const init = claimCall![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { playerId: string };
    expect(body.playerId).toBe(PLAYER_ID);
  });

  it('tapping "Close" dismisses the sheet', async () => {
    mockForPlayer(SAMPLE_HANDOFF);
    render(<HandoffBadge playerId={PLAYER_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`));
    expect(screen.getByTestId(`handoff-sheet-${PLAYER_ID}`)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`handoff-close-${PLAYER_ID}`));

    await waitFor(() => {
      expect(screen.queryByTestId(`handoff-sheet-${PLAYER_ID}`)).not.toBeInTheDocument();
    });
  });

  it('rendered strings contain NO AGENTS.md banned words', async () => {
    mockForPlayer(SAMPLE_HANDOFF);
    const { container } = render(<HandoffBadge playerId={PLAYER_ID} />);
    await waitFor(() => {
      expect(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`handoff-badge-button-${PLAYER_ID}`));

    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
      'unlock your potential',
    ]) {
      expect(text).not.toContain(banned);
    }
  });
});
