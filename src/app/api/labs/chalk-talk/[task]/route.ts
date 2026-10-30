import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requestFor, solve, LITE } from 'chalk-talk/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { checkAIRateLimit } from '@/lib/rate-limit';
import { planFor, spend, ledgerRow, type Usage } from '@/lib/chalk-talk-ai';
import { verifyLinkToken, linkCors } from '@/lib/chalk-talk-link';

// Chalk Talk's AI, resold by CourtIQ (src/lib/chalk-talk-ai.ts has the plans and caps). The board sends the
// same requests it sends the free API; they run here on CourtIQ's Anthropic key. Prompts, schemas, validation
// and the repair round come from chalk-talk/server, so plays come out the same everywhere. This route calls
// the SDK directly rather than callAI(): it needs structured outputs with a repair round, and it writes its
// own audit row per call to ai_ledger (tokens, exact cost, provider request ids).
//
// Who: a signed-in CourtIQ coach (cookie), or the same coach on mutaafaziz.com/chalktalk with a link token
// (Authorization: Bearer, see /api/labs/chalk-talk/link). Requests carry X's and O's only.
//   402 { upgrade: true }   no plan: the board offers Chalk Talk AI
//   402 { fallback: true }  this month's cap is used: the board quietly uses the free AI instead

const PLAY_MODEL = 'claude-sonnet-5-5';   // plays and smart players: a coach is waiting, low effort
const LITE_MODEL = 'claude-haiku-5-5';    // brains, tutor, analyst: small, fast, many in parallel
const PER_HOUR = 150;                     // a film room is ~10 brain calls; separate from CourtIQ's own AI limit

export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: linkCors(request) });
}

async function whoIs(request: Request): Promise<string | null> {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (bearer) return verifyLinkToken(bearer);
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  return user ? user.id : null;
}

export async function POST(request: Request, { params }: { params: Promise<{ task: string }> }) {
  const { task } = await params;
  const cors = linkCors(request);
  const reply = (body: unknown, status: number, extra?: Record<string, string>) => NextResponse.json(body, { status, headers: { ...cors, ...(extra || {}) } });

  const coachId = await whoIs(request);
  if (!coachId) return reply({ error: 'Sign in to CourtIQ to use Chalk Talk AI.' }, 401);

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id, organizations(tier, chalk_talk_ai_status)').eq('id', coachId).single();
  const org = (coach as any)?.organizations, orgId = (coach as any)?.org_id as string | undefined;
  const plan = planFor(org);
  if (!orgId || !plan) return reply({ error: 'Get Chalk Talk AI, or any CourtIQ plan, to unlock the AI.', upgrade: true }, 402);

  const rl = await checkAIRateLimit(`chalk-talk:${coachId}`, PER_HOUR);
  if (!rl.allowed) return reply({ error: 'That’s a lot of AI for one hour. Try again in a few minutes.' }, 429);

  // if the ledger isn't reachable (e.g. migration 078 not applied yet) the AI keeps working and it's logged,
  // rather than taking Chalk Talk down for every paying coach
  const before = await spend(admin, orgId, plan).catch((e: any) => { console.error('[chalk-talk] spend check failed', e?.message); return { usedMicros: 0, capMicros: 0, leftMicros: 0, over: false }; });
  if (before.over) return reply({ error: plan === 'included' ? 'This month’s included Chalk Talk AI is used up.' : 'This month’s Chalk Talk AI is used up.', fallback: true, plan }, 402);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return reply({ error: 'Chalk Talk AI isn’t configured.' }, 503);

  let req;
  try {
    req = requestFor(task, await request.json());
  } catch (e: any) {
    return reply({ error: e?.message || 'Bad request.' }, e?.status || 400);
  }

  const client = new Anthropic({ apiKey });
  const lite = !!LITE[task as keyof typeof LITE], model = lite ? LITE_MODEL : PLAY_MODEL;
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, ids: string[] = [], t0 = Date.now();
  const record = (status: 'ok' | 'error' | 'refused') =>
    admin.from('ai_ledger').insert(ledgerRow({ orgId, coachId, plan, task, model, usage, requestIds: ids, latencyMs: Date.now() - t0, status }));

  try {
    const raw = await solve(req, async (sys: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, schema: object) => {
      const res = await client.messages.create({
        model,
        max_tokens: lite ? 4000 : 16000,
        system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
        messages,
      });
      // every round is billed, the repair round too: count them all
      usage.input += res.usage.input_tokens;
      usage.output += res.usage.output_tokens;
      usage.cacheRead += res.usage.cache_read_input_tokens || 0;
      usage.cacheWrite += res.usage.cache_creation_input_tokens || 0;
      if (res.id) ids.push(res.id);
      if (res.stop_reason === 'refusal') throw Object.assign(new Error('It wouldn’t draw that one. Try describing it another way.'), { refused: true });
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    });
    const { error } = await record('ok');
    if (error) console.error('[chalk-talk] ledger write failed', error.message);
    const left = Math.max(0, before.leftMicros - ledgerRow({ orgId, coachId, plan, task, model, usage, requestIds: ids, latencyMs: 0, status: 'ok' }).cost_micros);
    return reply(raw, 200, {
      'x-ct-model': model, 'x-ct-ms': String(Date.now() - t0), 'x-ct-in': String(usage.input + usage.cacheRead), 'x-ct-out': String(usage.output),
      'x-ct-plan': plan, 'x-ct-left': (left / 1e6).toFixed(4),
      'access-control-expose-headers': 'x-ct-model, x-ct-ms, x-ct-in, x-ct-out, x-ct-plan, x-ct-left',
    });
  } catch (e: any) {
    await record(e?.refused ? 'refused' : 'error');   // failed calls still cost tokens; the ledger says so
    const status = e instanceof Anthropic.APIError ? (e.status === 429 ? 429 : 502) : e?.refused ? 422 : 502;
    return reply({ error: e?.message || 'The AI didn’t answer. Try again.' }, status);
  }
}
