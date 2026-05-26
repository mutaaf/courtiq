/**
 * Ticket 0042 — the mutate() route refuses to update a `coaches` row whose id
 * does NOT match the authenticated user.
 *
 * The ticket says unpause goes "via the existing mutate() path." But the mutate
 * route accepts client-supplied `filters.id`, so a forged body could clear ANY
 * coach's paused_until. LESSONS#0039 ("the route validates the caller owns the
 * row and ignores any forged coach_id in the body") forces a server-side guard
 * specifically on the `coaches` table. The narrow contract:
 *   - operation === 'update' && table === 'coaches' must have filters.id === user.id
 *   - anything else returns 403; no DB write happens
 *
 * .test.ts (NOT .spec.ts) — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAdminFromFn, mockGetUser } = vi.hoisted(() => ({
  mockAdminFromFn: vi.fn(),
  mockGetUser: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
  createServiceSupabase: vi.fn(async () => ({ from: mockAdminFromFn })),
}));

// Webhooks and cache helpers are out-of-band — stub them so the route's
// happy-path doesn't fail on unrelated infra.
vi.mock('@/lib/webhooks', () => ({ fireWebhooks: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/cache/memory', () => ({ memBustPrefix: vi.fn() }));

import { POST as mutatePost } from '@/app/api/data/mutate/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminFromFn.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-self' } }, error: null });
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/data/mutate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/data/mutate — coaches table ownership guard (ticket 0042)', () => {
  it('rejects an UPDATE on coaches whose filters.id is NOT the caller', async () => {
    // The chain should NEVER be reached — set a tripwire to prove no write.
    const writeSpy = vi.fn();
    mockAdminFromFn.mockImplementation(() => {
      const chain: Record<string, unknown> = {
        update: vi.fn(() => {
          writeSpy();
          return {
            eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
            select: vi.fn(() => Promise.resolve({ data: [], error: null })),
          };
        }),
      };
      return chain;
    });

    const res = await mutatePost(
      req({
        table: 'coaches',
        operation: 'update',
        data: { paused_until: null },
        filters: { id: 'someone-else' },
      }),
    );

    expect(res.status).toBe(403);
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it('accepts an UPDATE on coaches whose filters.id IS the caller', async () => {
    let updateCalled = false;
    let receivedFilterId: string | null = null;
    mockAdminFromFn.mockImplementation(() => ({
      update: vi.fn(() => ({
        eq: vi.fn((col: string, val: string) => {
          updateCalled = true;
          receivedFilterId = val;
          return {
            select: vi.fn(() => Promise.resolve({ data: [{ id: val, paused_until: null }], error: null })),
          };
        }),
      })),
    }));

    const res = await mutatePost(
      req({
        table: 'coaches',
        operation: 'update',
        data: { paused_until: null },
        filters: { id: 'user-self' },
      }),
    );

    expect(res.status).toBe(200);
    expect(updateCalled).toBe(true);
    expect(receivedFilterId).toBe('user-self');
  });

  it('rejects an UPDATE on coaches whose filters.id is missing', async () => {
    const writeSpy = vi.fn();
    mockAdminFromFn.mockImplementation(() => ({
      update: vi.fn(() => {
        writeSpy();
        return {
          eq: vi.fn(() => ({ select: vi.fn(() => Promise.resolve({ data: [], error: null })) })),
        };
      }),
    }));

    const res = await mutatePost(
      req({
        table: 'coaches',
        operation: 'update',
        data: { paused_until: null },
        filters: {},
      }),
    );

    expect(res.status).toBe(403);
    expect(writeSpy).not.toHaveBeenCalled();
  });
});
