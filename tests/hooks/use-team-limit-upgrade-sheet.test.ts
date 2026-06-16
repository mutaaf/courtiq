/**
 * Ticket 0086 — `useTeamLimitUpgradeSheet()` hook contract.
 *
 *   (i)   A 200 response returns `{ ok: true, data }`; no sheet mounts.
 *   (ii)  A 403 with `code: 'tier_limit_max_teams'` returns `{ ok: false,
 *         sheet }` AND populates `sheetBody` so the caller can mount the
 *         contextual `<TeamLimitUpgradeSheet />`.
 *   (iii) Any OTHER 4xx (e.g. validation) returns `{ ok: false, error }` and
 *         leaves `sheetBody` null so the existing toast path stays unchanged
 *         (LESSONS#0103 additive).
 *   (iv)  `closeSheet()` tears down the sheet without mutating other state.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTeamLimitUpgradeSheet } from '@/hooks/use-team-limit-upgrade-sheet';

beforeEach(() => {
  vi.restoreAllMocks();
});

function mockFetch(response: { status: number; body: unknown }) {
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(fn as unknown as typeof fetch);
  return fn;
}

describe('useTeamLimitUpgradeSheet (ticket 0086)', () => {
  it('(i) returns ok:true on a 200 response and leaves sheetBody null', async () => {
    mockFetch({ status: 200, body: { success: true, teamId: 'new-team' } });
    const { result } = renderHook(() => useTeamLimitUpgradeSheet());
    let out: any;
    await act(async () => {
      out = await result.current.submit({
        endpoint: '/api/auth/create-team',
        body: { teamName: 'Hawks U10' },
      });
    });
    expect(out.ok).toBe(true);
    expect(out.data.teamId).toBe('new-team');
    expect(result.current.sheetBody).toBeNull();
  });

  it('(ii) surfaces the structured sheet body on a tier_limit_max_teams 403', async () => {
    mockFetch({
      status: 403,
      body: {
        error: 'Your free plan allows up to 1 team. Please upgrade to add more teams.',
        upgrade: true,
        code: 'tier_limit_max_teams',
        currentCount: 1,
        maxCount: 1,
        attemptedTeamName: 'Hawks U12',
        currentTier: 'free',
        invitedBy: { firstName: 'Mike', role: 'assistant_coach' },
      },
    });
    const { result } = renderHook(() => useTeamLimitUpgradeSheet());
    let out: any;
    await act(async () => {
      out = await result.current.submit({
        endpoint: '/api/auth/create-team',
        body: { teamName: 'Hawks U12', inviteCoachId: 'mike-inviter-1' },
        attemptedTeamId: '00000000-0000-4000-a000-000000000200',
      });
    });
    expect(out.ok).toBe(false);
    expect(out.sheet).toBeDefined();
    expect(out.sheet.code).toBe('tier_limit_max_teams');
    expect(out.sheet.attemptedTeamName).toBe('Hawks U12');
    expect(out.sheet.invitedBy.firstName).toBe('Mike');
    expect(out.sheet.inviteCoachId).toBe('mike-inviter-1');
    // sheetBody is the same payload — caller mounts the sheet on this.
    expect(result.current.sheetBody?.code).toBe('tier_limit_max_teams');
  });

  it('(iii) falls through to ok:false+error on an UNRELATED 4xx (sheetBody stays null)', async () => {
    mockFetch({ status: 400, body: { error: 'teamName required' } });
    const { result } = renderHook(() => useTeamLimitUpgradeSheet());
    let out: any;
    await act(async () => {
      out = await result.current.submit({
        endpoint: '/api/auth/create-team',
        body: {},
      });
    });
    expect(out.ok).toBe(false);
    expect(out.error).toBe('teamName required');
    expect(result.current.sheetBody).toBeNull();
  });

  it('(iv) closeSheet() tears down the sheet without re-firing the request', async () => {
    mockFetch({
      status: 403,
      body: {
        error: 'Your free plan allows up to 1 team. Please upgrade to add more teams.',
        upgrade: true,
        code: 'tier_limit_max_teams',
        currentCount: 1,
        maxCount: 1,
        attemptedTeamName: 'Hawks U12',
        currentTier: 'free',
      },
    });
    const { result } = renderHook(() => useTeamLimitUpgradeSheet());
    await act(async () => {
      await result.current.submit({
        endpoint: '/api/auth/create-team',
        body: { teamName: 'Hawks U12' },
        attemptedTeamId: '00000000-0000-4000-a000-000000000200',
      });
    });
    expect(result.current.sheetBody).not.toBeNull();
    act(() => {
      result.current.closeSheet();
    });
    expect(result.current.sheetBody).toBeNull();
  });
});
