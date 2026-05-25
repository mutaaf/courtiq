/**
 * Component tests for RecapShareButton — the in-app "Share this recap" control
 * on a generated game recap (ticket 0027).
 *
 * The control POSTs /api/recap-card/create with the recap's planId (the dedicated
 * authed route — never direct Supabase, AGENTS.md rule 3) to mint a public
 * /recap/<token> link, then shares it via navigator.share / clipboard. Because a
 * share button renders NO <a href> (docs/LESSONS.md 2026-05-21), the resolved URL
 * is exposed on a stable data-share-url attribute so both this test and the e2e
 * spec can assert the constructed link. Mirrors the CoachProfileShareButton
 * pattern (lazy create on first click).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecapShareButton } from '@/components/growth/recap-share-button';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function shareButton() {
  return screen.getByRole('button', { name: /share this recap/i });
}

describe('RecapShareButton — exposes the /recap/<token> link on data-share-url', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // AC: the control is visible before any create call (it's a one-tap control).
  it('renders the "Share this recap" control', () => {
    render(<RecapShareButton planId="plan-1" />, { wrapper });
    expect(shareButton()).toBeInTheDocument();
    // Before the first click no link is resolved yet.
    expect(shareButton().getAttribute('data-share-url')).toBeNull();
  });

  // AC: clicking POSTs /api/recap-card/create and exposes the resolved
  // /recap/<token> link on data-share-url (share button renders no <a href>).
  it('POSTs create with the planId and exposes /recap/<token> on data-share-url', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'abc123token', url: '/recap/abc123token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    // navigator.share unavailable → falls through to clipboard (stub it).
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<RecapShareButton planId="plan-7" />, { wrapper });
    shareButton().click();

    await waitFor(() => {
      const url = shareButton().getAttribute('data-share-url') ?? '';
      expect(url).toContain('/recap/abc123token');
    });

    // It hit the dedicated create route with the planId in the body.
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/recap-card/create',
      expect.objectContaining({ method: 'POST' })
    );
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({ planId: 'plan-7' });
  });

  // COPPA: the constructed public link carries no player identifiers — it is a
  // token-only path plus the app origin, nothing player-scoped.
  it('the resolved share URL contains no player identifiers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 'safe-token', url: '/recap/safe-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<RecapShareButton planId="plan-1" />, { wrapper });
    shareButton().click();

    await waitFor(() => {
      const url = shareButton().getAttribute('data-share-url') ?? '';
      expect(url).toContain('/recap/safe-token');
      expect(url).not.toMatch(/player/i);
    });
  });

  // A failed create is a no-op: no link is exposed, the button stays usable.
  it('does not expose a share URL when create fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'nope' }), { status: 404 })
    );

    render(<RecapShareButton planId="plan-1" />, { wrapper });
    shareButton().click();

    // Give the rejected mutation a tick; the attribute must stay unset.
    await new Promise((r) => setTimeout(r, 10));
    expect(shareButton().getAttribute('data-share-url')).toBeNull();
  });
});
