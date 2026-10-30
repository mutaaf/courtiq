import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { requestFor, solve, LITE } from 'chalk-talk/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { canAccess, type Tier } from '@/lib/tier';
import { checkAIRateLimit } from '@/lib/rate-limit';

// Chalk Talk's AI for paid CourtIQ plans (labs_chalk_talk_ai): the board sends the same requests it sends
// the free API, and they run here on CourtIQ's Anthropic key. Prompts, schemas, validation and the repair
// round come from chalk-talk/server, so plays come out the same everywhere. Requests carry X's and O's
// only (player names never leave the coach's device). Free plans get 402 and the board offers the upgrade.

const PLAY_MODEL = 'claude-sonnet-5-5';   // plays and smart players: a coach is waiting, low effort
const LITE_MODEL = 'claude-haiku-5-5';    // brains, tutor, analyst: small, fast, many in parallel
const PER_HOUR = 150;                     // a film room is ~10 brain calls; separate from CourtIQ's own AI limit

export async function POST(request: Request, { params }: { params: Promise<{ task: string }> }) {
  const { task } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in to use Chalk Talk AI.' }, { status: 401 });

  const admin = await createServiceSupabase();
  const { data: coach } = await admin.from('coaches').select('org_id, organizations(tier)').eq('id', user.id).single();
  const tier = (((coach as any)?.organizations?.tier) || 'free') as Tier;
  if (!canAccess(tier, 'labs_chalk_talk_ai')) {
    return NextResponse.json({ error: 'Chalk Talk AI comes with every paid CourtIQ plan.' }, { status: 402 });
  }

  const rl = await checkAIRateLimit(`chalk-talk:${user.id}`, PER_HOUR);
  if (!rl.allowed) return NextResponse.json({ error: 'That’s a lot of AI for one hour. Try again in a few minutes.' }, { status: 429 });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Chalk Talk AI isn’t configured.' }, { status: 503 });

  let req;
  try {
    req = requestFor(task, await request.json());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Bad request.' }, { status: e?.status || 400 });
  }

  const client = new Anthropic({ apiKey });
  const lite = !!LITE[task as keyof typeof LITE], model = lite ? LITE_MODEL : PLAY_MODEL;
  const usage = { in: 0, out: 0 }, t0 = Date.now();
  try {
    const raw = await solve(req, async (sys: string, messages: Array<{ role: 'user' | 'assistant'; content: string }>, schema: object) => {
      const res = await client.messages.create({
        model,
        max_tokens: lite ? 4000 : 16000,
        system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
        messages,
      });
      usage.in += res.usage.input_tokens + (res.usage.cache_read_input_tokens || 0);
      usage.out += res.usage.output_tokens;
      if (res.stop_reason === 'refusal') throw new Error('It wouldn’t draw that one. Try describing it another way.');
      return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    });
    return NextResponse.json(raw, {
      headers: { 'x-ct-model': model, 'x-ct-ms': String(Date.now() - t0), 'x-ct-in': String(usage.in), 'x-ct-out': String(usage.out) },
    });
  } catch (e: any) {
    const status = e instanceof Anthropic.APIError ? (e.status === 429 ? 429 : 502) : 502;
    return NextResponse.json({ error: e?.message || 'The AI didn’t answer. Try again.' }, { status });
  }
}
