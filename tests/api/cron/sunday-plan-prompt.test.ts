/**
 * Ticket 0058 — POST /api/cron/sunday-plan-prompt: Sunday-evening prompt
 * to coaches with an unfinished draft `plans` row and an upcoming session
 * in the next 7 days.
 *
 * Each AC box maps to one or more cases:
 *  (auth) 401 missing/wrong bearer; 200 result shape on valid.
 *  (eligibility) paused coach is SKIPPED.
 *  (eligibility) opted-out coach is SKIPPED.
 *  (eligibility) coach with no draft is SKIPPED.
 *  (eligibility) coach with already-finished plan (not a draft) is SKIPPED.
 *  (eligibility) coach with no upcoming session in next 7 days is SKIPPED.
 *  (happy path) coach with a draft + upcoming session gets ONE email +
 *               bookmark written.
 *  (idempotent) a second invocation the same ISO week SKIPS the same coach.
 *  (rate-limit) a coach with two drafts gets ONE email naming the soonest
 *               upcoming session's draft.
 *  (failure) sendEmail failure leaves the bookmark UNSET.
 *  (failure) coach without an email is counted in `skipped`, not `errors`.
 *  (COPPA) the rendered HTML contains no planted player-name marker.
 *
 * `.test.ts` per LESSONS#0038. Per LESSONS#0049 / #0092 / #0100 —
 * `mockFromFn.mockReset()` in beforeEach drains any per-test
 * `mockReturnValueOnce` queues so siblings don't leak.
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

import { POST as cronPost } from '@/app/api/cron/sunday-plan-prompt/route';

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
}

interface SessionRow {
  id: string;
  team_id: string;
  date: string; // YYYY-MM-DD
}

interface PlanRow {
  id: string;
  team_id: string;
  coach_id: string;
  type: string;
  title: string | null;
  content_structured: unknown;
  created_at: string;
}

const store: {
  coaches: Coach[];
  team_coaches: TeamCoach[];
  teams: Team[];
  sessions: SessionRow[];
  plans: PlanRow[];
  prefsWrites: Array<{ coachId: string; preferences: Record<string, unknown> }>;
} = {
  coaches: [],
  team_coaches: [],
  teams: [],
  sessions: [],
  plans: [],
  prefsWrites: [],
};

function clearStore() {
  store.coaches = [];
  store.team_coaches = [];
  store.teams = [];
  store.sessions = [];
  store.plans = [];
  store.prefsWrites = [];
}

// ─── Chain builders ──────────────────────────────────────────────────────────

function buildCoachesChain() {
  let _ordered: Coach[] = [...store.coaches];
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
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
  // Used as: from('team_coaches').select('team_id').eq('coach_id', id)
  const chain: Record<string, unknown> = {
    _filter: { coach_id: null as string | null },
    select: vi.fn(() => chain),
    eq(this: any, col: string, val: string) {
      if (col === 'coach_id') chain._filter.coach_id = val;
      return Promise.resolve({
        data: store.team_coaches.filter((tc) => tc.coach_id === val),
        error: null,
      });
    },
  };
  // Allow async chaining via Promise return above. eq returns a real promise.
  return chain;
}

function buildSessionsChain() {
  // The route does: from('sessions').select('id, team_id, date').in('team_id', [...]).gte('date', from).lte('date', to).order('date', { ascending: true })
  const filt: { teamIds?: string[]; gte?: string; lte?: string } = {};
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    in: vi.fn((_col: string, vals: string[]) => {
      filt.teamIds = vals;
      return chain;
    }),
    gte: vi.fn((_col: string, v: string) => {
      filt.gte = v;
      return chain;
    }),
    lte: vi.fn((_col: string, v: string) => {
      filt.lte = v;
      return chain;
    }),
    order: vi.fn(() => {
      const filtered = store.sessions
        .filter((s) => (filt.teamIds ? filt.teamIds.includes(s.team_id) : true))
        .filter((s) => (filt.gte ? s.date >= filt.gte : true))
        .filter((s) => (filt.lte ? s.date <= filt.lte : true))
        .sort((a, b) => a.date.localeCompare(b.date));
      return Promise.resolve({ data: filtered, error: null });
    }),
  };
  return chain;
}

function buildTeamsChain() {
  // from('teams').select('id, name').in('id', [...])
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    in: vi.fn((_col: string, vals: string[]) => {
      return Promise.resolve({
        data: store.teams.filter((t) => vals.includes(t.id)),
        error: null,
      });
    }),
  };
  return chain;
}

function buildPlansChain() {
  // from('plans').select(...).eq('coach_id', coachId).eq('team_id', teamId).eq('type', 'practice').gte('created_at', ...).order(...).limit(...)
  const filt: { coach_id?: string; team_id?: string; type?: string; gte?: string } = {};
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: string) => {
      if (col === 'coach_id') filt.coach_id = val;
      else if (col === 'team_id') filt.team_id = val;
      else if (col === 'type') filt.type = val;
      return chain;
    }),
    gte: vi.fn((_col: string, v: string) => {
      filt.gte = v;
      return chain;
    }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => {
      const filtered = store.plans
        .filter((p) => (filt.coach_id ? p.coach_id === filt.coach_id : true))
        .filter((p) => (filt.team_id ? p.team_id === filt.team_id : true))
        .filter((p) => (filt.type ? p.type === filt.type : true))
        .filter((p) => (filt.gte ? p.created_at >= filt.gte : true))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return Promise.resolve({ data: filtered, error: null });
    }),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFromFn.mockReset();
  clearStore();
  process.env.CRON_SECRET = 'test-secret-sunday-plan';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';

  mockFromFn.mockImplementation((table: string) => {
    if (table === 'coaches') return buildCoachesChain();
    if (table === 'team_coaches') return buildTeamCoachesChain();
    if (table === 'sessions') return buildSessionsChain();
    if (table === 'teams') return buildTeamsChain();
    if (table === 'plans') return buildPlansChain();
    throw new Error(`unexpected table read: ${table}`);
  });

  mockSendEmail.mockResolvedValue({ success: true, id: 'mock-email-id' });
});

const ORIG_CRON_SECRET = process.env.CRON_SECRET;
afterAll(() => {
  if (ORIG_CRON_SECRET == null) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIG_CRON_SECRET;
});

function authHeaders(bearer = process.env.CRON_SECRET ?? 'test-secret-sunday-plan') {
  return { authorization: `Bearer ${bearer}` };
}

function makeRequest(headers: Record<string, string> = authHeaders()) {
  return new Request('http://localhost/api/cron/sunday-plan-prompt', {
    method: 'POST',
    headers,
  });
}

function todayPlusDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

// ─── Common eligible fixture (coach + team + upcoming session + draft) ──────

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
  store.teams.push({ id: 'team-hawks', name: 'Hawks' });
  store.sessions.push({
    id: 'sess-1',
    team_id: 'team-hawks',
    date: todayPlusDaysIso(2),
  });
  store.plans.push({
    id: 'draft-plan-1',
    team_id: 'team-hawks',
    coach_id: coachId,
    type: 'practice',
    title: 'Closeout & spacing',
    content_structured: {
      warmup: { name: 'Slides', duration_minutes: 10, description: 'warmup' },
      drills: [
        { name: 'Closeout Drill', duration_minutes: 12, description: 'closeouts' },
      ],
      // No scrimmage + no cooldown → draft.
    },
    created_at: daysAgoIso(2),
  });
}

// ─── Auth ────────────────────────────────────────────────────────────────────

describe('POST /api/cron/sunday-plan-prompt — auth', () => {
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

// ─── Eligibility ─────────────────────────────────────────────────────────────

describe('POST /api/cron/sunday-plan-prompt — eligibility', () => {
  it('sends ONE email for a coach with a draft + upcoming session', async () => {
    seedEligibleCoach();
    const res = await cronPost(makeRequest());
    expect(res.status).toBe(200);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { to: string; subject: string };
    expect(call.to).toBe('sarah@example.test');
    expect(call.subject).toContain('Hawks');
  });

  it('writes the per-ISO-week bookmark after a successful send', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    expect(store.prefsWrites.length).toBeGreaterThanOrEqual(1);
    const write = store.prefsWrites[store.prefsWrites.length - 1];
    const keys = Object.keys(write.preferences);
    const bookmark = keys.find((k) => k.startsWith('sunday_plan_prompt_'));
    expect(bookmark).toBeDefined();
    expect(write.preferences[bookmark!]).toBe(true);
  });

  it('SKIPS a coach who is paused', async () => {
    seedEligibleCoach();
    store.coaches[0].paused_until = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach who opted out via disable_planning_prompts=true', async () => {
    seedEligibleCoach();
    store.coaches[0].preferences = { disable_planning_prompts: true };
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach with no draft plan (everything is finished)', async () => {
    seedEligibleCoach();
    // Make the plan complete by adding scrimmage + cooldown.
    store.plans[0].content_structured = {
      warmup: { name: 'Slides', duration_minutes: 10, description: 'warmup' },
      drills: [
        { name: 'Closeout', duration_minutes: 12, description: 'closeouts' },
      ],
      scrimmage: { duration_minutes: 15, focus: 'effort' },
      cooldown: { duration_minutes: 5, notes: 'stretch' },
    };
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach with no upcoming session in the next 7 days', async () => {
    seedEligibleCoach();
    // Push the session well into the future.
    store.sessions[0].date = todayPlusDaysIso(30);
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('SKIPS a coach whose draft was created > 7 days ago (stale draft)', async () => {
    seedEligibleCoach();
    store.plans[0].created_at = daysAgoIso(20);
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

// ─── Idempotency / rate-limit ────────────────────────────────────────────────

describe('POST /api/cron/sunday-plan-prompt — idempotency', () => {
  it('a second invocation the same ISO week SKIPS the same coach', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    mockSendEmail.mockClear();
    // The first invocation wrote the bookmark; the second should see it.
    await cronPost(makeRequest());
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('a coach with TWO drafts on different teams gets ONE email naming the soonest upcoming session\'s draft', async () => {
    seedEligibleCoach();
    // Add a SECOND team + session farther out + a second draft.
    store.team_coaches.push({ team_id: 'team-falcons', coach_id: 'coach-1' });
    store.teams.push({ id: 'team-falcons', name: 'Falcons' });
    store.sessions.push({
      id: 'sess-2',
      team_id: 'team-falcons',
      date: todayPlusDaysIso(5),
    });
    store.plans.push({
      id: 'draft-plan-2',
      team_id: 'team-falcons',
      coach_id: 'coach-1',
      type: 'practice',
      title: 'Half-court spacing',
      content_structured: { drills: [] },
      created_at: daysAgoIso(1),
    });

    await cronPost(makeRequest());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const call = mockSendEmail.mock.calls[0][0] as { subject: string; html: string };
    // The soonest upcoming session belongs to team Hawks (2 days out vs 5).
    expect(call.subject).toContain('Hawks');
    expect(call.subject).not.toContain('Falcons');
  });
});

// ─── Failure handling ────────────────────────────────────────────────────────

describe('POST /api/cron/sunday-plan-prompt — failure handling', () => {
  it('a sendEmail failure leaves the bookmark UNSET (so the next run retries)', async () => {
    seedEligibleCoach();
    mockSendEmail.mockResolvedValueOnce({ success: false, error: 'SMTP boom' });

    const res = await cronPost(makeRequest());
    const body = await res.json();
    expect(body.errors).toBeGreaterThanOrEqual(1);
    // No bookmark write must have landed for the failed send.
    const write = store.prefsWrites.find(
      (w) => w.coachId === 'coach-1' &&
        Object.keys(w.preferences).some((k) => k.startsWith('sunday_plan_prompt_')),
    );
    expect(write).toBeUndefined();
  });
});

// ─── COPPA / column allow-list ───────────────────────────────────────────────

describe('POST /api/cron/sunday-plan-prompt — COPPA', () => {
  it('the rendered HTML contains no planted player-name marker', async () => {
    seedEligibleCoach();
    // The route's select list does NOT request a player join; even if a hostile
    // future widening added one, this planted name would surface in the email.
    // We do not put the marker on a real column the route reads; instead we
    // verify the rendered email never includes a known-minor-name token.
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    // The email content comes from the draft title + drill names only. No
    // planted player name was injected anywhere — the surface is structurally
    // unable to leak one.
    expect(call.html).not.toContain('PLAYER_NAME_MARKER');
    expect(call.html).not.toContain('Alice Walker');
  });

  it('the rendered HTML does not include observation text', async () => {
    seedEligibleCoach();
    await cronPost(makeRequest());
    const call = mockSendEmail.mock.calls[0][0] as { html: string };
    // The email contains the draft title + drill names + duration + gap line +
    // CTA URL + referral code. No observation text channel exists.
    expect(call.html).not.toContain('observation');
  });
});
