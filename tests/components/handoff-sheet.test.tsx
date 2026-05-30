/**
 * Ticket 0059 — component tests for HandoffSheet (the SOURCE coach's
 * end-of-season sheet).
 *
 *   - opens with one POST to /api/player-handoffs/generate-preview (NOT a
 *     re-render-firing useEffect; one POST per sheet session)
 *   - renders a checkbox per preview row, all checked by default
 *   - unchecking a player and committing only sends the checked playerIds
 *   - commit success collapses to the "Handoff queued for N players" toast
 *
 * .test.tsx NOT .spec.tsx — LESSONS#38. Uses data-testid scoping per
 * LESSONS#0081 so a future copy tweak doesn't shift the assertion.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { HandoffSheet } from '@/components/handoffs/handoff-sheet';

function mockFetchSequence(...responses: Array<{ status: number; body: unknown }>) {
  const fn = vi.fn();
  for (const r of responses) {
    fn.mockResolvedValueOnce(
      new Response(JSON.stringify(r.body), {
        status: r.status,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(fn);
  return fn;
}

const TEAM_ID = 'team-1';
const PLAYER_IDS = ['p-1', 'p-2'];

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HandoffSheet — source coach end-of-season flow (ticket 0059)', () => {
  it('renders the open button before any fetch fires', () => {
    render(<HandoffSheet teamId={TEAM_ID} playerIds={PLAYER_IDS} />);
    expect(screen.getByTestId('handoff-sheet-open')).toBeInTheDocument();
  });

  it('opens with ONE preview POST and renders a checkbox per preview', async () => {
    const fetchMock = mockFetchSequence({
      status: 200,
      body: {
        previews: [
          { playerId: 'p-1', playerFirstName: 'Eli', cardBody: 'Eli body.' },
          { playerId: 'p-2', playerFirstName: 'Maya', cardBody: 'Maya body.' },
        ],
        dropped: [],
      },
    });

    render(<HandoffSheet teamId={TEAM_ID} playerIds={PLAYER_IDS} />);
    fireEvent.click(screen.getByTestId('handoff-sheet-open'));

    await waitFor(() => {
      expect(screen.getByTestId('handoff-preview-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('handoff-preview-row-p-1')).toBeInTheDocument();
    expect(screen.getByTestId('handoff-preview-row-p-2')).toBeInTheDocument();
    // Exactly ONE preview call.
    const previewCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/player-handoffs/generate-preview'),
    );
    expect(previewCalls).toHaveLength(1);
  });

  it('only commits the checked players when one is unchecked', async () => {
    const fetchMock = mockFetchSequence(
      {
        status: 200,
        body: {
          previews: [
            { playerId: 'p-1', playerFirstName: 'Eli', cardBody: 'Eli body.' },
            { playerId: 'p-2', playerFirstName: 'Maya', cardBody: 'Maya body.' },
          ],
          dropped: [],
        },
      },
      {
        status: 200,
        body: { committed: [{ playerId: 'p-1', handoffId: 'h-1' }] },
      },
    );

    render(<HandoffSheet teamId={TEAM_ID} playerIds={PLAYER_IDS} />);
    fireEvent.click(screen.getByTestId('handoff-sheet-open'));
    await waitFor(() => {
      expect(screen.getByTestId('handoff-preview-row-p-1')).toBeInTheDocument();
    });

    // Uncheck p-2.
    fireEvent.click(screen.getByTestId('handoff-preview-check-p-2'));
    fireEvent.click(screen.getByTestId('handoff-commit'));

    await waitFor(() => {
      expect(screen.getByTestId('handoff-done-toast')).toBeInTheDocument();
    });

    const commitCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes('/api/player-handoffs/commit'),
    );
    expect(commitCall).toBeDefined();
    const initOptions = commitCall![1] as RequestInit;
    const body = JSON.parse(String(initOptions.body)) as {
      teamId: string;
      playerIds: string[];
      previews: Array<{ playerId: string }>;
    };
    expect(body.teamId).toBe(TEAM_ID);
    expect(body.playerIds).toEqual(['p-1']);
    expect(body.previews.map((p) => p.playerId)).toEqual(['p-1']);
  });

  it('renders the dropped-line when the preview reports cold-start drops', async () => {
    mockFetchSequence({
      status: 200,
      body: {
        previews: [{ playerId: 'p-1', playerFirstName: 'Eli', cardBody: 'Eli body.' }],
        dropped: [{ playerId: 'p-2', reason: 'insufficient_observations' }],
      },
    });

    render(<HandoffSheet teamId={TEAM_ID} playerIds={PLAYER_IDS} />);
    fireEvent.click(screen.getByTestId('handoff-sheet-open'));

    await waitFor(() => {
      expect(screen.getByTestId('handoff-dropped-line')).toBeInTheDocument();
    });
  });

  it('the rendered strings contain NO AGENTS.md banned words', async () => {
    mockFetchSequence({
      status: 200,
      body: {
        previews: [{ playerId: 'p-1', playerFirstName: 'Eli', cardBody: 'Eli body.' }],
        dropped: [],
      },
    });

    const { container } = render(<HandoffSheet teamId={TEAM_ID} playerIds={PLAYER_IDS} />);
    fireEvent.click(screen.getByTestId('handoff-sheet-open'));
    await waitFor(() => {
      expect(screen.getByTestId('handoff-preview-list')).toBeInTheDocument();
    });

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
