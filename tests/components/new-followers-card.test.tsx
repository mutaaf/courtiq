/**
 * Ticket 0063 — <NewFollowersCard /> component tests.
 *
 * The publisher-side notification card on /home. Reads
 * GET /api/coach-follows/new-followers and renders ONE line per new follower
 * (first name only), capped at 5 with a "+ N more" tail. The Got-it button
 * POSTs /api/coach-follows/new-followers/seen which advances the bookmark.
 *
 * Behaviors under test:
 *  - 0 new followers → renders nothing.
 *  - 3 new followers → 3 named lines.
 *  - 7 new followers → 5 named lines + "+ 2 more" tail.
 *  - Got-it POSTs the seen route AND removes the card.
 *  - voice contract: rendered DOM contains NO AGENTS.md banned tokens.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NewFollowersCard } from '@/components/home/new-followers-card';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface FollowerLine {
  followerFirstName: string;
}

function mockNewFollowers(payload: { lines: FollowerLine[]; extraCount: number; total: number }) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.endsWith('/api/coach-follows/new-followers')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/coach-follows/new-followers/seen')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('<NewFollowersCard /> (ticket 0063)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders nothing when there are zero new followers', async () => {
    mockNewFollowers({ lines: [], extraCount: 0, total: 0 });

    render(<NewFollowersCard />, { wrapper });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId('new-followers-card')).toBeNull();
  });

  it('renders 3 named lines for 3 new followers, no extra tail', async () => {
    mockNewFollowers({
      lines: [
        { followerFirstName: 'Sarah' },
        { followerFirstName: 'Jordan' },
        { followerFirstName: 'Maya' },
      ],
      extraCount: 0,
      total: 3,
    });

    render(<NewFollowersCard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-followers-card')).toBeTruthy();
    });
    const lines = screen.getAllByTestId('new-followers-line');
    expect(lines).toHaveLength(3);

    // No "+ N more" tail when extraCount=0.
    expect(screen.queryByTestId('new-followers-extra')).toBeNull();
  });

  it('caps at 5 named lines and shows "+ 2 more" when there are 7 in total', async () => {
    mockNewFollowers({
      lines: [
        { followerFirstName: 'Alpha' },
        { followerFirstName: 'Beta' },
        { followerFirstName: 'Gamma' },
        { followerFirstName: 'Delta' },
        { followerFirstName: 'Epsilon' },
      ],
      extraCount: 2,
      total: 7,
    });

    render(<NewFollowersCard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('new-followers-card')).toBeTruthy();
    });
    expect(screen.getAllByTestId('new-followers-line')).toHaveLength(5);
    const extra = screen.getByTestId('new-followers-extra');
    expect(extra.textContent).toContain('2');
  });

  it('Got-it POSTs the seen route and hides the card', async () => {
    const fetchSpy = mockNewFollowers({
      lines: [{ followerFirstName: 'Sarah' }],
      extraCount: 0,
      total: 1,
    });

    render(<NewFollowersCard />, { wrapper });

    const btn = await screen.findByTestId('new-followers-gotit');
    fireEvent.click(btn);

    await waitFor(() => {
      const seenCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).includes('/api/coach-follows/new-followers/seen'),
      );
      expect(seenCall).toBeTruthy();
      const init = seenCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });

    // After acknowledging, the card unmounts.
    await waitFor(() => {
      expect(screen.queryByTestId('new-followers-card')).toBeNull();
    });
  });

  it('voice contract: no AGENTS.md banned token in the rendered DOM', async () => {
    mockNewFollowers({
      lines: [{ followerFirstName: 'Sarah' }],
      extraCount: 0,
      total: 1,
    });

    const { container } = render(<NewFollowersCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('new-followers-card')).toBeTruthy();
    });
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});
