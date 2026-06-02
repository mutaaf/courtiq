/**
 * Ticket 0063 — <FromCoachesYouFollowSection /> component tests.
 *
 * The new section that lives at the TOP of /plans (above the existing 0055
 * "From your league" section). Reads /api/practice-plan-shares/from-follows
 * via fetch. Renders one card per result with a Save-to-my-team button that
 * POSTs the EXISTING /api/practice-plan-shares/clone route (shipped by 0049).
 *
 * Behaviors under test:
 *  - eligible payload with 2 plans → 2 rows + 2 save buttons; section title
 *    includes the count "(2)".
 *  - empty payload → renders nothing (silence beats an empty state).
 *  - a network failure → DOES NOT throw; renders nothing.
 *  - clicking "Save to my team" → POSTs /api/practice-plan-shares/clone.
 *  - voice contract: rendered DOM contains NO AGENTS.md banned tokens.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FromCoachesYouFollowSection } from '@/components/plan/from-coaches-you-follow-section';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface FromFollowsPlan {
  token: string;
  planTitle: string;
  publisherFirstName: string;
  publisherDisplaySport: string;
  ageGroup: string | null;
  createdAt: string;
}

function mockFromFollows(plans: FromFollowsPlan[] | 'error', cloneOk = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;

    if (url.includes('/api/practice-plan-shares/from-follows')) {
      if (plans === 'error') {
        return new Response('boom', { status: 500 });
      }
      return new Response(JSON.stringify({ plans }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/api/practice-plan-shares/clone')) {
      return new Response(
        JSON.stringify(cloneOk ? { planId: 'cloned-1' } : { error: 'denied' }),
        { status: cloneOk ? 200 : 400 },
      );
    }
    return new Response('not found', { status: 404 });
  });
}

const TEAM_ID = 'team-active-1';
const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('<FromCoachesYouFollowSection /> (ticket 0063)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders 2 rows with a count of (2) when there are 2 plans', async () => {
    mockFromFollows([
      {
        token: 'tok-A',
        planTitle: 'Tuesday Closeouts',
        publisherFirstName: 'James',
        publisherDisplaySport: 'Basketball',
        ageGroup: '11-13',
        createdAt: '2026-06-01T10:00:00.000Z',
      },
      {
        token: 'tok-B',
        planTitle: 'Scrimmage Day',
        publisherFirstName: 'Sarah',
        publisherDisplaySport: 'Flag Football',
        ageGroup: '9-10',
        createdAt: '2026-05-30T10:00:00.000Z',
      },
    ]);

    render(<FromCoachesYouFollowSection teamId={TEAM_ID} />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('from-follows-section')).toBeTruthy();
    });
    const rows = screen.getAllByTestId('from-follows-row');
    expect(rows).toHaveLength(2);

    // Count appears in the section title.
    const section = screen.getByTestId('from-follows-section');
    expect(section.textContent).toContain('(2)');
  });

  it('renders nothing when the payload is empty', async () => {
    mockFromFollows([]);

    render(<FromCoachesYouFollowSection teamId={TEAM_ID} />, { wrapper });

    // Give react-query a tick to settle and confirm the section never mounts.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId('from-follows-section')).toBeNull();
  });

  it('does NOT throw when the network fails — section just renders nothing', async () => {
    mockFromFollows('error');

    expect(() => render(<FromCoachesYouFollowSection teamId={TEAM_ID} />, { wrapper })).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(screen.queryByTestId('from-follows-section')).toBeNull();
  });

  it('Save to my team POSTs /api/practice-plan-shares/clone with token + teamId', async () => {
    const fetchSpy = mockFromFollows([
      {
        token: 'tok-A',
        planTitle: 'Tuesday Closeouts',
        publisherFirstName: 'James',
        publisherDisplaySport: 'Basketball',
        ageGroup: '11-13',
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    ]);

    render(<FromCoachesYouFollowSection teamId={TEAM_ID} />, { wrapper });

    const saveBtn = await screen.findByTestId('from-follows-save-button');
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const cloneCall = fetchSpy.mock.calls.find((c) =>
        String(c[0]).includes('/api/practice-plan-shares/clone'),
      );
      expect(cloneCall).toBeTruthy();
      const init = cloneCall?.[1] as RequestInit | undefined;
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.token).toBe('tok-A');
      expect(body.teamId).toBe(TEAM_ID);
    });
  });

  it('voice contract: no AGENTS.md banned token in the rendered DOM', async () => {
    mockFromFollows([
      {
        token: 'tok-A',
        planTitle: 'Tuesday Closeouts',
        publisherFirstName: 'James',
        publisherDisplaySport: 'Basketball',
        ageGroup: '11-13',
        createdAt: '2026-06-01T10:00:00.000Z',
      },
    ]);

    const { container } = render(<FromCoachesYouFollowSection teamId={TEAM_ID} />, { wrapper });
    await waitFor(() => {
      expect(screen.getByTestId('from-follows-section')).toBeTruthy();
    });
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});
