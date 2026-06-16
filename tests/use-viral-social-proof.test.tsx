/**
 * Ticket 0084 — `useViralSocialProof` hook.
 *
 * Fires GET /api/coach/viral-social-proof ONCE per session when a 402
 * quota wall first surfaces, and caches the result in module state so
 * a second mount (or a re-render) does NOT refetch. The fetch has a
 * 1.2s timeout; on timeout, network error, or `{ line: null }`, the
 * hook returns `null` (the quota-wall surface renders WITHOUT the
 * line — the upgrade path is never blocked by the proof line being
 * absent).
 *
 * Smallest possible touch on the shared 402 surface (LESSONS#0065 /
 * #0066): the surface passes `active = aiUpgrade !== null` and the
 * hook owns the fetch + debounce; surfaces never call fetch directly.
 *
 * .test.tsx (NOT .spec.tsx) — vitest excludes the Playwright spec glob
 * (LESSONS#0020 / #38).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import {
  useViralSocialProof,
  __resetViralSocialProofCacheForTests,
} from '@/hooks/use-viral-social-proof';

const fetchMock = vi.fn<
  (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
>();

beforeEach(() => {
  fetchMock.mockReset();
  __resetViralSocialProofCacheForTests();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('useViralSocialProof (ticket 0084)', () => {
  it('fires the fetch ONCE when active flips to true', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        line: '3 parents on the Hawks forwarded your last report this week',
        eventKind: 'parent_forward_on_team',
      }),
    );
    const { result } = renderHook(() => useViralSocialProof(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.eventKind).toBe('parent_forward_on_team');
    expect(result.current?.line).toContain('Hawks');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/coach/viral-social-proof',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('returns the resolved line directly when active stays true and the cache is warm', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        line: 'a coach who cloned your closeout drill thumbed it up after running it',
        eventKind: 'drill_stick_signal',
      }),
    );
    const first = renderHook(() => useViralSocialProof(true));
    await waitFor(() => expect(first.result.current).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A second mount (same session) MUST re-use the cache, not refetch.
    const second = renderHook(() => useViralSocialProof(true));
    await waitFor(() => expect(second.result.current).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.result.current?.eventKind).toBe('drill_stick_signal');
  });

  it('does NOT fetch when active is false', async () => {
    renderHook(() => useViralSocialProof(false));
    // Give the microtask queue a tick to drain.
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the route resolves { line: null }', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ line: null, eventKind: null }),
    );
    const { result } = renderHook(() => useViralSocialProof(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    // Give the resolved state a tick to land.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).toBeNull();
  });

  it('returns null when the fetch times out at 1.2s', async () => {
    vi.useFakeTimers();
    // Never resolve — the AbortController's signal must trip the catch.
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );
    const { result } = renderHook(() => useViralSocialProof(true));
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBeNull();
  });

  it('returns null when the fetch rejects with a network error', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    const { result } = renderHook(() => useViralSocialProof(true));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(result.current).toBeNull();
  });
});
