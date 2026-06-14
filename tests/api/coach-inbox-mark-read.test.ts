/**
 * Ticket 0081 — POST /api/coach/inbox/mark-read.
 *
 * Stamps `read_at = NOW()` on rows where the caller is the
 * `recipient_coach_id` AND the row id is in the supplied
 * `messageIds` array. The publisher can NEVER mark someone else's
 * message read — that's the recipient-only update contract.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

import { POST } from '@/app/api/coach/inbox/mark-read/route';

const RECIPIENT_ID = '00000000-0000-4000-a000-0000000000d9';

describe('POST /api/coach/inbox/mark-read (ticket 0081)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromFn.mockReset();
  });

  it('returns 401 when no user is authed', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const req = new Request('http://t/api/coach/inbox/mark-read', {
      method: 'POST',
      body: JSON.stringify({ messageIds: ['m-1'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('updates rows owned by the caller and returns the count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    const eqCalls: Array<[string, unknown]> = [];
    const inCalls: Array<[string, unknown]> = [];
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        const chain: Record<string, unknown> = {
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: unknown) => {
            eqCalls.push([col, val]);
            return chain;
          }),
          in: vi.fn().mockImplementation((col: string, val: unknown) => {
            inCalls.push([col, val]);
            return chain;
          }),
          is: vi.fn().mockReturnThis(),
          then: (
            onFulfilled: (v: {
              data: Array<{ id: string }>;
              error: null;
            }) => unknown,
          ) =>
            Promise.resolve({
              data: [{ id: 'm-1' }, { id: 'm-2' }],
              error: null,
            }).then(onFulfilled),
        };
        return chain;
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const req = new Request('http://t/api/coach/inbox/mark-read', {
      method: 'POST',
      body: JSON.stringify({ messageIds: ['m-1', 'm-2', 'foreign-1'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { updated: number };
    expect(body.updated).toBe(2);
    // The route scopes the update to recipient_coach_id = caller AND
    // id IN (messageIds). Foreign ids are silently ignored at the DB
    // level via the recipient_coach_id eq filter.
    expect(eqCalls).toContainEqual(['recipient_coach_id', RECIPIENT_ID]);
    expect(inCalls).toContainEqual(['id', ['m-1', 'm-2', 'foreign-1']]);
  });

  it('foreign rows are silently ignored (the eq scope is recipient_coach_id=caller)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    let scopedEq = false;
    mockFromFn.mockImplementation((table: string) => {
      if (table === 'coach_thank_messages') {
        const chain: Record<string, unknown> = {
          update: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: unknown) => {
            if (col === 'recipient_coach_id' && val === RECIPIENT_ID) {
              scopedEq = true;
            }
            return chain;
          }),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          then: (
            onFulfilled: (v: {
              data: Array<{ id: string }>;
              error: null;
            }) => unknown,
          ) => Promise.resolve({ data: [], error: null }).then(onFulfilled),
        };
        return chain;
      }
      throw new Error(`Unexpected from(${table})`);
    });
    const req = new Request('http://t/api/coach/inbox/mark-read', {
      method: 'POST',
      body: JSON.stringify({ messageIds: ['foreign-1'] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(scopedEq).toBe(true);
  });

  it('returns 200 with updated=0 when messageIds is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: RECIPIENT_ID } } });
    const req = new Request('http://t/api/coach/inbox/mark-read', {
      method: 'POST',
      body: JSON.stringify({ messageIds: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updated).toBe(0);
  });
});
