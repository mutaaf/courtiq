/**
 * Ticket 0044 — `<NextDrillSuggestions>` block on the drill detail page.
 *
 * The component reads:
 *   GET /api/drill-sequence-suggestions?drillId=...&sport=...
 *   GET /api/data { table: 'coach_drill_signals', filters: { drill_id, signal_type: 'dismiss_suggestion' } }
 *
 * And writes:
 *   POST /api/data/mutate { table: 'coach_drill_signals', operation: 'insert', data: { drill_id, signal_type: 'dismiss_suggestion', rating: 'down' } }
 *
 * AC mapped:
 *  - renders ≥1 row → up to 3 items with `{title} — {N} coaches`.
 *  - server returns empty → renders NOTHING (no "0 coaches" copy, no empty
 *    state). The wrapper container is also absent (so the page is byte-
 *    identical to the no-suggestions case).
 *  - a `dismiss_suggestion` signal for the caller + drill exists → renders
 *    NOTHING (the COACH dismissed it; the global aggregate is untouched).
 *  - tapping "hide these suggestions" writes the dismiss signal via mutate()
 *    (NEVER direct Supabase — AGENTS.md rule 3).
 *  - clipboard voice; no banned breathless words; no emoji-decorated heading.
 *
 * Pattern mirrors tests/components/prior-season-link-control.test.tsx for
 * the mutate() spy and tests/components/recap-share-button.test.tsx for the
 * fetch-mock approach. We mock `@/lib/api`'s `query` and `mutate` directly
 * because the component issues TWO query() calls (suggestions + dismiss-
 * signal check) and one mutate() (the hide tap).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { mockQuery, mockMutate } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockMutate: vi.fn(),
}));

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, query: mockQuery, mutate: mockMutate };
});

import { NextDrillSuggestions } from '@/components/drills/next-drill-suggestions';

const DRILL_ID = '00000000-0000-4000-a000-0000000000a1';
const NEXT_B = '00000000-0000-4000-a000-0000000000b1';
const NEXT_C = '00000000-0000-4000-a000-0000000000c1';
const NEXT_D = '00000000-0000-4000-a000-0000000000d1';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

// The component fetches:
//   1. /api/drill-sequence-suggestions (via plain fetch — NOT query())
//   2. /api/data via query() for the dismiss signal
function mockSuggestionsFetch(suggestions: Array<Record<string, unknown>>) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.includes('/api/drill-sequence-suggestions')) {
      return new Response(JSON.stringify({ suggestions }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('{}', { status: 200 });
  });
}

describe('<NextDrillSuggestions> — render shape (ticket 0044)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockQuery.mockReset();
    mockMutate.mockReset();
    // Default: no dismiss-signal for the caller + drill.
    mockQuery.mockResolvedValue([]);
  });

  it('renders up to 3 suggestion rows with `{title} — {N} coaches`', async () => {
    mockSuggestionsFetch([
      { next_drill_id: NEXT_B, next_drill_title: 'Close-out drill', coach_count: 18, sport: 'basketball' },
      { next_drill_id: NEXT_C, next_drill_title: 'Elbow shooting',  coach_count: 14, sport: 'basketball' },
      { next_drill_id: NEXT_D, next_drill_title: 'Three-on-three',  coach_count: 12, sport: 'basketball' },
    ]);

    render(<NextDrillSuggestions drillId={DRILL_ID} sport="basketball" />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Close-out drill')).toBeInTheDocument();
    });
    expect(screen.getByText('Elbow shooting')).toBeInTheDocument();
    expect(screen.getByText('Three-on-three')).toBeInTheDocument();
    // The "— N coaches" companion line — one per row.
    expect(screen.getByText(/18 coaches/i)).toBeInTheDocument();
    expect(screen.getByText(/14 coaches/i)).toBeInTheDocument();
    expect(screen.getByText(/12 coaches/i)).toBeInTheDocument();

    // Stable testid for the e2e spec to target (LESSONS#81 — anchor a
    // dedicated testid; never page-wide getByText on a substring).
    expect(screen.getByTestId('next-drill-suggestions')).toBeInTheDocument();
  });

  it('renders NOTHING when the route returns an empty array (no testid, no copy)', async () => {
    mockSuggestionsFetch([]);
    const { container } = render(
      <NextDrillSuggestions drillId={DRILL_ID} sport="basketball" />,
      { wrapper },
    );
    // Give the (resolved) query time to settle.
    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('next-drill-suggestions')).not.toBeInTheDocument();
    // No banner / empty-state copy either — AC says "renders NOTHING".
    expect(container.textContent).not.toMatch(/0 coaches/i);
    expect(container.textContent).not.toMatch(/no suggestions/i);
  });

  it('renders NOTHING when the caller has a dismiss_suggestion signal for this drill', async () => {
    mockSuggestionsFetch([
      { next_drill_id: NEXT_B, next_drill_title: 'Close-out drill', coach_count: 18, sport: 'basketball' },
    ]);
    // The dismiss-signal check returns one row → component must hide.
    mockQuery.mockResolvedValueOnce([
      { coach_id: 'auth-coach-1', drill_id: DRILL_ID, signal_type: 'dismiss_suggestion' },
    ]);

    render(<NextDrillSuggestions drillId={DRILL_ID} sport="basketball" />, { wrapper });
    await waitFor(() => {
      expect(mockQuery).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('next-drill-suggestions')).not.toBeInTheDocument();
    expect(screen.queryByText('Close-out drill')).not.toBeInTheDocument();
  });
});

describe('<NextDrillSuggestions> — hide tap (ticket 0044)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockQuery.mockReset();
    mockMutate.mockReset();
    mockQuery.mockResolvedValue([]);
    mockMutate.mockResolvedValue([{ coach_id: 'auth-coach-1', drill_id: DRILL_ID, signal_type: 'dismiss_suggestion' }]);
  });

  it('"hide these suggestions" writes the dismiss signal via mutate() (NEVER direct Supabase)', async () => {
    mockSuggestionsFetch([
      { next_drill_id: NEXT_B, next_drill_title: 'Close-out drill', coach_count: 18, sport: 'basketball' },
    ]);

    render(<NextDrillSuggestions drillId={DRILL_ID} sport="basketball" />, { wrapper });

    const hideBtn = await screen.findByRole('button', { name: /hide these suggestions/i });
    fireEvent.click(hideBtn);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          table: 'coach_drill_signals',
          operation: 'insert',
          data: expect.objectContaining({
            drill_id: DRILL_ID,
            signal_type: 'dismiss_suggestion',
          }),
        }),
      );
    });
  });

  it('after a successful dismiss, the suggestions disappear from the surface', async () => {
    mockSuggestionsFetch([
      { next_drill_id: NEXT_B, next_drill_title: 'Close-out drill', coach_count: 18, sport: 'basketball' },
    ]);

    render(<NextDrillSuggestions drillId={DRILL_ID} sport="basketball" />, { wrapper });
    const hideBtn = await screen.findByRole('button', { name: /hide these suggestions/i });
    fireEvent.click(hideBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('next-drill-suggestions')).not.toBeInTheDocument();
    });
  });
});

describe('<NextDrillSuggestions> — voice + accessibility', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
    mockQuery.mockReset();
    mockMutate.mockReset();
    mockQuery.mockResolvedValue([]);
  });

  it('uses clipboard voice with no banned breathless words and no emoji heading', async () => {
    mockSuggestionsFetch([
      { next_drill_id: NEXT_B, next_drill_title: 'Close-out drill', coach_count: 18, sport: 'basketball' },
    ]);

    const { container } = render(
      <NextDrillSuggestions drillId={DRILL_ID} sport="basketball" />,
      { wrapper },
    );
    await screen.findByText('Close-out drill');

    const text = (container.textContent || '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text).not.toContain(banned);
    }
    // No emoji-decorated headings (AGENTS.md rule 7).
    expect(container.textContent || '').not.toMatch(
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u,
    );
  });
});
