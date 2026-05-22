/**
 * Component tests for InviteCoachButton — the "Invite your assistant coach"
 * one-tap share control (ticket 0015).
 *
 * The component fetches the referral code from GET /api/referrals via useQuery
 * and builds the share URL client-side. It exposes the exact URL on
 * data-share-url (because navigator.share / clipboard render no <a href>),
 * so both component and e2e tests can assert the constructed URL.
 *
 * Pattern mirrors tests/components/parent-viral-cta.test.tsx exactly.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InviteCoachButton } from '@/components/growth/invite-coach-button';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function inviteButton() {
  return screen.getByRole('button', { name: /invite your assistant coach/i });
}

describe('InviteCoachButton — referral code in the shared URL (ticket 0015)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // AC: with a code present the URL carries /signup?ref=<code>
  it('builds /signup?ref=<code> when /api/referrals returns a code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'XYZ789', referralCount: 0, rewardEarned: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<InviteCoachButton />, { wrapper });

    await waitFor(() => {
      expect(inviteButton()).toHaveAttribute('data-share-url', `${APP_URL}/signup?ref=XYZ789`);
    });
  });

  // AC: with no code the URL falls back to the plain app URL
  it('falls back to the bare app URL when code is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: null, referralCount: 0, rewardEarned: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<InviteCoachButton />, { wrapper });

    await waitFor(() => {
      expect(inviteButton()).toHaveAttribute('data-share-url', APP_URL);
    });
  });

  // AC: falls back to bare URL when /api/referrals fails
  it('falls back to the bare app URL when the fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));

    render(<InviteCoachButton />, { wrapper });

    await waitFor(() => {
      // Button is rendered (not gated on code resolution) — falls back to bare URL
      expect(inviteButton()).toHaveAttribute('data-share-url', APP_URL);
    });
  });

  // AC: button is always rendered and accessible (never gates; missing code is not fatal)
  it('renders the invite button before the code resolves', () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => {})); // never resolves
    render(<InviteCoachButton />, { wrapper });
    // The button must be visible immediately — it should not be hidden while loading
    expect(inviteButton()).toBeInTheDocument();
  });

  // COPPA: the share URL contains no player data
  it('the constructed URL contains no player identifiers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'SAFE01', referralCount: 0, rewardEarned: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<InviteCoachButton />, { wrapper });

    await waitFor(() => {
      const url = inviteButton().getAttribute('data-share-url') ?? '';
      expect(url).toContain('/signup?ref=SAFE01');
      // Must not contain any player-like identifiers (e.g. UUIDs, player names)
      expect(url).not.toMatch(/player/i);
      expect(url.split('?').length).toBe(2); // only one query string segment
    });
  });
});
