/**
 * Ticket 0068 — /opener/[token]/opengraph-image.tsx.
 *
 * Per LESSONS#0060: mock next/og to a fake ImageResponse, assert the route
 * constructs once and surfaces a status + content-type — never render real
 * pixels. The metadata branching itself is unit-tested in
 * tests/lib/season-opener-metadata.test.ts via the pure helper.
 *
 * `.test.ts` not `.spec.ts` (LESSONS#0020).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const imageResponseConstructions: Array<{ element: unknown; opts: unknown }> = [];

vi.mock('next/og', () => ({
  ImageResponse: class {
    status = 200;
    headers = new Headers({ 'content-type': 'image/png' });
    constructor(element: unknown, opts: unknown) {
      imageResponseConstructions.push({ element, opts });
    }
  },
}));

const fetchSpy = vi.fn();
beforeEach(() => {
  imageResponseConstructions.length = 0;
  fetchSpy.mockReset();
  (globalThis as { fetch: typeof fetch }).fetch =
    fetchSpy as unknown as typeof fetch;
});

const TOKEN = 'opener-token-abc';

const payloadResponse = (body: Record<string, unknown>) =>
  ({
    ok: true,
    json: async () => body,
  }) as Response;

const notFoundResponse = () =>
  ({
    ok: false,
    json: async () => ({ error: 'Not found' }),
    status: 404,
  }) as Response;

describe('GET /opener/[token]/opengraph-image (ticket 0068)', () => {
  it('constructs ImageResponse once on a present payload', async () => {
    fetchSpy.mockResolvedValueOnce(
      payloadResponse({
        teamName: 'Hawks U10',
        ageGroup: '8-10',
        sportName: 'Basketball',
        seasonLabel: 'Spring 2026',
        coachFirstName: 'Sarah',
        focusLine: 'closeouts and good sportsmanship',
      }),
    );

    const { default: handler } = await import(
      '@/app/opener/[token]/opengraph-image'
    );
    const res = await handler({ params: Promise.resolve({ token: TOKEN }) });
    expect(imageResponseConstructions.length).toBe(1);
    expect((res as unknown as { status: number }).status).toBe(200);
    expect(
      (res as unknown as { headers: Headers }).headers.get('content-type'),
    ).toBe('image/png');
  });

  it('still constructs ImageResponse on a null/404 payload (defaults to a generic card)', async () => {
    fetchSpy.mockResolvedValueOnce(notFoundResponse());

    const { default: handler } = await import(
      '@/app/opener/[token]/opengraph-image'
    );
    const res = await handler({ params: Promise.resolve({ token: TOKEN }) });
    expect(imageResponseConstructions.length).toBe(1);
    expect((res as unknown as { status: number }).status).toBe(200);
  });
});
