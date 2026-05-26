/**
 * Vitest — public-page canonical URLs + structured data (ticket 0038).
 *
 * Every server-rendered PUBLIC coach surface must declare a canonical URL via
 * `generateMetadata` so a crawler can collapse duplicates; the canonical uses
 * `NEXT_PUBLIC_APP_URL` so preview vs prod produce different canonicals.
 *
 * /programs additionally exposes a JSON-LD `BreadcrumbList` and each
 * /org/<slug> exposes a JSON-LD `Organization` block (name + url ONLY — NO
 * email / phone / coach data) so search engines can render a richer result.
 *
 * AC mapping:
 *  - alternates.canonical present and equals `${APP_URL}<path>` for each of:
 *    /programs, /org/<slug>, /team-card/<token>, /season-recap/<token>,
 *    /coach/<token>, /recap/<token>.
 *  - /programs metadata carries a parseable JSON-LD BreadcrumbList (root → /programs).
 *  - /org/<slug> metadata carries a parseable JSON-LD Organization block
 *    exposing ONLY `name` + `url` (no per-coach / per-minor fields).
 *
 * File is `.test.ts` (NOT `.spec.ts`) — vitest excludes the spec glob
 * (LESSONS.md 2026-05-20). Run `tsc --noEmit` after writing route tests
 * (LESSONS.md 2026-05-21).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const APP_URL = 'https://youthsportsiq.test';

const realFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = APP_URL;
});

afterEach(() => {
  global.fetch = realFetch;
  vi.resetModules();
});

// Helper to mock a single `/api/*` response. Each public page's
// generateMetadata calls fetch(`${APP_URL}<api-path>`) server-side; this stub
// returns the supplied body for ANY URL in the test.
function mockApi(body: unknown, ok = true) {
  global.fetch = vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// /programs — canonical + JSON-LD BreadcrumbList
// ---------------------------------------------------------------------------
describe('GET /programs — generateMetadata (ticket 0038)', () => {
  it('sets alternates.canonical to ${APP_URL}/programs', async () => {
    // /programs metadata is static — no fetch needed. Still safe-stub.
    mockApi({ programs: [] });
    const { generateMetadata } = await import('@/app/programs/page');
    const meta = await generateMetadata();
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/programs`);
  });

  it('exposes a JSON-LD BreadcrumbList (root → /programs)', async () => {
    mockApi({ programs: [] });
    const { generateMetadata } = await import('@/app/programs/page');
    const meta = await generateMetadata();

    // The structured data lives in `meta.other` as a `ld+json` key. The
    // value (or first element if array) parses as JSON-LD with the expected
    // @type and itemListElement.
    const other = meta.other ?? {};
    // Look for any key containing 'ld+json' or 'jsonld'.
    const ldKey = Object.keys(other).find((k) =>
      /ld\+json|jsonld|json-ld/i.test(k),
    );
    expect(ldKey, 'expected a structured-data key in metadata.other').toBeDefined();
    const rawVal = (other as Record<string, unknown>)[ldKey!];
    const raw = Array.isArray(rawVal) ? String(rawVal[0]) : String(rawVal);
    const parsed = JSON.parse(raw);
    expect(parsed['@type']).toBe('BreadcrumbList');
    expect(Array.isArray(parsed.itemListElement)).toBe(true);
    // root → /programs (two items minimum).
    expect(parsed.itemListElement.length).toBeGreaterThanOrEqual(2);
    const items = parsed.itemListElement;
    const urls = items.map((i: { item?: { '@id'?: string } | string }) =>
      typeof i.item === 'string' ? i.item : i.item?.['@id'],
    );
    expect(urls).toContain(APP_URL);
    expect(urls).toContain(`${APP_URL}/programs`);
  });
});

// ---------------------------------------------------------------------------
// /org/<slug> — canonical + JSON-LD Organization
// ---------------------------------------------------------------------------
describe('GET /org/[slug] — generateMetadata (ticket 0038)', () => {
  const slug = 'lincoln-rec';
  function orgPayload() {
    return {
      org: { name: 'Lincoln Rec League', slug, created_at: '2024-01-01' },
      branding: null,
      teams: [],
      stats: { coaches: 4, players: 12, teams: 2 },
    };
  }

  it('sets alternates.canonical to ${APP_URL}/org/<slug>', async () => {
    mockApi(orgPayload());
    const { generateMetadata } = await import('@/app/org/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/org/${slug}`);
  });

  it('exposes a JSON-LD Organization block with ONLY name + url', async () => {
    mockApi(orgPayload());
    const { generateMetadata } = await import('@/app/org/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug }) });

    const other = meta.other ?? {};
    const ldKey = Object.keys(other).find((k) =>
      /ld\+json|jsonld|json-ld/i.test(k),
    );
    expect(ldKey, 'expected a structured-data key in metadata.other').toBeDefined();
    const rawVal = (other as Record<string, unknown>)[ldKey!];
    const raw = Array.isArray(rawVal) ? String(rawVal[0]) : String(rawVal);
    const parsed = JSON.parse(raw);

    expect(parsed['@type']).toBe('Organization');
    expect(parsed.name).toBe('Lincoln Rec League');
    expect(parsed.url).toBe(`${APP_URL}/org/${slug}`);

    // Allow-list: every key on the block must be one of @context/@type/name/url.
    const allowed = new Set(['@context', '@type', 'name', 'url']);
    for (const k of Object.keys(parsed)) {
      expect(allowed.has(k)).toBe(true);
    }

    // Defensive: nothing per-coach or per-minor leaks into the JSON-LD.
    const serialized = JSON.stringify(parsed);
    const forbidden = [
      'email',
      'telephone',
      'phone',
      'address',
      'contactPoint',
      'employee',
      'coach',
      'coaches',
      'player',
      'players',
      'jersey',
    ];
    for (const word of forbidden) {
      expect(serialized.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it('still sets canonical even when the org payload is missing (preserves preview→prod URLs)', async () => {
    mockApi({}, false);
    const { generateMetadata } = await import('@/app/org/[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug }) });
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/org/${slug}`);
  });
});

// ---------------------------------------------------------------------------
// /team-card/<token> — canonical
// ---------------------------------------------------------------------------
describe('GET /team-card/[token] — generateMetadata canonical (ticket 0038)', () => {
  const token = 'tc-test-token';
  it('sets alternates.canonical to ${APP_URL}/team-card/<token>', async () => {
    mockApi({
      personality: { team_type: 'The Grinders', tagline: 'Made it count.' },
      teamName: 'E2E Test Team',
      referralCode: 'AAAAAA',
    });
    const { generateMetadata } = await import('@/app/team-card/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/team-card/${token}`);
  });

  it('keeps the existing OG title untouched (regression — AC out-of-scope)', async () => {
    mockApi({
      personality: { team_type: 'The Grinders', tagline: 'Made it count.' },
      teamName: 'E2E Test Team',
      referralCode: 'AAAAAA',
    });
    const { generateMetadata } = await import('@/app/team-card/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(String(meta.openGraph?.title)).toContain('The Grinders');
  });
});

// ---------------------------------------------------------------------------
// /season-recap/<token> — canonical
// ---------------------------------------------------------------------------
describe('GET /season-recap/[token] — generateMetadata canonical (ticket 0038)', () => {
  const token = 'sr-test-token';
  it('sets alternates.canonical to ${APP_URL}/season-recap/<token>', async () => {
    mockApi({
      recap: { headline: 'A Season of Breakthroughs', overall_assessment: 'Strong year.' },
      teamName: 'E2E Test Team',
      referralCode: 'AAAAAA',
    });
    const { generateMetadata } = await import('@/app/season-recap/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/season-recap/${token}`);
  });
});

// ---------------------------------------------------------------------------
// /coach/<token> — canonical
// ---------------------------------------------------------------------------
describe('GET /coach/[token] — generateMetadata canonical (ticket 0038)', () => {
  const token = 'cc-test-token';
  it('sets alternates.canonical to ${APP_URL}/coach/<token>', async () => {
    mockApi({
      display_name: 'Coach E2E',
      sports: ['Basketball'],
      age_groups: ['11-13'],
      weeks_coaching: 8,
      practices_logged: 12,
      players_observed: 10,
      referral_code: 'AAAAAA',
    });
    const { generateMetadata } = await import('@/app/coach/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/coach/${token}`);
  });
});

// ---------------------------------------------------------------------------
// /recap/<token> — canonical
// ---------------------------------------------------------------------------
describe('GET /recap/[token] — generateMetadata canonical (ticket 0038)', () => {
  const token = 'gr-test-token';
  it('sets alternates.canonical to ${APP_URL}/recap/<token>', async () => {
    mockApi({
      recap: { result_headline: 'Victory Over the Eagles', intro: 'They controlled it.' },
      teamName: 'E2E Test Team',
      referralCode: 'AAAAAA',
    });
    const { generateMetadata } = await import('@/app/recap/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    expect(meta.alternates?.canonical).toBe(`${APP_URL}/recap/${token}`);
  });
});

// ---------------------------------------------------------------------------
// /share/<token> — parent portal — robots: noindex
// ---------------------------------------------------------------------------
describe('GET /share/[token] — generateMetadata noindex (ticket 0038)', () => {
  const token = 'sh-test-token';
  it('marks the parent portal as robots: noindex (per-minor surface)', async () => {
    // The share page builds its metadata via buildShareMetadata; the route's
    // generateMetadata must additionally set `robots: { index: false }` so the
    // parent-portal page is excluded from any crawl, regardless of data state.
    mockApi({
      player: { name: 'Alice Walker' },
      team: { name: 'E2E Test Team' },
      totalObservationCount: 4,
      skillProgress: [],
    });
    const { generateMetadata } = await import('@/app/share/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    const robots = meta.robots;
    if (typeof robots === 'string') {
      expect(robots.toLowerCase()).toContain('noindex');
    } else {
      expect(robots && (robots as { index?: boolean }).index).toBe(false);
    }
  });

  it('marks the parent portal as noindex even when share data is missing', async () => {
    mockApi(null, false);
    const { generateMetadata } = await import('@/app/share/[token]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ token }) });
    const robots = meta.robots;
    if (typeof robots === 'string') {
      expect(robots.toLowerCase()).toContain('noindex');
    } else {
      expect(robots && (robots as { index?: boolean }).index).toBe(false);
    }
  });
});
