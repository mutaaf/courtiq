/**
 * POST /api/labs/chalk-talk/[task]: Chalk Talk AI, resold by CourtIQ.
 * 401 signed out · 402 {upgrade} with no plan · 402 {fallback} when this month's cap is used · 400/404 bad
 * request · a paid call is drawn with the shared chalk-talk/server request, and every call (ok or failed)
 * writes one audit row to ai_ledger with exact token counts, cost and the provider's request id.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockCreate, db } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockCreate: vi.fn(), db: { org: null as any, spent: 0, ledger: [] as any[] } }));

function admin() {
  return {
    from: (t: string) => t === 'ai_ledger'
      ? { insert: async (row: any) => { db.ledger.push(row); return { error: null }; } }
      : { select: () => ({ eq: () => ({ single: async () => ({ data: db.org ? { org_id: 'o1', organizations: db.org } : null }) }) }) },
    rpc: async () => ({ data: db.spent, error: null }),
  };
}
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
  createServiceSupabase: vi.fn(async () => admin()),
}));
vi.mock('@/lib/rate-limit', () => ({ checkAIRateLimit: vi.fn(async () => ({ allowed: true, limit: 150, remaining: 149, resetAt: 0 })) }));
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500; }
  class Anthropic { messages = { create: mockCreate }; static APIError = APIError; }
  return { default: Anthropic };
});

import { POST } from '@/app/api/labs/chalk-talk/[task]/route';
import { getSport } from 'chalk-talk/sports';

const call = (task: string, body: unknown, headers: Record<string, string> = {}) => POST(new Request('http://x/api/labs/chalk-talk/' + task, { method: 'POST', body: JSON.stringify(body), headers }), { params: Promise.resolve({ task }) });
const signedIn = (org: any) => { mockGetUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } }); db.org = org; };
const play = () => Object.assign({ reply: 'Drawn.', recognized: 'pick-and-roll', suggestions: [] }, getSport('basketball').plays.find((p: any) => p.key === 'pick-and-roll'));

describe('POST /api/labs/chalk-talk/[task]', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.ANTHROPIC_API_KEY = 'test'; db.spent = 0; db.ledger = []; });

  it('401 when signed out (and a bad link token is no better)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await call('play', { sport: 'basketball', text: 'x' })).status).toBe(401);
    process.env.CHALK_TALK_LINK_SECRET = 's';
    expect((await call('play', { sport: 'basketball', text: 'x' }, { authorization: 'Bearer nope.nope' })).status).toBe(401);
  });

  it('402 upgrade on the free tier with no AI plan', async () => {
    signedIn({ tier: 'free', chalk_talk_ai_status: null });
    const r = await call('play', { sport: 'basketball', text: 'pick and roll' });
    expect(r.status).toBe(402); expect((await r.json()).upgrade).toBe(true); expect(mockCreate).not.toHaveBeenCalled();
  });

  it('402 fallback once the month’s cap is used (the board then uses the free AI)', async () => {
    signedIn({ tier: 'coach' }); db.spent = 1_000_000;
    const r = await call('play', { sport: 'basketball', text: 'pick and roll' });
    expect(r.status).toBe(402); expect((await r.json()).fallback).toBe(true); expect(mockCreate).not.toHaveBeenCalled();
  });

  it('400 / 404 on a bad request', async () => {
    signedIn({ tier: 'coach' });
    expect((await call('play', { sport: 'cricket', text: 'x' })).status).toBe(400);
    expect((await call('nap', { sport: 'basketball' })).status).toBe(404);
  });

  it('draws for the AI plan, returns usage headers, and writes one exact ledger row', async () => {
    signedIn({ tier: 'free', chalk_talk_ai_status: 'active' });
    mockCreate.mockResolvedValue({ id: 'msg_1', content: [{ type: 'text', text: JSON.stringify(play()) }], stop_reason: 'end_turn', usage: { input_tokens: 5000, output_tokens: 1100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } });
    const r = await call('play', { sport: 'basketball', text: '5 sets a ball screen for 1 and rolls' });
    expect(r.status).toBe(200);
    expect(r.headers.get('x-ct-plan')).toBe('ai_plan');
    expect(r.headers.get('x-ct-left')).toBe('2.9790');
    expect(mockCreate.mock.calls[0][0].output_config.format.type).toBe('json_schema');
    expect(db.ledger).toHaveLength(1);
    expect(db.ledger[0]).toMatchObject({ org_id: 'o1', coach_id: 'coach-1', plan: 'ai_plan', task: 'play', model: 'claude-sonnet-5-5', input_tokens: 5000, output_tokens: 1100, cost_micros: 21000, request_ids: ['msg_1'], status: 'ok' });
  });

  it('runs brains on the lite model under the included allowance', async () => {
    signedIn({ tier: 'pro_coach' });
    mockCreate.mockResolvedValue({ id: 'msg_2', content: [{ type: 'text', text: '{"read":"I see X5 drop.","risk":"Rolling early.","tip":"Roll on the turn."}' }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 60 } });
    const r = await call('brain', { sport: 'basketball', play: getSport('basketball').plays.find((p: any) => p.key === 'pick-and-roll'), id: 'O5', mode: 'film' });
    expect(r.status).toBe(200); expect(mockCreate.mock.calls[0][0].model).toBe('claude-haiku-5-5');
    expect(db.ledger[0]).toMatchObject({ plan: 'included', task: 'brain', status: 'ok' });
  });

  it('a failed call is still recorded (its tokens cost money too)', async () => {
    signedIn({ tier: 'coach' });
    mockCreate.mockResolvedValue({ id: 'msg_3', content: [{ type: 'text', text: 'not json' }], stop_reason: 'end_turn', usage: { input_tokens: 4000, output_tokens: 50 } });
    const r = await call('play', { sport: 'basketball', text: 'pick and roll' });
    expect(r.status).toBe(502);
    expect(db.ledger).toHaveLength(1); expect(db.ledger[0].status).toBe('error'); expect(db.ledger[0].input_tokens).toBe(8000);
  });
});
