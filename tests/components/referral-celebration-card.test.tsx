/**
 * Ticket 0047 — component tests for ReferralCelebrationCard.
 *
 * The home card fires only when GET /api/referrals/celebration returns
 * show:true. Tapping "Invite another coach" reuses the existing 0015
 * invite-share path; on first render the card POSTs /api/referrals/celebration/seen
 * once so subsequent renders return show:false until the next conversion.
 *
 * Voice contract: the rendered card contains NO AGENTS.md banned word
 * (journey / amazing / exciting / elevate / empower / synergy) — LESSONS#0023.
 *
 * .test.ts NOT .spec.ts (LESSONS#38) — even .tsx tests follow this rule.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReferralCelebrationCard } from '@/components/home/referral-celebration-card';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface MockPayload {
  show: boolean;
  message: string | null;
  currentCount: number;
  latestFirstName: string | null;
}

function mockCelebrationFetch(payload: MockPayload) {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/referrals/celebration/seen')) {
      return new Response(null, { status: 204 });
    }
    if (url.includes('/api/referrals/celebration')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
  return fetchSpy;
}

describe('ReferralCelebrationCard (ticket 0047)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the named message + invite CTA when show:true', async () => {
    mockCelebrationFetch({
      show: true,
      message: 'Coach Maya you invited just joined SportsIQ',
      currentCount: 1,
      latestFirstName: 'Maya',
    });

    render(<ReferralCelebrationCard />, { wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(/Coach Maya you invited just joined SportsIQ/),
      ).toBeInTheDocument();
    });
    // The CTA matches the AC verbatim.
    expect(
      screen.getByRole('button', { name: /invite another coach/i }),
    ).toBeInTheDocument();
  });

  it('renders nothing when show:false (no nag for coaches with no new conversions)', async () => {
    mockCelebrationFetch({
      show: false,
      message: null,
      currentCount: 3,
      latestFirstName: null,
    });
    const { container } = render(<ReferralCelebrationCard />, { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent ?? '').not.toMatch(/just joined/i);
    expect(container.textContent ?? '').not.toMatch(/invite another coach/i);
  });

  it('POSTs the seen route exactly once on first render with show:true', async () => {
    const fetchSpy = mockCelebrationFetch({
      show: true,
      message: 'Coach Maya you invited just joined SportsIQ',
      currentCount: 1,
      latestFirstName: 'Maya',
    });

    render(<ReferralCelebrationCard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/just joined SportsIQ/)).toBeInTheDocument();
    });

    await waitFor(() => {
      const seenCalls = fetchSpy.mock.calls.filter((c) => {
        const url = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        return url.includes('/api/referrals/celebration/seen');
      });
      expect(seenCalls.length).toBe(1);
    });
  });

  it('does NOT POST the seen route when show:false', async () => {
    const fetchSpy = mockCelebrationFetch({
      show: false,
      message: null,
      currentCount: 0,
      latestFirstName: null,
    });

    render(<ReferralCelebrationCard />, { wrapper });
    await new Promise((r) => setTimeout(r, 20));

    const seenCalls = fetchSpy.mock.calls.filter((c) => {
      const url = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
      return url.includes('/api/referrals/celebration/seen');
    });
    expect(seenCalls.length).toBe(0);
  });

  it('renders the anonymous-fallback message when latestFirstName is null', async () => {
    mockCelebrationFetch({
      show: true,
      message: 'Someone you invited just joined SportsIQ',
      currentCount: 1,
      latestFirstName: null,
    });
    render(<ReferralCelebrationCard />, { wrapper });

    await waitFor(() => {
      expect(
        screen.getByText(/Someone you invited just joined SportsIQ/),
      ).toBeInTheDocument();
    });
  });

  it('rendered card avoids the AGENTS.md banned tokens', async () => {
    mockCelebrationFetch({
      show: true,
      message: 'Coach Maya you invited just joined SportsIQ',
      currentCount: 1,
      latestFirstName: 'Maya',
    });
    render(<ReferralCelebrationCard />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/just joined SportsIQ/)).toBeInTheDocument();
    });

    const lower = (document.body.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(lower).not.toContain(banned);
    }
  });
});
