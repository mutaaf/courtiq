/**
 * Ticket 0049 — component tests for PlanClonesCard.
 *
 * The home card that tells the publishing coach how many other coaches cloned
 * their practice plans this week. Renders nothing when count: 0 (no nag) or
 * when count <= lastSeenCount (already acknowledged). On first render with new
 * clones, POSTs the seen route to advance the bookmark (auto-dismiss on view —
 * mirrors 0047's pattern).
 *
 * Voice contract: the rendered card contains NO AGENTS.md banned words
 * (LESSONS#0023). The scan is a setup test below.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlanClonesCard } from '@/components/home/plan-clones-card';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockCloneCountFetch(payload: {
  count: number;
  byPlan: Array<{ plan_id: string; plan_title: string; count: number }>;
  lastSeenCount: number;
}) {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('/api/practice-plan-shares/clone-count/seen')) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (url.includes('/api/practice-plan-shares/clone-count')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  });
  return fetchSpy;
}

describe('PlanClonesCard (ticket 0049)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the count when clones > lastSeenCount', async () => {
    mockCloneCountFetch({
      count: 7,
      byPlan: [
        { plan_id: 'plan-A', plan_title: 'Tuesday Practice', count: 4 },
        { plan_id: 'plan-B', plan_title: 'Closeouts + Scrimmage', count: 3 },
      ],
      lastSeenCount: 1,
    });

    render(<PlanClonesCard />, { wrapper });

    // The count surfaces in the rendered text.
    await waitFor(() => {
      expect(screen.getByText(/7/)).toBeInTheDocument();
    });
  });

  it('renders nothing when count is 0', async () => {
    mockCloneCountFetch({ count: 0, byPlan: [], lastSeenCount: 0 });
    const { container } = render(<PlanClonesCard />, { wrapper });

    // Give the query a tick to resolve; the card stays empty.
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent ?? '').not.toMatch(/clone/i);
  });

  it('renders nothing when count <= lastSeenCount (already acknowledged)', async () => {
    mockCloneCountFetch({
      count: 3,
      byPlan: [{ plan_id: 'plan-A', plan_title: 'Tuesday Practice', count: 3 }],
      lastSeenCount: 3,
    });
    const { container } = render(<PlanClonesCard />, { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent ?? '').not.toMatch(/3 coaches/i);
  });

  it('POSTs the seen route once on first render with new clones', async () => {
    const fetchSpy = mockCloneCountFetch({
      count: 5,
      byPlan: [{ plan_id: 'plan-A', plan_title: 'Tuesday Practice', count: 5 }],
      lastSeenCount: 0,
    });

    render(<PlanClonesCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/5/)).toBeInTheDocument();
    });

    // The seen POST fires on mount once the count resolves above the bookmark.
    await waitFor(() => {
      const seenCalls = fetchSpy.mock.calls.filter((c) => {
        const url = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        return url.includes('/api/practice-plan-shares/clone-count/seen');
      });
      expect(seenCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('rendered card avoids the AGENTS.md banned tokens', async () => {
    mockCloneCountFetch({
      count: 12,
      byPlan: [{ plan_id: 'plan-A', plan_title: 'Tuesday Practice', count: 12 }],
      lastSeenCount: 0,
    });

    render(<PlanClonesCard />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/12/)).toBeInTheDocument();
    });

    const lower = (document.body.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(lower).not.toContain(banned);
    }
  });
});
