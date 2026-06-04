/**
 * Ticket 0067 — <SubNoteCard /> component test.
 *
 * The /home card that lists unread sub-notes from the last 7 days. Reads
 * GET /api/sub-handoff/recent-notes; tapping Got-it POSTs
 * /api/sub-handoff/recent-notes/seen.
 *
 * Behaviors under test:
 *  - Empty payload renders nothing.
 *  - Two unread notes → 2 lines + the Mark + Sam attribution.
 *  - Got-it POSTs the seen route + unmounts the card.
 *  - The card does NOT throw on a fetch failure (LESSONS#0036 — best-effort).
 *  - Voice contract: rendered DOM contains no banned tokens.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SubNoteCard } from '@/components/home/sub-note-card';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

function mockRecent(payload: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      void init;
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/api/sub-handoff/recent-notes')) {
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/sub-handoff/recent-notes/seen')) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    },
  );
}

describe('<SubNoteCard /> (ticket 0067)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => cleanup());

  it('renders nothing on empty payload', async () => {
    mockRecent({ lines: [] });
    render(<SubNoteCard />, { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('sub-note-card')).toBeNull();
  });

  it('renders nothing on a fetch failure (best-effort, never throws)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      throw new Error('network down');
    });
    render(<SubNoteCard />, { wrapper });
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('sub-note-card')).toBeNull();
  });

  it('renders two lines for two unread sub-notes', async () => {
    mockRecent({
      lines: [
        { id: 'h-1', subFirstName: 'Mark', truncatedText: 'all 12 showed', subNoteAt: '2026-06-03T22:00:00Z', sessionId: 's1' },
        { id: 'h-2', subFirstName: 'Sam', truncatedText: 'left early', subNoteAt: '2026-05-30T19:00:00Z', sessionId: 's2' },
      ],
    });
    render(<SubNoteCard />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('sub-note-card')).toBeTruthy());
    const lines = screen.getAllByTestId('sub-note-line');
    expect(lines).toHaveLength(2);
    expect(screen.getByTestId('sub-note-card').textContent).toContain('Mark');
    expect(screen.getByTestId('sub-note-card').textContent).toContain('Sam');
  });

  it('Got-it POSTs the seen route + unmounts', async () => {
    const fetchSpy = mockRecent({
      lines: [
        { id: 'h-1', subFirstName: 'Mark', truncatedText: 'all 12 showed', subNoteAt: '2026-06-03T22:00:00Z', sessionId: 's1' },
      ],
    });
    render(<SubNoteCard />, { wrapper });
    const btn = await screen.findByTestId('sub-note-gotit');
    fireEvent.click(btn);

    await waitFor(() => {
      const seenCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).includes('/api/sub-handoff/recent-notes/seen'),
      );
      expect(seenCall).toBeTruthy();
      const init = seenCall?.[1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
    });
    await waitFor(() => expect(screen.queryByTestId('sub-note-card')).toBeNull());
  });

  it('voice contract: rendered DOM contains no banned tokens', async () => {
    mockRecent({
      lines: [
        { id: 'h-1', subFirstName: 'Mark', truncatedText: 'all 12 showed', subNoteAt: '2026-06-03T22:00:00Z', sessionId: 's1' },
      ],
    });
    const { container } = render(<SubNoteCard />, { wrapper });
    await waitFor(() => expect(screen.getByTestId('sub-note-card')).toBeTruthy());
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});
