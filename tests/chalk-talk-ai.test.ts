/**
 * Chalk Talk AI, resold by CourtIQ: who gets it (planFor), what each call costs (integer micro-dollars from
 * the provider's own token counts), the usage period, the link token for mutaafaziz.com, and the Stripe
 * webhook keeping the AI plan apart from the main plan.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planFor, costMicros, periodStart, capMicros, ledgerRow, CAP_USD } from '@/lib/chalk-talk-ai';
import { createLinkToken, verifyLinkToken, safeReturn, linkCors } from '@/lib/chalk-talk-link';

describe('planFor', () => {
  it('the AI plan wins, any paid tier gets the included allowance, free gets nothing', () => {
    expect(planFor({ tier: 'free', chalk_talk_ai_status: 'active' })).toBe('ai_plan');
    expect(planFor({ tier: 'coach', chalk_talk_ai_status: 'past_due' })).toBe('ai_plan');
    expect(planFor({ tier: 'pro_coach', chalk_talk_ai_status: 'canceled' })).toBe('included');
    expect(planFor({ tier: 'organization' })).toBe('included');
    expect(planFor({ tier: 'free' })).toBeNull();
    expect(planFor({ tier: 'free', chalk_talk_ai_status: 'canceled' })).toBeNull();
    expect(planFor(null)).toBeNull();
  });
  it('caps: $3 on the AI plan, $1 included', () => {
    expect(capMicros('ai_plan')).toBe(3_000_000);
    expect(capMicros('included')).toBe(1_000_000);
    expect(CAP_USD.ai_plan).toBeGreaterThan(CAP_USD.included);
  });
});

describe('costMicros', () => {
  it('prices a Sonnet play exactly from token counts (list prices, micro-dollars)', () => {
    // 5,000 in × $2/M + 1,100 out × $10/M = 0.01 + 0.011 = $0.021
    expect(costMicros('claude-sonnet-5-5', { input: 5000, output: 1100, cacheRead: 0, cacheWrite: 0 })).toBe(21_000);
  });
  it('counts cache reads and writes at their own rates, and Haiku at its own', () => {
    expect(costMicros('claude-sonnet-5-5', { input: 0, output: 0, cacheRead: 10_000, cacheWrite: 1000 })).toBe(2000 + 2500);
    expect(costMicros('claude-haiku-5-5', { input: 2000, output: 300, cacheRead: 0, cacheWrite: 0 })).toBe(350);
  });
  it('an unknown model is charged at the most expensive rate, never for free', () => {
    expect(costMicros('mystery', { input: 1000, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe(2000);
  });
  it('a ledger row carries the price version and the cost', () => {
    const r = ledgerRow({ orgId: 'o', coachId: 'c', plan: 'included', task: 'play', model: 'claude-sonnet-5-5', usage: { input: 5000, output: 1100, cacheRead: 0, cacheWrite: 0 }, requestIds: ['msg_1'], latencyMs: 9000.4, status: 'ok' });
    expect(r.cost_micros).toBe(21_000); expect(r.price_version).toMatch(/^anthropic-/); expect(r.latency_ms).toBe(9000);
  });
});

describe('periodStart', () => {
  it('is the first of the UTC month', () => {
    expect(periodStart(new Date('2026-10-30T23:59:00Z')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(periodStart(new Date('2026-11-01T00:00:01Z')).toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
});

describe('link tokens for mutaafaziz.com/chalktalk', () => {
  beforeEach(() => { process.env.CHALK_TALK_LINK_SECRET = 'test-secret'; });
  it('round-trips, rejects tampering and expiry', () => {
    const t = createLinkToken('coach-1', Date.parse('2026-10-30T00:00:00Z'));
    expect(verifyLinkToken(t, Date.parse('2026-11-01T00:00:00Z'))).toBe('coach-1');
    expect(verifyLinkToken(t, Date.parse('2026-12-30T00:00:00Z'))).toBeNull();
    const [body, mac] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'coach-2', exp: 4e9, v: 1 })).toString('base64url') + '.' + mac;
    expect(verifyLinkToken(forged)).toBeNull();
    expect(verifyLinkToken(body + '.x')).toBeNull();
  });
  it('only returns coaches to the standalone board, and only allows its origin', () => {
    expect(safeReturn('https://evil.example/chalktalk/')).toBe('https://mutaafaziz.com/chalktalk/');
    expect(safeReturn('https://mutaafaziz.com/chalktalk/')).toBe('https://mutaafaziz.com/chalktalk/');
    expect(linkCors(new Request('http://x', { headers: { origin: 'https://evil.example' } }))).toEqual({});
    expect(linkCors(new Request('http://x', { headers: { origin: 'https://mutaafaziz.com' } }))['access-control-allow-origin']).toBe('https://mutaafaziz.com');
  });
});
