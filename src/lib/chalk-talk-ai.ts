// Chalk Talk AI, resold by CourtIQ. Who may use it, how much, what each call cost, and the audit row.
//
//   ai_plan   the Chalk Talk AI subscription ($9.99/mo list, $4.99 launch price locked in by a Stripe coupon):
//             a $3/month fair-use cap on what the calls cost us
//   included  any paid CourtIQ tier: a $1/month allowance
//   none      free tier, no AI plan: 402, the board offers the upgrade
// Over the cap the route answers 402 with { fallback: true } and the board quietly uses the free open-model AI.
//
// Costs are computed from the provider's own usage numbers at list prices, in integer micro-dollars, and
// written to ai_ledger (append-only) with the price-table version, so a month's spend can be re-derived and
// audited call by call. Spend is month-to-date in UTC.

import type { Tier } from '@/lib/tier';

export const PRICE_VERSION = 'anthropic-2026-10-30';
// USD per million tokens: input, output, cache read, cache write (5-minute)
export const MODEL_PRICES: Record<string, [number, number, number, number]> = {
  'claude-sonnet-5-5': [2, 10, 0.2, 2.5],
  'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125],
};

export const CAP_USD = { ai_plan: 3, included: 1 } as const;
export type AIPlan = keyof typeof CAP_USD;

export const PLAN_LIST_PRICE = 9.99;
export const PLAN_LAUNCH_PRICE = 4.99;

const LIVE = new Set(['active', 'trialing', 'past_due']);   // past_due: Stripe is still retrying, keep the coach working

export interface OrgAIFields {
  tier?: Tier | string | null;
  chalk_talk_ai_status?: string | null;
}

/** Which plan pays for this org's Chalk Talk AI, if any. The AI plan wins over the included allowance. */
export function planFor(org: OrgAIFields | null | undefined): AIPlan | null {
  if (!org) return null;
  if (org.chalk_talk_ai_status && LIVE.has(org.chalk_talk_ai_status)) return 'ai_plan';
  if (org.tier && org.tier !== 'free') return 'included';
  return null;
}

export const capMicros = (plan: AIPlan) => Math.round(CAP_USD[plan] * 1e6);

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }

/** Exact cost of one call in micro-dollars at list prices (unknown models cost the most expensive rate). */
export function costMicros(model: string, u: Usage): number {
  const p = MODEL_PRICES[model] || MODEL_PRICES['claude-sonnet-5-5'];
  // tokens × USD/Mtok = micro-dollars; round up so we never under-count
  return Math.ceil(u.input * p[0] + u.output * p[1] + u.cacheRead * p[2] + u.cacheWrite * p[3]);
}

/** Start of the current usage period (the UTC calendar month). */
export function periodStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface LedgerRow {
  org_id: string;
  coach_id: string | null;
  plan: AIPlan;
  task: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_micros: number;
  price_version: string;
  request_ids: string[];
  latency_ms: number;
  status: 'ok' | 'error' | 'refused';
}

export function ledgerRow(a: { orgId: string; coachId: string | null; plan: AIPlan; task: string; model: string; usage: Usage; requestIds: string[]; latencyMs: number; status: LedgerRow['status'] }): LedgerRow {
  return {
    org_id: a.orgId,
    coach_id: a.coachId,
    plan: a.plan,
    task: a.task,
    model: a.model,
    input_tokens: a.usage.input,
    output_tokens: a.usage.output,
    cache_read_tokens: a.usage.cacheRead,
    cache_write_tokens: a.usage.cacheWrite,
    cost_micros: costMicros(a.model, a.usage),
    price_version: PRICE_VERSION,
    request_ids: a.requestIds.slice(0, 4),
    latency_ms: Math.round(a.latencyMs),
    status: a.status,
  };
}

/** Month-to-date spend and what's left, for the gate and the usage card. */
export async function spend(admin: any, orgId: string, plan: AIPlan, now = new Date()) {
  const { data, error } = await admin.rpc('ai_spend_since', { p_org: orgId, p_since: periodStart(now).toISOString() });
  if (error) throw error;
  const used = Number(data || 0), cap = capMicros(plan);
  return { usedMicros: used, capMicros: cap, leftMicros: Math.max(0, cap - used), over: used >= cap };
}
