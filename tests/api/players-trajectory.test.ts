/**
 * Ticket 0061 — GET /api/players/[playerId]/trajectory.
 *
 * AC mapping:
 *  - 401 when there is no authenticated user (before any DB read).
 *  - 403 when the caller is NOT a head coach of the player's team
 *    (gate goes through `team_coaches`, NOT `teams.coach_id` — LESSONS#0057).
 *  - 200 with { started:null, now:null, observationCount:N } when the
 *    player has fewer than 4 observations (UI suppresses the section).
 *  - 200 with the full payload on the happy path; the bucket-keyed
 *    cache is upserted exactly once and a second invocation in the same
 *    bucket returns the cached payload WITHOUT invoking `callAIWithJSON`.
 *  - 200 once a NEW observation pushes the player into a higher bucket;
 *    the cache miss re-invokes `callAIWithJSON` exactly once.
 *  - Tier gate: a `free` coach gets ONE preview per (coach, player) per
 *    30 days. The second view in 30 days returns 402 with the named
 *    feature key; a coach-tier coach is never gated.
 *  - The AI prompt input is FILTERED at the boundary: only the player's
 *    first name + age + sport + observation rows are passed. The
 *    rendered route reads `players.parent_email` / `medical_notes` /
 *    `date_of_birth` from the DB but those values NEVER reach the AI
 *    input or the JSON payload (COPPA).
 *  - Banned-word render-time fallback: if the AI returns "amazing" or
 *    similar AGENTS.md banned words, the route falls back to a generic
 *    structured-language version (the prompt instruction can nudge but
 *    cannot guarantee).
 *
 * Mock strategy mirrors tests/api/player-handoffs-preview.test.ts:
 * chainable in-memory supabase + a mocked callAIWithJSON. `mockFromFn`
 * is RESET between tests so a queued `mockReturnValueOnce` chain does
 * not leak into the next case (LESSONS#0092).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, mockCallAIWithJSON } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockFromFn: vi.fn(),
  mockCallAIWithJSON: vi.fn(),
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

vi.mock('@/lib/ai/client', () => ({
  callAIWithJSON: mockCallAIWithJSON,
}));

import { GET } from '@/app/api/players/[playerId]/trajectory/route';

interface ChainOpts {
  data?: unknown;
  error?: unknown;
  insertedRows?: unknown[];
}
function buildChain(opts: ChainOpts = {}) {
  const { data = null, error = null, insertedRows } = opts;
  const resolved = { data, error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn((row) => {
      if (insertedRows) insertedRows.push(row);
      return chain;
    }),
    upsert: vi.fn((row) => {
      if (insertedRows) insertedRows.push(row);
      return chain;
    }),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(resolved),
    maybeSingle: vi.fn().mockResolvedValue(resolved),
    then: (onFulfilled: (v: typeof resolved) => unknown) =>
      Promise.resolve(resolved).then(onFulfilled),
  };
  return chain;
}

const COACH_ID = '00000000-0000-4000-a000-000000000001';
const TEAM_ID = '00000000-0000-4000-a000-000000000020';
const PLAYER_ID = '00000000-0000-4000-a000-000000000030';
const ORG_ID = '00000000-0000-4000-a000-000000000010';

function setAuthUser(id: string | null = COACH_ID) {
  if (id === null) {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  } else {
    mockGetUser.mockResolvedValue({ data: { user: { id } }, error: null });
  }
}

function makeRequest() {
  return new Request(`http://localhost/api/players/${PLAYER_ID}/trajectory`);
}

function fakeObservation(i: number, sentiment: 'positive' | 'needs-work' | 'neutral' = 'positive', text = `obs ${i}`) {
  return {
    id: `obs-${i}`,
    player_id: PLAYER_ID,
    team_id: TEAM_ID,
    text,
    sentiment,
    category: 'Defense',
    skill_id: 'closeout',
    created_at: new Date(2026, 0, i + 1).toISOString(),
  };
}

const PROMPT_AI_OUTPUT = {
  started: {
    headline: 'Tentative on closeouts',
    sentence: 'Started the season hesitating on closeouts.',
    observation_id: 'obs-0',
  },
  now: {
    headline: 'Closes out and recovers',
    sentence: 'Now closes out and recovers without losing balance.',
    observation_id: 'obs-10',
  },
  turning_points: [
    { observation_id: 'obs-3', one_word_label: 'forward' },
    { observation_id: 'obs-7', one_word_label: 'recovers' },
  ],
};

const PLAYER_FIXTURE = {
  id: PLAYER_ID,
  team_id: TEAM_ID,
  name: 'Alice Walker',
  age_group: '11-13',
  // The route reads these fields off the player row but MUST NEVER thread
  // them into the AI prompt input or the JSON payload (COPPA boundary).
  parent_email: 'sarah@walker-family.test',
  parent_phone: '5551234567',
  date_of_birth: '2014-08-15',
  medical_notes: 'planted-medical-note-do-not-leak',
};

const TEAM_FIXTURE = {
  id: TEAM_ID,
  org_id: ORG_ID,
  age_group: '11-13',
  sports: { name: 'basketball' },
};

function queueTeamOwnedFullPayload(opts: {
  observations?: unknown[];
  cacheHit?: unknown;
  viewsInWindow?: number;
  tier?: 'free' | 'coach' | 'pro_coach' | 'organization';
  insertedRows?: unknown[];
}) {
  const observations =
    opts.observations ??
    Array.from({ length: 11 }, (_, i) =>
      fakeObservation(i, i < 2 ? 'needs-work' : 'positive', i === 0 ? 'Hesitated on closeouts' : `Worked on closeout ${i}`),
    );
  const tier = opts.tier ?? 'coach';
  const insertedRows = opts.insertedRows;

  // 1) coaches lookup (resolve org + tier + name)
  mockFromFn.mockReturnValueOnce(
    buildChain({
      data: { id: COACH_ID, org_id: ORG_ID, full_name: 'E2E Test Coach', organizations: { tier } },
    }),
  );
  // 2) player lookup
  mockFromFn.mockReturnValueOnce(buildChain({ data: PLAYER_FIXTURE }));
  // 3) team_coaches ownership check (LESSONS#0057 — team_coaches, NOT teams.coach_id)
  mockFromFn.mockReturnValueOnce(buildChain({ data: { coach_id: COACH_ID } }));
  // 4) team lookup (sport / age / org)
  mockFromFn.mockReturnValueOnce(buildChain({ data: TEAM_FIXTURE }));
  // 5) views-in-window (for the free-tier 30-day preview gate — paid tiers
  //    read this too for a consistent audit chain shape)
  mockFromFn.mockReturnValueOnce(buildChain({ data: Array.from({ length: opts.viewsInWindow ?? 0 }, (_, i) => ({ id: `view-${i}` })) }));
  // 6) observations (ordered ascending by created_at)
  mockFromFn.mockReturnValueOnce(buildChain({ data: observations }));
  // 7) cache lookup (hit OR miss)
  mockFromFn.mockReturnValueOnce(buildChain({ data: opts.cacheHit ?? null }));
  // 8) on cache miss the route writes the cache row AND records a view; on hit it only records a view.
  if (!opts.cacheHit) {
    mockFromFn.mockReturnValueOnce(buildChain({ data: null, insertedRows }));
  }
  // 9) view audit insert (always)
  mockFromFn.mockReturnValueOnce(buildChain({ data: null, insertedRows }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  mockCallAIWithJSON.mockReset();
  mockCallAIWithJSON.mockResolvedValue({
    parsed: PROMPT_AI_OUTPUT,
    text: JSON.stringify(PROMPT_AI_OUTPUT),
    tokensIn: 100,
    tokensOut: 50,
    latencyMs: 10,
    interactionId: 'int-1',
  });
});

describe('GET /api/players/[playerId]/trajectory (ticket 0061)', () => {
  it('returns 401 when there is no authenticated user', async () => {
    setAuthUser(null);
    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(401);
    expect(mockFromFn).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is NOT a head coach of the player\'s team', async () => {
    setAuthUser();
    // coaches → player → team_coaches MISSES (null) → 403
    mockFromFn.mockReturnValueOnce(
      buildChain({ data: { id: COACH_ID, org_id: ORG_ID, full_name: 'Coach', organizations: { tier: 'coach' } } }),
    );
    mockFromFn.mockReturnValueOnce(buildChain({ data: PLAYER_FIXTURE }));
    mockFromFn.mockReturnValueOnce(buildChain({ data: null }));

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(403);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns null payload with observationCount when player has fewer than 4 observations', async () => {
    setAuthUser();
    queueTeamOwnedFullPayload({
      observations: [fakeObservation(0), fakeObservation(1), fakeObservation(2)],
    });

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      started: unknown;
      now: unknown;
      turningPoints: unknown[];
      observationCount: number;
    };
    expect(body.started).toBeNull();
    expect(body.now).toBeNull();
    expect(body.turningPoints).toEqual([]);
    expect(body.observationCount).toBe(3);
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('returns the full payload on a cache miss and persists the cache row', async () => {
    setAuthUser();
    const insertedRows: unknown[] = [];
    queueTeamOwnedFullPayload({ insertedRows });

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      started: { headline: string; sentence: string; observation_id: string; observed_at: string };
      now: { headline: string; sentence: string; observation_id: string; observed_at: string };
      turningPoints: Array<{ observation_id: string; observed_at: string; oneWordLabel: string }>;
      observationCount: number;
    };
    expect(body.observationCount).toBe(11);
    expect(body.started.headline).toBe('Tentative on closeouts');
    expect(body.now.headline).toBe('Closes out and recovers');
    expect(body.turningPoints.length).toBeLessThanOrEqual(3);
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    // The cache row was upserted at bucket = floor(11/3)*3 = 9
    const cacheRow = insertedRows.find(
      (r) => r && typeof r === 'object' && 'observation_count_bucket' in r,
    ) as { observation_count_bucket?: number } | undefined;
    expect(cacheRow?.observation_count_bucket).toBe(9);
  });

  it('returns the cached payload on a cache hit WITHOUT invoking callAIWithJSON', async () => {
    setAuthUser();
    queueTeamOwnedFullPayload({
      cacheHit: {
        id: 'cache-1',
        player_id: PLAYER_ID,
        observation_count_bucket: 9,
        started: {
          headline: 'Cached start',
          sentence: 'Cached started sentence.',
          observation_id: 'obs-0',
          observed_at: '2026-01-01T00:00:00Z',
        },
        now: {
          headline: 'Cached now',
          sentence: 'Cached now sentence.',
          observation_id: 'obs-10',
          observed_at: '2026-05-20T00:00:00Z',
        },
        turning_points: [],
      },
    });

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      started: { headline: string };
      now: { headline: string };
    };
    expect(body.started.headline).toBe('Cached start');
    expect(body.now.headline).toBe('Cached now');
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('re-invokes callAIWithJSON when the observation count crosses a new bucket', async () => {
    setAuthUser();
    // The player now has 12 observations; bucket = floor(12/3)*3 = 12.
    // A cache row at bucket 9 EXISTS but is for the prior bucket — the route
    // must look up the row keyed at bucket 12, which is null → cache miss.
    const observations = Array.from({ length: 12 }, (_, i) => fakeObservation(i));
    queueTeamOwnedFullPayload({ observations });

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
  });

  it('does NOT thread parent contact / DOB / medical notes into the AI prompt input (COPPA)', async () => {
    setAuthUser();
    queueTeamOwnedFullPayload({});

    await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });

    expect(mockCallAIWithJSON).toHaveBeenCalledTimes(1);
    const call = mockCallAIWithJSON.mock.calls[0][0] as { systemPrompt: string; userPrompt: string };
    const combined = `${call.systemPrompt}\n${call.userPrompt}`;
    expect(combined).not.toContain('Walker'); // last name never threaded
    expect(combined).not.toContain('sarah@walker-family.test');
    expect(combined).not.toContain('5551234567');
    expect(combined).not.toContain('2014-08-15'); // DOB
    expect(combined).not.toContain('planted-medical-note-do-not-leak');
    // First name only.
    expect(combined).toContain('Alice');
  });

  it('does NOT echo parent contact / DOB / medical notes back in the JSON payload', async () => {
    setAuthUser();
    queueTeamOwnedFullPayload({});

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    const body = await res.text();
    expect(body).not.toContain('sarah@walker-family.test');
    expect(body).not.toContain('5551234567');
    expect(body).not.toContain('2014-08-15');
    expect(body).not.toContain('planted-medical-note-do-not-leak');
  });

  it('passes for the FIRST free-tier view of a player in 30 days (preview)', async () => {
    setAuthUser();
    queueTeamOwnedFullPayload({ tier: 'free', viewsInWindow: 0 });

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
  });

  it('returns 402 with the named feature key on the SECOND free-tier view in 30 days', async () => {
    setAuthUser();
    // viewsInWindow >= 1 → second view → 402.
    // The route gates BEFORE reading observations / hitting AI, so the
    // queue only needs the coaches → player → team_coaches → team → views
    // chain (5 reads).
    mockFromFn.mockReturnValueOnce(
      buildChain({ data: { id: COACH_ID, org_id: ORG_ID, full_name: 'Coach', organizations: { tier: 'free' } } }),
    );
    mockFromFn.mockReturnValueOnce(buildChain({ data: PLAYER_FIXTURE }));
    mockFromFn.mockReturnValueOnce(buildChain({ data: { coach_id: COACH_ID } }));
    mockFromFn.mockReturnValueOnce(buildChain({ data: TEAM_FIXTURE }));
    mockFromFn.mockReturnValueOnce(buildChain({ data: [{ id: 'view-1' }] }));

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { reason?: string; feature?: string };
    expect(body.reason).toBe('upgrade-required');
    expect(body.feature).toBe('feature_player_trajectory');
    expect(mockCallAIWithJSON).not.toHaveBeenCalled();
  });

  it('falls back to a generic structured-language sentence when the AI output contains a banned word', async () => {
    setAuthUser();
    mockCallAIWithJSON.mockResolvedValue({
      parsed: {
        started: { headline: 'Hesitated', sentence: 'Started the season hesitating on closeouts.', observation_id: 'obs-0' },
        now: { headline: 'Amazing progress', sentence: 'Her amazing journey shows incredible synergy.', observation_id: 'obs-10' },
        turning_points: [],
      },
      text: '...',
      tokensIn: 1,
      tokensOut: 1,
      latencyMs: 1,
      interactionId: 'int-1',
    });
    queueTeamOwnedFullPayload({});

    const res = await GET(makeRequest(), { params: Promise.resolve({ playerId: PLAYER_ID }) });
    expect(res.status).toBe(200);
    const body = await res.text();
    const lower = body.toLowerCase();
    for (const banned of ['amazing', 'journey', 'synergy']) {
      expect(lower).not.toContain(banned);
    }
  });
});
