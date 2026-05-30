/**
 * Ticket 0057 — data-route posture for weekly_pulse_shares.
 *
 * Mirrors the 0049 practice_plan_shares posture: READS are allow-listed on
 * /api/data so the publishing coach can list their own pulses, but the
 * mutate allow-list intentionally OMITS the table so a direct client insert
 * is REFUSED — every insertion flows through /api/weekly-pulse/create
 * (LESSONS#0039 — never trust a client-supplied identifier on a typed share
 * artifact).
 *
 * .test.ts NOT .spec.ts (vitest exclude glob — LESSONS#0038).
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

// The data mutate route imports a few helpers we don't need in this test.
vi.mock('@/lib/webhooks', () => ({ fireWebhooks: vi.fn(async () => undefined) }));
vi.mock('@/lib/cache/memory', () => ({
  memBustPrefix: vi.fn(),
  memCached: vi.fn(async (_k: string, _ttl: number, fn: () => Promise<unknown>) => fn()),
  TTL: { SHORT: 1, MEDIUM: 1, LONG: 1, HOUR: 1, VERY_LONG: 1 },
}));

import { POST as mutate } from '@/app/api/data/mutate/route';
import { POST as query } from '@/app/api/data/route';

function buildChain(data: unknown = null) {
  const resolved = { data, error: null };
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(async () => resolved),
    then: (resolve: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(resolve),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: 'coach-1' } }, error: null });
});

describe('/api/data — weekly_pulse_shares allow-list (ticket 0057)', () => {
  it('READ on weekly_pulse_shares succeeds (the coach can list their own pulses)', async () => {
    mockFromFn.mockReturnValueOnce(buildChain([{ id: 'pulse-1', token: 'abc' }]));
    const req = new Request('http://localhost/api/data', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        table: 'weekly_pulse_shares',
        select: '*',
        filters: { coach_id: 'coach-1' },
      }),
    });
    const res = await query(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { error?: string };
    // The route returns { data, count } on a successful read; absence of an
    // `error` field means the table was on the allow-list and the read ran.
    expect(body.error).toBeUndefined();
  });

  it('MUTATE insert on weekly_pulse_shares is REFUSED — direct client writes never reach the table', async () => {
    const req = new Request('http://localhost/api/data/mutate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        table: 'weekly_pulse_shares',
        operation: 'insert',
        data: { token: 'forged', coach_id: 'coach-1', team_id: 'team-1', iso_week: '2026-W22' },
      }),
    });
    const res = await mutate(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(String(body.error)).toMatch(/not allowed/i);
  });
});
