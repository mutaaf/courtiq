import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { planFor, spend, periodStart, CAP_USD, PLAN_LIST_PRICE, PLAN_LAUNCH_PRICE } from '@/lib/chalk-talk-ai';
import { verifyLinkToken, linkCors } from '@/lib/chalk-talk-link';

// GET: this month's Chalk Talk AI for the caller's org: plan, used, cap, and calls by task (from ai_ledger).
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: linkCors(request) });
}
export async function GET(request: Request) {
  const cors = linkCors(request);
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  let coachId: string | null = bearer ? verifyLinkToken(bearer) : null;
  if (!bearer) { const s = await createServerSupabase(); const { data: { user } } = await s.auth.getUser(); coachId = user ? user.id : null; }
  if (!coachId) return NextResponse.json({ error: 'Sign in.' }, { status: 401, headers: cors });

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id, organizations(tier, chalk_talk_ai_status, chalk_talk_ai_period_end, chalk_talk_ai_cancel_at_period_end)').eq('id', coachId).single();
  const org = (coach as any)?.organizations, orgId = (coach as any)?.org_id;
  const plan = planFor(org);
  const offer = { list: PLAN_LIST_PRICE, launch: PLAN_LAUNCH_PRICE };
  if (!orgId || !plan) return NextResponse.json({ plan: null, offer }, { headers: cors });
  const s = await spend(admin, orgId, plan);
  const { data: rows } = await admin.from('ai_ledger').select('task, cost_micros, status').eq('org_id', orgId).gte('created_at', periodStart().toISOString());
  const byTask: Record<string, { calls: number; usd: number }> = {};
  (rows || []).forEach((r: any) => { const t = (byTask[r.task] = byTask[r.task] || { calls: 0, usd: 0 }); t.calls++; t.usd += r.cost_micros / 1e6; });
  return NextResponse.json({
    plan, capUSD: CAP_USD[plan], usedUSD: s.usedMicros / 1e6, leftUSD: s.leftMicros / 1e6, period: periodStart().toISOString().slice(0, 7),
    renews: org?.chalk_talk_ai_period_end || null, canceling: !!org?.chalk_talk_ai_cancel_at_period_end, byTask, offer,
  }, { headers: cors });
}
