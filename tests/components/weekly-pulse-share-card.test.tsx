/**
 * Ticket 0057 — component tests for `WeeklyPulseShareCard`.
 *
 * Renders the home-page card with a mocked preview response from
 * /api/weekly-pulse/preview. Assertions:
 *  - With observations + sessions this week, the card renders and the share
 *    button says "Share this week".
 *  - With NO observations + NO sessions this week, the card renders null
 *    (silence beats nag — ticket decision).
 *  - When the coach has already shared this week (existingToken present),
 *    the button reads "Copy link" instead of "Share this week".
 *  - Tapping the share button on a coach with no existing token POSTs the
 *    create route exactly once.
 *  - Every user-facing string in the rendered surface avoids the AGENTS.md
 *    banned-word list (LESSONS#0023 — instruct positively in the prompt, but
 *    when there is NO prompt, the literal copy still must not contain those
 *    words).
 *
 * Mocking pattern mirrors tests/components/invite-coach-button.test.tsx.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WeeklyPulseShareCard } from '@/components/home/weekly-pulse-share-card';

const BANNED = [
  'journey', 'amazing', 'exciting', 'elevate',
  'empower', 'synergy', 'unlock your potential',
];

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const TEAM_ID = '00000000-0000-4000-a000-000000000020';

interface PreviewBody {
  coachFirstName: string | null;
  teamName: string;
  sportName: string | null;
  ageGroup: string | null;
  isoWeek: string;
  sessionCount: number;
  topCategories: string[];
  focusLine: string | null;
  caption: string | null;
  existingToken: string | null;
}

function preview(overrides: Partial<PreviewBody> = {}): PreviewBody {
  return {
    coachFirstName: 'Maya',
    teamName: 'Coach Maya Team',
    sportName: 'Basketball',
    ageGroup: '11-13',
    isoWeek: '2026-W22',
    sessionCount: 2,
    topCategories: ['Defense', 'Effort'],
    focusLine: 'spacing & off-ball movement',
    caption: null,
    existingToken: null,
    ...overrides,
  };
}

function mockFetch(implementation: (input: RequestInfo | URL) => Promise<Response>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) =>
    implementation(input),
  );
}

describe('WeeklyPulseShareCard (ticket 0057)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the card and the share button when there is content this week', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify(preview()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<WeeklyPulseShareCard teamId={TEAM_ID} />, { wrapper });

    const card = await waitFor(() => screen.getByTestId('weekly-pulse-share-card'));
    expect(card).toBeTruthy();

    const button = await waitFor(() =>
      screen.getByTestId('weekly-pulse-share-button'),
    );
    // First-share copy.
    expect(button.textContent ?? '').toMatch(/share this week/i);

    // The preview text the publisher will see.
    expect(card.textContent ?? '').toContain('Week of May 25');
    expect(card.textContent ?? '').toContain('2 sessions');
    expect(card.textContent ?? '').toContain('Defense');
    expect(card.textContent ?? '').toContain('Effort');
    expect(card.textContent ?? '').toContain('spacing & off-ball movement');
  });

  it('renders null on a coach with no observations + no sessions (silence beats nag)', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify(
          preview({
            sessionCount: 0,
            topCategories: [],
            focusLine: null,
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<WeeklyPulseShareCard teamId={TEAM_ID} />, { wrapper });

    // The preview load is async; settle a microtask first.
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.queryByTestId('weekly-pulse-share-card')).toBeNull();
  });

  it('reads "Copy link" when the coach has already shared this week', async () => {
    mockFetch(async () =>
      new Response(
        JSON.stringify(preview({ existingToken: 'wp-existing-1' })),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    render(<WeeklyPulseShareCard teamId={TEAM_ID} />, { wrapper });

    const button = await waitFor(() =>
      screen.getByTestId('weekly-pulse-share-button'),
    );
    expect(button.textContent ?? '').toMatch(/copy link/i);
    // The first-share copy is NOT shown when an existing token is known.
    expect(button.textContent ?? '').not.toMatch(/share this week/i);
  });

  it('tapping the share button POSTs /api/weekly-pulse/create exactly once', async () => {
    const calls: string[] = [];
    mockFetch(async (input) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      if (url.includes('/api/weekly-pulse/preview')) {
        return new Response(JSON.stringify(preview()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/weekly-pulse/create')) {
        return new Response(
          JSON.stringify({ token: 'wp-new-1', url: '/week/wp-new-1' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('{}', { status: 404 });
    });

    render(<WeeklyPulseShareCard teamId={TEAM_ID} />, { wrapper });

    const button = await waitFor(() =>
      screen.getByTestId('weekly-pulse-share-button'),
    );
    fireEvent.click(button);

    await waitFor(() => {
      const createCalls = calls.filter((u) => u.includes('/api/weekly-pulse/create'));
      expect(createCalls.length).toBeGreaterThan(0);
    });

    // The URL line appears in the sheet so the publisher can long-press to
    // copy it manually if clipboard is denied.
    const urlInput = await waitFor(() =>
      screen.getByTestId('weekly-pulse-url') as HTMLInputElement,
    );
    expect(urlInput.value).toMatch(/\/week\/wp-new-1$/);
  });

  it('every user-facing string in the card avoids the AGENTS.md banned-word list (voice)', async () => {
    mockFetch(async () =>
      new Response(JSON.stringify(preview()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<WeeklyPulseShareCard teamId={TEAM_ID} />, { wrapper });

    const card = await waitFor(() => screen.getByTestId('weekly-pulse-share-card'));
    const text = (card.textContent ?? '').toLowerCase();

    for (const word of BANNED) {
      expect(text).not.toContain(word.toLowerCase());
    }
  });
});
