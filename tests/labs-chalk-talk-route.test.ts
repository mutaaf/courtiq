/**
 * Vitest for POST /api/labs/chalk-talk/[task]: Chalk Talk's AI runs on CourtIQ for paid plans only.
 * 401 signed out, 402 on the free plan (the board then offers /settings/upgrade), 400 on a bad body,
 * and a paid coach's play is drawn with the shared chalk-talk/server request and returned with usage headers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetUser, mockFromFn, mockCreate } = vi.hoisted(() => ({ mockGetUser: vi.fn(), mockFromFn: vi.fn(), mockCreate: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFromFn })),
  createServiceSupabase: vi.fn(async () => ({ auth: { getUser: mockGetUser }, from: mockFromFn })),
}));
vi.mock('@/lib/rate-limit', () => ({ checkAIRateLimit: vi.fn(async () => ({ allowed: true, limit: 150, remaining: 149, resetAt: 0 })) }));
vi.mock('@anthropic-ai/sdk', () => {
  class APIError extends Error { status = 500; }
  class Anthropic { messages = { create: mockCreate }; static APIError = APIError; }
  return { default: Anthropic };
});

import { POST } from '@/app/api/labs/chalk-talk/[task]/route';
import { getSport } from 'chalk-talk/sports';

const chain = (data: unknown) => ({ select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data, error: null }) });
const call = (task: string, body: unknown) => POST(new Request('http://x/api/labs/chalk-talk/' + task, { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ task }) });
const asTier = (tier: string) => { mockGetUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } }); mockFromFn.mockReturnValue(chain({ org_id: 'o1', organizations: { tier } })); };

describe('POST /api/labs/chalk-talk/[task]', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.ANTHROPIC_API_KEY = 'test'; });

  it('401 when signed out', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect((await call('play', { sport: 'basketball', text: 'x' })).status).toBe(401);
  });

  it('402 on the free plan, so the board offers the upgrade', async () => {
    asTier('free');
    const r = await call('play', { sport: 'basketball', text: 'pick and roll' });
    expect(r.status).toBe(402);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('400 on a bad request', async () => {
    asTier('coach');
    expect((await call('play', { sport: 'cricket', text: 'x' })).status).toBe(400);
    expect((await call('nap', { sport: 'basketball' })).status).toBe(404);
  });

  it('draws a play for a paid coach with the shared request and returns usage headers', async () => {
    asTier('pro_coach');
    const play = Object.assign({ reply: 'Drawn.', recognized: 'pick-and-roll', suggestions: [] }, getSport('basketball').plays.find((p: any) => p.key === 'pick-and-roll'));
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: JSON.stringify(play) }], stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 300, cache_read_input_tokens: 0 } });
    const r = await call('play', { sport: 'basketball', text: '5 sets a ball screen for 1 and rolls' });
    expect(r.status).toBe(200);
    expect((await r.json()).recognized).toBe('pick-and-roll');
    expect(r.headers.get('x-ct-model')).toBe('claude-sonnet-5-5');
    const args = mockCreate.mock.calls[0][0];
    expect(args.output_config.format.type).toBe('json_schema');
  });

  it('runs brains on the lite model', async () => {
    asTier('coach');
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: '{"read":"I see X5 drop.","risk":"Rolling early.","tip":"Roll on the turn."}' }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 60 } });
    const play = getSport('basketball').plays.find((p: any) => p.key === 'pick-and-roll');
    const r = await call('brain', { sport: 'basketball', play, id: 'O5', mode: 'film' });
    expect(r.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].model).toBe('claude-haiku-5-5');
  });
});
