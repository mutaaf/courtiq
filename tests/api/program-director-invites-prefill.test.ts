/**
 * Ticket 0065 — GET /api/program-director-invites/contact-prefill.
 *
 * The share-sheet section opens, the component fetches this once on mount,
 * and pre-fills the director-name input + shows the masked email as visual
 * confirmation that "yes, you have a contact already." The raw email is
 * NEVER returned to the client — the coach re-types the address (the mask
 * is a hint, not a hidden field).
 *
 * Mocking pattern mirrors tests/api/drill-shares-mine.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
  createServiceSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: mockFromFn,
  })),
}));

import { GET } from '@/app/api/program-director-invites/contact-prefill/route';

function buildChain(data: unknown = null) {
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = 'coach-uuid-001';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

describe('GET /api/program-director-invites/contact-prefill (ticket 0065)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET();
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns hasContact:false when the coach has no contacts', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain(null));
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { hasContact?: boolean };
    expect(body.hasContact).toBe(false);
  });

  it('returns the most-recent contact with the email MASKED, never raw', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(
      buildChain({
        id: 'cdc-1',
        coach_id: COACH_ID,
        director_first_name: 'Mike',
        director_email: 'mike@league.test',
        last_invited_at: '2026-06-01T00:00:00Z',
        invite_count: 3,
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      hasContact?: boolean;
      directorFirstName?: string;
      directorEmailMasked?: string;
    };
    expect(body.hasContact).toBe(true);
    expect(body.directorFirstName).toBe('Mike');
    expect(body.directorEmailMasked).toBe('m***@league.test');

    // The raw email is NEVER in the response — the COPPA + privacy contract.
    const raw = await new Response(JSON.stringify(body)).text();
    expect(raw).not.toContain('mike@league.test');
    // Belt-and-braces: the body object never carries a `directorEmail` key.
    expect((body as Record<string, unknown>).directorEmail).toBeUndefined();
  });
});
