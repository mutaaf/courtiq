/**
 * Ticket 0013 — the Player-of-the-Week / Player-of-the-Match spotlight gets its
 * own rich link preview (OG image + OG title/description) when a parent forwards
 * the `/share/[token]` portal.
 *
 * This is presentation-only: `playerSpotlight` already rides the share response
 * from ticket 0009. These specs assert:
 *  - the metadata builder branches on `playerSpotlight` (present → "Player of the
 *    Week"/"Match" + headline; absent/malformed → today's generic Progress
 *    Report title/description, unchanged);
 *  - the `isMatchSpotlight` shape-picking helper disambiguates weekly_star vs
 *    player_of_match by `session_label` presence, mirroring 0009's portal card;
 *  - `buildSpotlightPreview` minimizes to FIRST name + coach headline only
 *    (COPPA — no last name, jersey, roster, or other minor's data);
 *  - the OG image route returns a 200 ImageResponse for the spotlight,
 *    no-spotlight, AND missing-data tokens without throwing (degrades safely).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  isMatchSpotlight,
  buildSpotlightPreview,
} from '@/lib/player-spotlight-utils';
import { buildShareMetadata } from '@/lib/share-metadata';

const APP_URL = 'https://youthsportsiq.com';
const TOKEN = 'tok-0013';

// A player_of_match content_structured shape (session_label present).
const MATCH_SPOTLIGHT = {
  player_name: 'Bob Carter',
  session_label: 'Game vs. Lincoln',
  headline: 'Owned the paint all game',
  achievement: 'Crashed the boards relentlessly and protected the rim.',
  key_moment: 'Blocked the buzzer-beater to seal the win.',
  coach_message: 'You were the difference-maker out there today, Bob!',
};

// A weekly_star content_structured shape (week_label present, no session_label).
const WEEK_SPOTLIGHT = {
  player_name: 'Alice Walker',
  week_label: 'Week of May 18',
  headline: 'Locked down the perimeter all week',
  achievement: 'Three steals and relentless on-ball defense.',
  growth_moment: 'Started talking on defense for the first time.',
  challenge_ahead: 'Keep the help-side rotations sharp.',
  coach_shoutout: 'Best week of the season — keep it up!',
};

// ---------------------------------------------------------------------------
// isMatchSpotlight — shape disambiguation (AC: distinguishes the two shapes)
// ---------------------------------------------------------------------------
describe('isMatchSpotlight (ticket 0013)', () => {
  it('returns true for a player_of_match shape (session_label present)', () => {
    expect(isMatchSpotlight(MATCH_SPOTLIGHT)).toBe(true);
  });

  it('returns false for a weekly_star shape (week_label, no session_label)', () => {
    expect(isMatchSpotlight(WEEK_SPOTLIGHT)).toBe(false);
  });

  it('returns false for null / undefined / empty spotlight', () => {
    expect(isMatchSpotlight(null)).toBe(false);
    expect(isMatchSpotlight(undefined)).toBe(false);
    expect(isMatchSpotlight({})).toBe(false);
  });

  it('treats an empty-string session_label as NOT a match', () => {
    expect(isMatchSpotlight({ session_label: '', week_label: 'Week of May 18' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSpotlightPreview — COPPA-minimized preview fields
// ---------------------------------------------------------------------------
describe('buildSpotlightPreview (ticket 0013)', () => {
  it('builds a "Player of the Match" preview from a match shape', () => {
    const preview = buildSpotlightPreview(MATCH_SPOTLIGHT, 'Bob Carter');
    expect(preview).not.toBeNull();
    expect(preview!.title).toBe('Player of the Match');
    expect(preview!.firstName).toBe('Bob');
    expect(preview!.headline).toBe('Owned the paint all game');
  });

  it('builds a "Player of the Week" preview from a weekly_star shape', () => {
    const preview = buildSpotlightPreview(WEEK_SPOTLIGHT, 'Alice Walker');
    expect(preview).not.toBeNull();
    expect(preview!.title).toBe('Player of the Week');
    expect(preview!.firstName).toBe('Alice');
    expect(preview!.headline).toBe('Locked down the perimeter all week');
  });

  it('returns null when the spotlight is null or has no headline (malformed)', () => {
    expect(buildSpotlightPreview(null, 'Bob Carter')).toBeNull();
    expect(buildSpotlightPreview({ session_label: 'Game' }, 'Bob Carter')).toBeNull();
    expect(buildSpotlightPreview({ headline: '' }, 'Bob Carter')).toBeNull();
  });

  // COPPA: the preview exposes ONLY first name + coach headline. No last name,
  // jersey, roster, or other minor's data may leak into the public preview.
  it('exposes ONLY first name + headline — no last name, jersey, or PII', () => {
    const preview = buildSpotlightPreview(MATCH_SPOTLIGHT, 'Bob Carter');
    expect(preview).not.toBeNull();
    expect(Object.keys(preview!).sort()).toEqual(['firstName', 'headline', 'title'].sort());
    expect(preview!.firstName).toBe('Bob');
    expect(preview!.firstName).not.toContain('Carter');
    // The headline is coach-authored text about the subject; no jersey/roster.
    expect(JSON.stringify(preview)).not.toContain('Carter');
    expect(JSON.stringify(preview)).not.toContain('jersey');
  });
});

// ---------------------------------------------------------------------------
// buildShareMetadata — title/description branching
// ---------------------------------------------------------------------------
describe('buildShareMetadata (ticket 0013)', () => {
  function base(extra: Record<string, unknown> = {}) {
    return {
      player: { name: 'Bob Carter' },
      team: { name: 'E2E Test Team' },
      totalObservationCount: 4,
      skillProgress: [],
      ...extra,
    };
  }

  // AC: spotlight present → OG title contains "Player of the Match" (match shape)
  // and the description contains the headline.
  it('sets a "Player of the Match" OG title + headline description for a match shape', () => {
    const meta = buildShareMetadata(base({ playerSpotlight: MATCH_SPOTLIGHT }), {
      token: TOKEN,
      appUrl: APP_URL,
    });
    expect(meta.openGraph?.title).toContain('Player of the Match');
    expect(String(meta.openGraph?.description)).toContain('Owned the paint all game');
    // The Twitter card mirrors the OG title (summary_large_image reuse).
    expect(meta.twitter?.title).toContain('Player of the Match');
  });

  // AC: weekly_star shape → "Player of the Week".
  it('sets a "Player of the Week" OG title for a weekly_star shape', () => {
    const meta = buildShareMetadata(
      base({ player: { name: 'Alice Walker' }, playerSpotlight: WEEK_SPOTLIGHT }),
      { token: TOKEN, appUrl: APP_URL }
    );
    expect(meta.openGraph?.title).toContain('Player of the Week');
    expect(String(meta.openGraph?.description)).toContain('Locked down the perimeter all week');
  });

  // AC (regression): playerSpotlight: null → today's generic Progress Report
  // title/description, unchanged.
  it('falls back to the generic Progress Report title when playerSpotlight is null', () => {
    const meta = buildShareMetadata(base({ playerSpotlight: null }), {
      token: TOKEN,
      appUrl: APP_URL,
    });
    expect(meta.openGraph?.title).toContain('Progress Report');
    expect(meta.openGraph?.title).not.toContain('Player of the');
  });

  // AC (degrade): a malformed spotlight (no headline) must NOT produce a
  // spotlight title — it falls back to the generic card so the link never breaks.
  it('falls back to the generic title when the spotlight is malformed (no headline)', () => {
    const meta = buildShareMetadata(base({ playerSpotlight: { session_label: 'Game vs. Lincoln' } }), {
      token: TOKEN,
      appUrl: APP_URL,
    });
    expect(meta.openGraph?.title).toContain('Progress Report');
    expect(meta.openGraph?.title).not.toContain('Player of the');
  });

  // AC (error/missing): no data at all → the generic SportsIQ fallback, never
  // a throw, never a 500 page.
  it('returns the generic SportsIQ fallback when share data is missing or errored', () => {
    const missing = buildShareMetadata(null, { token: TOKEN, appUrl: APP_URL });
    expect(missing.title).toContain('SportsIQ');
    const errored = buildShareMetadata({ error: 'Not found' }, { token: TOKEN, appUrl: APP_URL });
    expect(errored.title).toContain('SportsIQ');
  });

  // The OG image URL is the same self-selecting route in every branch.
  it('points all branches at the same /opengraph-image route', () => {
    const firstImageUrl = (meta: ReturnType<typeof buildShareMetadata>) => {
      const images = meta.openGraph?.images;
      const first = Array.isArray(images) ? images[0] : images;
      return (first as { url?: unknown } | undefined)?.url;
    };
    const spot = buildShareMetadata(base({ playerSpotlight: MATCH_SPOTLIGHT }), { token: TOKEN, appUrl: APP_URL });
    const generic = buildShareMetadata(base({ playerSpotlight: null }), { token: TOKEN, appUrl: APP_URL });
    const expected = `${APP_URL}/share/${TOKEN}/opengraph-image`;
    expect(firstImageUrl(spot)).toBe(expected);
    expect(firstImageUrl(generic)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// opengraph-image route — render-path test (200 ImageResponse, no throw)
// ---------------------------------------------------------------------------
// Mock next/og's ImageResponse so the route is exercised without the heavy
// satori/WASM pipeline. We assert the route constructs an ImageResponse (the
// element tree self-selects spotlight vs generic) and never throws — per the
// ticket: "assert status/contentType rather than pixel content."
const { mockImageResponse } = vi.hoisted(() => ({
  mockImageResponse: vi.fn(),
}));

vi.mock('next/og', () => ({
  ImageResponse: class {
    public status = 200;
    public headers = new Headers({ 'content-type': 'image/png' });
    public element: unknown;
    public opts: unknown;
    constructor(element: unknown, opts: unknown) {
      mockImageResponse(element, opts);
      this.element = element;
      this.opts = opts;
    }
  },
}));

describe('opengraph-image route — render path (ticket 0013)', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    mockImageResponse.mockClear();
  });

  afterEach(() => {
    global.fetch = realFetch;
    vi.resetModules();
  });

  function mockShareFetch(body: unknown | null, ok = true) {
    global.fetch = vi.fn(async () => {
      if (body === null && !ok) {
        return { ok: false, json: async () => ({}) } as Response;
      }
      return { ok, json: async () => body } as unknown as Response;
    }) as unknown as typeof fetch;
  }

  async function renderOG(token: string) {
    const mod = await import('@/app/share/[token]/opengraph-image');
    return mod.default({ params: Promise.resolve({ token }) });
  }

  it('returns a 200 ImageResponse for a token WITH a spotlight (spotlight variant)', async () => {
    mockShareFetch({
      player: { name: 'Bob Carter' },
      team: { name: 'E2E Test Team' },
      coachName: 'E2E Test Coach',
      totalObservationCount: 4,
      playerSpotlight: MATCH_SPOTLIGHT,
    });
    const res = await renderOG('spot-token');
    expect((res as any).status).toBe(200);
    expect((res as any).headers.get('content-type')).toBe('image/png');
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it('returns a 200 ImageResponse for a token WITHOUT a spotlight (generic variant)', async () => {
    mockShareFetch({
      player: { name: 'Alice Walker' },
      team: { name: 'E2E Test Team' },
      coachName: 'E2E Test Coach',
      totalObservationCount: 3,
      playerSpotlight: null,
    });
    const res = await renderOG('no-spot-token');
    expect((res as any).status).toBe(200);
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it('returns a valid ImageResponse for a token whose data is MISSING (degrades, no throw)', async () => {
    mockShareFetch(null, false); // /api/share returns !ok → getSharePreviewData() => null
    const res = await renderOG('missing-token');
    expect((res as any).status).toBe(200);
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it('returns a valid ImageResponse when the share fetch THROWS (network error)', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    const res = await renderOG('throw-token');
    expect((res as any).status).toBe(200);
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });

  it('returns a valid ImageResponse for a MALFORMED spotlight (no headline → generic)', async () => {
    mockShareFetch({
      player: { name: 'Bob Carter' },
      team: { name: 'E2E Test Team' },
      coachName: 'E2E Test Coach',
      totalObservationCount: 4,
      playerSpotlight: { session_label: 'Game vs. Lincoln' }, // no headline
    });
    const res = await renderOG('malformed-token');
    expect((res as any).status).toBe(200);
    expect(mockImageResponse).toHaveBeenCalledTimes(1);
  });
});
