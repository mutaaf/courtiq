/**
 * Ticket 0055 — component tests for <LeaguePlansSection />.
 *
 * The new section that lives at the TOP of /plans (above the AI-suggested
 * plan card and above the drill library). Reads the league-discovery payload
 * via the existing `query()` helper → /api/practice-plan-shares/league?teamId=,
 * and renders one row per peer plan with a "Save to my team" button that POSTs
 * the EXISTING /api/practice-plan-shares/clone route (shipped by 0049).
 *
 * Behaviors under test:
 *  - eligible:true with 3 plans  → 3 rows + 3 save buttons
 *  - eligible:false              → renders nothing
 *  - eligible:true with plans[]  → renders nothing (no nag)
 *  - clicking "Save to my team"  → POSTs /api/practice-plan-shares/clone
 *    with { token, teamId }
 *  - voice contract: rendered DOM contains NO AGENTS.md banned tokens
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LeaguePlansSection } from '@/components/plan/league-plans-section';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface LeagueFetchPayload {
  eligible: boolean;
  plans: Array<{
    token: string;
    planTitle: string;
    publishedAt: string;
    coachFirstName: string | null;
    sportSlug: string;
    ageGroup: string | null;
    sourcePlanId: string;
    note: string | null;
  }>;
}

function mockLeagueFetch(payload: LeagueFetchPayload, cloneOk = true) {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    if (url.startsWith('/api/data')) {
      // The query() helper POSTs /api/data with { table, ... }. The league
      // section does NOT use /api/data — but if a parent test ever calls it,
      // return an empty array so nothing crashes.
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }
    if (url.includes('/api/practice-plan-shares/league')) {
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/practice-plan-shares/clone')) {
      return new Response(
        JSON.stringify(cloneOk ? { planId: 'cloned-plan-1' } : { error: 'denied' }),
        { status: cloneOk ? 200 : 400 },
      );
    }
    return new Response('not found', { status: 404 });
  });
  return spy;
}

const ACTIVE_TEAM_ID = 'team-active-1';

function makePlan(i: number, coachFirstName: string, planTitle: string) {
  return {
    token: `tok-${i}`,
    planTitle,
    publishedAt: '2026-05-27T20:00:00.000Z',
    coachFirstName,
    sportSlug: 'flag_football',
    ageGroup: '8',
    sourcePlanId: `plan-${i}`,
    note: null,
  };
}

describe('LeaguePlansSection (ticket 0055)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders 3 rows + 3 save buttons when the route returns eligible:true with 3 plans', async () => {
    mockLeagueFetch({
      eligible: true,
      plans: [
        makePlan(1, 'James', 'Tuesday catch-up'),
        makePlan(2, 'Sarah', 'Closeout passing'),
        makePlan(3, 'Maya', '30-minute station rotation'),
      ],
    });

    render(<LeaguePlansSection teamId={ACTIVE_TEAM_ID} />, { wrapper });

    // Each plan title appears. The title shows up in BOTH the heading line
    // AND the formatted row line (Coach <first> — <title> — <sport> age <ag>)
    // by design, so we use getAllByText for the heading and trust the row
    // testid below for the count.
    await waitFor(() => {
      const titles = screen.getAllByText(/Tuesday catch-up/);
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText(/Closeout passing/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/30-minute station rotation/).length).toBeGreaterThanOrEqual(1);

    // Three rows render in total.
    const rows = screen.getAllByTestId('league-plan-row');
    expect(rows.length).toBe(3);

    // Each row has a "Save to my team" CTA. The accessible name matches case-
    // insensitive — the canonical label is "Save to my team" exactly.
    const buttons = await screen.findAllByRole('button', { name: /save to my team/i });
    expect(buttons.length).toBe(3);
  });

  it('renders nothing when eligible:false (the solo-coach case)', async () => {
    mockLeagueFetch({ eligible: false, plans: [] });
    const { container } = render(<LeaguePlansSection teamId={ACTIVE_TEAM_ID} />, { wrapper });

    // Give the query a tick.
    await new Promise((r) => setTimeout(r, 10));
    // The section container's testid is absent OR empty — either way, no rows render.
    expect(screen.queryByText(/from your league/i)).toBeNull();
    expect(container.querySelector('[data-testid="league-plans-section"]')).toBeNull();
  });

  it('renders nothing when eligible:true but the plans array is empty', async () => {
    mockLeagueFetch({ eligible: true, plans: [] });
    render(<LeaguePlansSection teamId={ACTIVE_TEAM_ID} />, { wrapper });
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.queryByText(/from your league/i)).toBeNull();
  });

  it('clicking "Save to my team" POSTs /api/practice-plan-shares/clone with the right token + teamId', async () => {
    const fetchSpy = mockLeagueFetch({
      eligible: true,
      plans: [makePlan(1, 'James', 'Tuesday catch-up')],
    });

    render(<LeaguePlansSection teamId={ACTIVE_TEAM_ID} />, { wrapper });

    const btn = await screen.findByRole('button', { name: /save to my team/i });
    fireEvent.click(btn);

    await waitFor(() => {
      const cloneCalls = fetchSpy.mock.calls.filter((c) => {
        const url = typeof c[0] === 'string' ? c[0] : (c[0] as Request).url;
        return url.includes('/api/practice-plan-shares/clone') &&
          !url.includes('clone-count');
      });
      expect(cloneCalls.length).toBe(1);
      const init = cloneCalls[0][1] as RequestInit | undefined;
      expect(init?.method).toBe('POST');
      const body = JSON.parse((init?.body as string) ?? '{}');
      expect(body.token).toBe('tok-1');
      expect(body.teamId).toBe(ACTIVE_TEAM_ID);
    });
  });

  it('rendered text avoids the AGENTS.md banned voice tokens', async () => {
    mockLeagueFetch({
      eligible: true,
      plans: [
        makePlan(1, 'James', 'Tuesday catch-up'),
        makePlan(2, 'Sarah', 'Closeout passing'),
      ],
    });

    render(<LeaguePlansSection teamId={ACTIVE_TEAM_ID} />, { wrapper });
    await waitFor(() => {
      const titles = screen.getAllByText(/Tuesday catch-up/);
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    const lower = (document.body.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(lower).not.toContain(banned);
    }
  });
});
