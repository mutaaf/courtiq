/**
 * Ticket 0067 — GET /api/sub-handoff/recent-notes and
 * POST /api/sub-handoff/recent-notes/seen.
 *
 * The /home <SubNoteCard /> reads the GET; tapping Got-it POSTs the seen
 * route which marks every returned handoff row's sub_note_seen_at = now().
 *
 * Acceptance criteria → tests:
 *  - GET 401 when unauthed.
 *  - GET returns only handoffs where sub_note_at IS NOT NULL AND
 *    sub_note_seen_at IS NULL, within the last 7 days, ordered desc.
 *  - GET truncates the note text in the line payload (120 chars).
 *  - POST 401 when unauthed.
 *  - POST sets sub_note_seen_at = now() on every row in the GET response.
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#38). AUTHED — never public.
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

import { GET as recentGET } from '@/app/api/sub-handoff/recent-notes/route';
import { POST as seenPOST } from '@/app/api/sub-handoff/recent-notes/seen/route';

const COACH_ID = 'coach-1';

function buildChain(data: unknown = null, error: unknown = null) {
  const resolved = { data, error };
  const calls: { method: string; args: unknown[] }[] = [];
  const chain: Record<string, unknown> = {
    select: vi.fn((...a: unknown[]) => { calls.push({ method: 'select', args: a }); return chain; }),
    update: vi.fn((...a: unknown[]) => { calls.push({ method: 'update', args: a }); return chain; }),
    eq: vi.fn((...a: unknown[]) => { calls.push({ method: 'eq', args: a }); return chain; }),
    is: vi.fn((...a: unknown[]) => { calls.push({ method: 'is', args: a }); return chain; }),
    not: vi.fn((...a: unknown[]) => { calls.push({ method: 'not', args: a }); return chain; }),
    gte: vi.fn((...a: unknown[]) => { calls.push({ method: 'gte', args: a }); return chain; }),
    in: vi.fn((...a: unknown[]) => { calls.push({ method: 'in', args: a }); return chain; }),
    order: vi.fn((...a: unknown[]) => { calls.push({ method: 'order', args: a }); return chain; }),
    limit: vi.fn(() => chain),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
    __calls: calls,
  };
  return chain;
}

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

describe('GET /api/sub-handoff/recent-notes (ticket 0067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('401 when unauthed', async () => {
    setAuthUser(null);
    const res = await recentGET();
    expect(res.status).toBe(401);
  });

  it('returns unread sub-notes from the last 7 days, ordered desc, with truncated text', async () => {
    setAuthUser();
    const longText = 'a'.repeat(200);
    const rows = [
      {
        id: 'h-1',
        sub_first_name: 'Mark',
        sub_note_text: longText,
        sub_note_at: '2026-06-03T22:00:00Z',
        session_id: '00000000-0000-4000-a000-000000000040',
      },
      {
        id: 'h-2',
        sub_first_name: 'Sam',
        sub_note_text: 'all 12 showed',
        sub_note_at: '2026-05-30T19:00:00Z',
        session_id: '00000000-0000-4000-a000-000000000041',
      },
    ];
    mockFromFn.mockReturnValueOnce(buildChain(rows));

    const res = await recentGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: Array<{ truncatedText: string; subFirstName: string }> };
    expect(body.lines).toHaveLength(2);
    expect(body.lines[0].subFirstName).toBe('Mark');
    // Truncated to 120 chars.
    expect(body.lines[0].truncatedText.length).toBeLessThanOrEqual(120);
  });

  it('returns an empty payload when there are no unread notes', async () => {
    setAuthUser();
    mockFromFn.mockReturnValueOnce(buildChain([]));
    const res = await recentGET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { lines: unknown[] };
    expect(body.lines).toEqual([]);
  });
});

describe('POST /api/sub-handoff/recent-notes/seen (ticket 0067)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('401 when unauthed', async () => {
    setAuthUser(null);
    const res = await seenPOST();
    expect(res.status).toBe(401);
  });

  it('updates sub_note_seen_at on every matching row', async () => {
    setAuthUser();
    const updateChain = buildChain({ count: 2 });
    mockFromFn.mockReturnValueOnce(updateChain);
    const res = await seenPOST();
    expect(res.status).toBe(200);
    expect(mockFromFn).toHaveBeenCalledWith('sub_handoffs');
  });
});
