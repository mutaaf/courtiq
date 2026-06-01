/**
 * Ticket 0062 — POST /api/cron/silent-player-nudge.
 *
 * Mid-week (Thursday) nudge to a coach who is ACTIVELY capturing (had any
 * observation in the last 7 days) but has gone 8+ days without saying a
 * single word about one specific player on their roster. ONE email per
 * coach per ISO week, naming ONE player only, deep-linking into Capture
 * focused on that player.
 *
 * Acceptance cases mapped to vitest scenarios:
 *  - 401 on missing bearer; no DB writes.
 *  - 200 with the {sent, skipped, errors} shape on a valid bearer.
 *  - paused coach is SKIPPED.
 *  - opted-out coach (`disable_silent_player_nudge: true`) is SKIPPED.
 *  - coach with NO observation in the last 7 days is SKIPPED (this is the
 *    "totally silent coach" handled by 0042 / 0058, not by this cron).
 *  - coach where EVERY player has been observed in the last 7 days is
 *    SKIPPED (the goal state).
 *  - happy path: sends ONE email naming the longest-silent player + writes
 *    the per-ISO-week bookmark.
 *  - idempotency: a second invocation the same ISO week SKIPS the same
 *    coach (rate-limit).
 *  - multi-team coach: ONE email naming the team where the longest-silent-
 *    player gap is LONGEST overall.
 *  - failure handling: sendEmail failure leaves the bookmark UNSET.
 *  - failure handling: coach without an email is counted as skipped.
 *  - COPPA: the rendered HTML does NOT contain DOB / medical_notes / parent_*
 *    / full-name / jersey_number planted markers.
 *  - the route's coach select keyset is the explicit allow-list (id, email,
 *    full_name, preferences, paused_until); ditto players (id, name,
 *    created_at) and observations (player_id, text, created_at). No widening
 *    of what we read about minors.
 *
 * Per LESSONS#0049 / #0092 / #0100: `mockFromFn.mockReset()` in beforeEach
 * drains per-test `mockReturnValueOnce` queues so siblings don't leak.
 * `.test.ts` per LESSONS#0038.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const { mockFromFn, mockSendEmail } = vi.hoisted(() => ({
  mockFromFn: vi.fn(),
  mockSendEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServiceSupabase: vi.fn(async () => ({ from: mockFromFn })),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mockSendEmail,
}));

import { POST as cronPost } from '@/app/api/cron/silent-player-nudge/route';

// ─── In-memory store ─────────────────────────────────────────────────────────

interface Coach {
  id: string;
  email: string | null;
  full_name: string;
  preferences: Record<string, unknown> | null;
  paused_until: string | null;
  created_at: string;
}

interface TeamCoach {
  team_id: string;
  coach_id: string;
}

interface Team {
  id: string;
  name: string;
  is_active: boolean;
}

interface Player {
  id: string;
  team_id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  // Sentinels for the COPPA assertion — every one of these must NEVER appear
  // in the rendered email body or in the route's coach-/players-select keyset
  // (the route MUST only ask for the columns it actually uses).
  date_of_birth?: string | null;
  medical_notes?: string | null;
  parent_email?: string | null;
  parent_phone?: string | null;
  jersey_number?: number | null;
}

interface ObservationRow {
  player_id: string;
  team_id: string;
  coach_id: string;
  text: string;
  created_at: string;
}

interface SelectAuditEntry {
  table: string;
  select: string;
}

const store: {
  coaches: Coach[];
  team_coaches: TeamCoach[];
  teams: Team[];
  players: Player[];
  observations: ObservationRow[];
  prefsWrites: Array<{ coachId: string; preferences: Record<string, unknown> }>;
  selectAudit: SelectAuditEntry[];
} = {
  coaches: [],
  team_coaches: [],
  teams: [],
  players: [],
  observations: [],
  prefsWrites: [],
  selectAudit: [],
};

function clearStore() {
  store.coaches = [];
  store.team_coaches = [];
  store.teams = [];
  store.players = [];
  store.observations = [];
  store.prefsWrites = [];
  store.selectAudit = [];
}

// ─── Chain builders ──────────────────────────────────────────────────────────

function buildCoachesChain() {
  let _ordered: Coach[] = [...store.coaches];
  const chain: Record<string, unknown> = {
    select: vi.fn((s: string) => {
      store.selectAudit.push({ table: 'coaches', select: s });
      return chain;
    }),
    order: vi.fn(() => {
      _ordered = [..._ordered].sort((a, b) => a.created_at.localeCompare(b.created_at));
      return chain;
    }),
    range: vi.fn((from: number, to: number) =>
      Promise.resolve({ data: _ordered.slice(from, to + 1), error: null }),
    ),
    update: vi.fn((patch: { preferences: Record<string, unknown> }) => ({
      eq: vi.fn((_col: string, id: string) => {
        store.prefsWrites.push({ coachId: id, preferences: patch.preferences });
        const c = store.coaches.find((x) => x.id === id);
        if (c) c.preferences = patch.preferences;
        return Promise.resolve({ error: null });
      }),
    })),
  };
  return chain;
}

function buildTeamCoachesChain() {
  // from('team_coaches').select('team_id').eq('coach_id', id)
  const chain = {
    select: vi.fn((s: string) => {
      store.selectAudit.push({ table: 'team_coaches', select: s });
      return chain;
    }),
    eq(_col: string, val: string) {
      return Promise.resolve({
        data: store.team_coaches.filter((tc) => tc.coach_id === val),
        error: null,
      });
    },
  };
  return chain;
}

function buildTeamsChain() {
  // from('teams').select('id, name, is_active').in('id', [...]).eq('is_active', true)
  // Thenable so the route awaits the chain after the LAST .eq() call.
  const filt: { ids?: string[]; isActive?: boolean } = {};
  function resolveData() {
    const filtered = store.teams
      .filter((t) => (filt.ids ? filt.ids.includes(t.id) : true))
      .filter((t) => (filt.isActive !== undefined ? t.is_active === filt.isActive : true));
    return { data: filtered, error: null };
  }
  const chain: Record<string, unknown> = {
    select: vi.fn((s: string) => {
      store.selectAudit.push({ table: 'teams', select: s });
      return chain;
    }),
    in: vi.fn((_col: string, vals: string[]) => {
      filt.ids = vals;
      return chain;
    }),
    eq: vi.fn((_col: string, val: boolean) => {
      filt.isActive = val;
      return chain;
    }),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(resolveData()).then(resolve),
  };
  return chain;
}

function buildPlayersChain() {
  // from('players').select('id, name, created_at').eq('team_id', teamId).eq('is_active', true)
  //
  // Players chain is `thenable`: the route awaits the chain after the LAST
  // .eq() call. We accumulate filters across both .eq() calls and resolve to
  // the filtered set when awaited.
  const filt: { teamId?: string; isActive?: boolean } = {};
  function resolveData() {
    const filtered = store.players
      .filter((p) => (filt.teamId ? p.team_id === filt.teamId : true))
      .filter((p) => (filt.isActive !== undefined ? p.is_active === filt.isActive : true))
      // Return the public allow-list shape; sentinel COPPA columns are NEVER
      // included in the projection.
      .map((p) => ({ id: p.id, name: p.name, created_at: p.created_at }));
    return { data: filtered, error: null };
  }
  const chain: Record<string, unknown> = {
    select: vi.fn((s: string) => {
      store.selectAudit.push({ table: 'players', select: s });
      return chain;
    }),
    eq: vi.fn((col: string, val: unknown) => {
      if (col === 'team_id') filt.teamId = val as string;
      else if (col === 'is_active') filt.isActive = val as boolean;
      return chain;
    }),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve(resolveData()).then(resolve),
  };
  return chain;
}

function buildObservationsChain() {
  // from('observations').select('player_id, text, created_at').in('player_id', [...]).order('created_at', { ascending: false })
  // OR for the activity check:
  // from('observations').select('id').eq('coach_id', coachId).gte('created_at', sevenDaysAgo).limit(1)
  const filt: {
    playerIds?: string[];
    coachId?: string;
    teamId?: string;
    gte?: string;
  } = {};
  const chain: Record<string, unknown> = {
    select: vi.fn((s: string) => {
      store.selectAudit.push({ table: 'observations', select: s });
      return chain;
    }),
    in: vi.fn((_col: string, vals: string[]) => {
      filt.playerIds = vals;
      return chain;
    }),
    eq: vi.fn((col: string, val: string) => {
      if (col === 'coach_id') filt.coachId = val;
      else if (col === 'team_id') filt.teamId = val;
      return chain;
    }),
    gte: vi.fn((_col: string, v: string) => {
      filt.gte = v;
      return chain;
    }),
    order: vi.fn(() => {
      const filtered = store.observations
        .filter((o) => (filt.playerIds ? filt.playerIds.includes(o.player_id) : true))
        .filter((o) => (filt.coachId ? o.coach_id === filt.coachId : true))
        .filter((o) => (filt.teamId ? o.team_id === filt.teamId : true))
        .filter((o) => (filt.gte ? o.created_at >= filt.gte : true))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return Promise.resolve({ data: filtered, error: null });
    }),
    limit: vi.fn(() => {
      const filtered = store.observations
        .filter((o) => (filt.coachId ? o.coach_id === filt.coachId : true))
        .filter((o) => (filt.gte ? o.created_at >= filt.gte : true));
      return Promise.resolve({ data: filtered.slice(0, 1), error: null });
    }),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  clearStore();
  process.env.CRON_SECRET = 'test-secret-silent-player';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return buildCoachesChain();
    if (table === 'team_coaches') return buildTeamCoachesChain();
    if (table === 'teams') return buildTeamsChain();
    if (table === 'players') return buildPlayersChain();
    if (table === 'observations') return buildObservationsChain();
    throw new Error(`unexpected table read: ${table}`);
  });

  mockSendEmail.mockResolvedValue({ success: true, id: 'mock-email-id' });
});

const ORIG_CRON_SECRET = process.env.CRON_SECRET;
afterAll(() => {
  if (ORIG_CRON_SECRET == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON_SECRET;
});

function authHeaders(bearer = process.env.CRON_SECRET ?? 'test-secret-silent-player') {
  return { authorization: `Bearer ${bearer}` };
}

function makeRequest(headers: Record<string, string> = authHeaders()) {
  return new Request('http://localhost/api/cron/silent-player-nudge', {
    method: 'POST',
    headers,
  });
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ─── Eligible fixture ───────────────────────────────────────────────────────

function seedEligibleCoach(coachId = 'coach-1') {
  store.coaches.push({
    id: coachId,
    email: 'sarah@example.test',
    full_name: 'Sarah Rivers',
    preferences: {},
    paused_until: null,
    created_at: '2026-01-01T00:00:00Z',
  });
  store.team_coaches.push({ team_id: 'team-hawks', coach_id: coachId });
  store.teams.push({ id: 'team-hawks', name: 'Hawks', is_active: true });
  store.players.push({
    id: 'player-maya',
    team_id: 'team-hawks',
    name: 'Maya Johnson',
    is_active: true,
    created_at: daysAgoIso(60),
    // Sentinel COPPA columns — must NEVER leak into the rendered email.
    date_of_birth: '2014-03-15',
    medical_notes: 'Asthma, requires inhaler',
    parent_email: 'maya-parent@example.test',
    parent_phone: '+15555550101',
    jersey_number: 23,
  });
  store.players.push({
    id: 'player-other',
    team_id: 'team-hawks',
    name: 'Bob Carter',
    is_active: true,
    created_at: daysAgoIso(60),
  });
  // Maya hasn't been observed in 10 days; Bob was observed yesterday.
  store.observations.push({
    player_id: 'player-maya',
    team_id: 'team-hawks',
    coach_id: coachId,
    text: 'hesitated on closeouts',
    created_at: daysAgoIso(10),
  });
  store.observations.push({
    player_id: 'player-other',
    team_id: 'team-hawks',
    coach_id: coachId,
    text: 'strong rebound',
    created_at: daysAgoIso(1),
  });
  // The coach has activity in the last 7 days (Bob's observation above
  // counts as the coach's activity).
}

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('POST /api/cron/silent-player-nudge — auth', () => {
  it('401 on missing bearer; no DB write', async () => {
    const res = await cronPost(makeRequest({}));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(store.prefsWrites).toEqual([]);
  });

  it('401 on wrong bearer; no DB write', async () => {
    const res = await cronPost(makeRequest({ authorization: 'Bearer no' }));
    expect(res.status).toBe(401);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('200 with the {sent, skipped, errors} shape on a valid bearer', async () => {
    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      sent: expect.any(Number),
      skipped: expect.any(Number),
      errors: expect.any(Number),
    });
  });
});

// ─── Happy path ──────────────────────────────────────────────────────────────

describe('POST /api/cron/silent-player-nudge — happy path', () => {
  it('sends ONE email naming the longest-silent player; writes the per-ISO-week bookmark', async () => {
    seedEligibleCoach();
    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as {
      to: string;
      subject: string;
      html: string;
    };
    expect(call.to).toBe('sarah@example.test');
    expect(call.subject).toContain('Maya');
    // Bookmark was written for this coach for the current ISO week.
    expect(store.prefsWrites.length).toBeGreaterThanOrEqual(1);
    const write = store.prefsWrites[store.prefsWrites.length - 1];
    const key = Object.keys(write.preferences).find((k) =>
      k.startsWith('silent_player_nudge_'),
    );
    expect(key).toBeDefined();
    expect(write.preferences[key!]).toBe(true);
  });
});

// ─── Eligibility skips ──────────────────────────────────────────────────────

describe('POST /api/cron/silent-player-nudge — eligibility', () => {
  it('SKIPS a coach who is paused', async () => {
    seedEligibleCoach();
    store.coaches[0].paused_until = new Date(
      Date.now() + 20 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach who opted out via disable_silent_player_nudge=true', async () => {
    seedEligibleCoach();
    store.coaches[0].preferences = { disable_silent_player_nudge: true };
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach with NO observation in the last 7 days (handled by 0042 / 0058)', async () => {
    seedEligibleCoach();
    // Push the only recent observation OUT of the 7-day activity window.
    store.observations = store.observations.map((o) => ({
      ...o,
      created_at: daysAgoIso(60),
    }));
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach where EVERY player has been observed in the last 7 days', async () => {
    seedEligibleCoach();
    // Re-stamp Maya's gap so she's now ALSO inside the 7-day window.
    store.observations = store.observations.map((o) =>
      o.player_id === 'player-maya' ? { ...o, created_at: daysAgoIso(1) } : o,
    );
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach without an email (counted as skipped, not error)', async () => {
    seedEligibleCoach();
    store.coaches[0].email = null;
    const res = await cronPost(makeRequest());
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.errors).toBe(0);
    expect(body.skipped).toBeGreaterThanOrEqual(1);
  });
});

// ─── Idempotency / multi-team ───────────────────────────────────────────────

describe('POST /api/cron/silent-player-nudge — idempotency', () => {
  it('a second invocation the same ISO week SKIPS the same coach', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    mockSendEmail.mockClear();
    // The first invocation wrote the bookmark; the second should see it.
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('a 2-team coach with gaps [team A: 9d, team B: 20d] picks team B', async () => {
    seedEligibleCoach();
    // Add a SECOND team where a player has been silent for 20 days.
    store.team_coaches.push({ team_id: 'team-falcons', coach_id: 'coach-1' });
    store.teams.push({ id: 'team-falcons', name: 'Falcons', is_active: true });
    store.players.push({
      id: 'player-jordan',
      team_id: 'team-falcons',
      name: 'Jordan Lee',
      is_active: true,
      created_at: daysAgoIso(60),
    });
    store.observations.push({
      player_id: 'player-jordan',
      team_id: 'team-falcons',
      coach_id: 'coach-1',
      text: 'looked stiff on the perimeter',
      created_at: daysAgoIso(20),
    });
    // Re-stamp Maya's gap to 9 days so the comparison is gap(9) vs gap(20).
    store.observations = store.observations.map((o) =>
      o.player_id === 'player-maya' ? { ...o, created_at: daysAgoIso(9) } : o,
    );

    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { subject: string; html: string };
    // The longest-silent player is Jordan on team Falcons.
    expect(call.subject).toContain('Jordan');
    expect(call.subject).not.toContain('Maya');
    expect(call.html).toContain('Falcons');
  });
});

// ─── Failure handling ───────────────────────────────────────────────────────

describe('POST /api/cron/silent-player-nudge — failure handling', () => {
  it('a sendEmail failure leaves the bookmark UNSET (so the next run retries)', async () => {
    seedEligibleCoach();
    mockSendEmail.mockResolvedValueOnce({ success: false, error: 'SMTP boom' });

    const res = await cronPost(makeRequest());
    const body = await res.json();
    expect(body.errors).toBeGreaterThanOrEqual(1);
    const write = store.prefsWrites.find(
      (w) =>
        w.coachId === 'coach-1' &&
        Object.keys(w.preferences).some((k) => k.startsWith('silent_player_nudge_')),
    );
    expect(write).toBeUndefined();
  });
});

// ─── COPPA / column allow-list ──────────────────────────────────────────────

describe('POST /api/cron/silent-player-nudge — COPPA', () => {
  it('the rendered HTML contains no DOB / medical_notes / parent_email / parent_phone / jersey number', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    // None of the COPPA-sensitive fields planted on the Maya row leak out.
    expect(call.html).not.toContain('2014-03-15');
    expect(call.html).not.toContain('Asthma');
    expect(call.html).not.toContain('inhaler');
    expect(call.html).not.toContain('maya-parent@example.test');
    expect(call.html).not.toContain('+15555550101');
    expect(call.html).not.toContain('23'); // jersey number — never used in the email body
  });

  it('the rendered HTML contains only the player FIRST name, not the full name', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    expect(call.html).toContain('Maya');
    expect(call.html).not.toContain('Maya Johnson');
  });

  it('the route only selects columns from the COPPA allow-list on each touched table', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    // Check the audited select strings.
    const playersSelects = store.selectAudit.filter((s) => s.table === 'players');
    const obsSelects = store.selectAudit.filter((s) => s.table === 'observations');
    const coachSelects = store.selectAudit.filter((s) => s.table === 'coaches');

    expect(playersSelects.length).toBeGreaterThanOrEqual(1);
    for (const s of playersSelects) {
      // The allow-list for the player surface: id, name, created_at. Nothing
      // descriptive about the minor.
      expect(s.select).not.toMatch(/date_of_birth/);
      expect(s.select).not.toMatch(/medical_notes/);
      expect(s.select).not.toMatch(/parent_email/);
      expect(s.select).not.toMatch(/parent_phone/);
      expect(s.select).not.toMatch(/jersey_number/);
      expect(s.select).not.toMatch(/photo_url/);
    }
    expect(obsSelects.length).toBeGreaterThanOrEqual(1);
    for (const s of obsSelects) {
      // The observations select-set never asks for sentiment / category / etc.
      // beyond what the email surfaces (player_id, text, created_at) and the
      // "did the coach observe anything in the last 7d" probe (id).
      expect(s.select).not.toMatch(/sentiment/);
      expect(s.select).not.toMatch(/category/);
      expect(s.select).not.toMatch(/recording_id/);
      expect(s.select).not.toMatch(/raw_text/);
      expect(s.select).not.toMatch(/audio_annotation/);
    }
    expect(coachSelects.length).toBeGreaterThanOrEqual(1);
    for (const s of coachSelects) {
      // The coach select-set is the established allow-list (id, email,
      // full_name, preferences, paused_until). No widening here.
      expect(s.select).not.toMatch(/avatar_url/);
      expect(s.select).not.toMatch(/onboarding_complete/);
      expect(s.select).not.toMatch(/role/);
      expect(s.select).not.toMatch(/handle/);
    }
  });

  it('the email is sent ONLY to the coach (no parent address on the To line)', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { to: string };
    expect(call.to).toBe('sarah@example.test');
    expect(call.to).not.toContain('maya-parent@example.test');
  });
});
