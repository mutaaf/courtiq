import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServiceSupabase } from '@/lib/supabase/server';
import { runSegmentation } from '@/lib/ai/segment-runner';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Deepgram waits up to 30 s for a webhook ack. We synchronously run segmentation
// before responding so the coach lands on a fully-prepared review page; bump the
// function timeout to cover Sonnet/Haiku latency on long transcripts.
export const maxDuration = 60;

// Deepgram nova-2 pre-recorded pricing (USD per minute, pay-as-you-go).
const DEEPGRAM_NOVA2_USD_PER_MIN = 0.0043;

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

interface DeepgramCallbackBody {
  metadata?: {
    request_id?: string;
    duration?: number; // seconds
    model_info?: Record<string, { name?: string; version?: string }>;
  };
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
      }>;
    }>;
  };
}

/**
 * Deepgram callback for the long-session voice memo pipeline.
 *
 * Pipeline: stores transcript → runs segmentation → caches result on the row.
 * The /capture/review page reads the cached result so it opens instantly with
 * no extra AI call — coach arrives, observations are already extracted.
 *
 * Auth: capability URL with per-recording HMAC token (?rid=&t=). Constant-time
 * compare against recordings.transcript_callback_secret.
 */
export async function POST(request: Request) {
  const url = new URL(request.url);
  const rid = url.searchParams.get('rid');
  const token = url.searchParams.get('t');

  if (!rid || !token) {
    return NextResponse.json({ error: 'rid + t required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  const { data: recording } = await admin
    .from('recordings')
    .select('id, team_id, coach_id, session_id, status, transcript_callback_secret, raw_transcript, segmentation_result')
    .eq('id', rid)
    .single();

  if (!recording) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!recording.transcript_callback_secret || !constantTimeEqual(token, recording.transcript_callback_secret)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  // Idempotent: if we've already produced a final result, ack and return.
  if (recording.segmentation_result || (recording.raw_transcript && recording.status === 'parsed')) {
    return NextResponse.json({ ok: true, alreadyProcessed: true });
  }

  let body: DeepgramCallbackBody;
  try {
    body = (await request.json()) as DeepgramCallbackBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const transcript = body.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
  const confidence = body.results?.channels?.[0]?.alternatives?.[0]?.confidence ?? null;
  const durationSec = body.metadata?.duration ? Math.round(body.metadata.duration) : null;
  const modelName = body.metadata?.model_info
    ? Object.values(body.metadata.model_info)[0]?.name || 'nova-2'
    : 'nova-2';
  const provider = `deepgram-${modelName}`;
  const costUsd = durationSec ? Number(((durationSec / 60) * DEEPGRAM_NOVA2_USD_PER_MIN).toFixed(4)) : null;

  if (!transcript) {
    await admin
      .from('recordings')
      .update({
        status: 'failed',
        last_error: 'Deepgram returned empty transcript',
        transcript_completed_at: new Date().toISOString(),
        total_duration_seconds: durationSec,
        transcript_cost_usd: costUsd,
      })
      .eq('id', rid);
    return NextResponse.json({ ok: true, empty: true });
  }

  // Save transcript + flip to parsing in one update so realtime subscribers see progress.
  await admin
    .from('recordings')
    .update({
      raw_transcript: transcript,
      transcript_provider: provider,
      transcript_confidence: confidence,
      total_duration_seconds: durationSec,
      duration_seconds: durationSec,
      transcript_cost_usd: costUsd,
      transcript_completed_at: new Date().toISOString(),
      status: 'parsing',
    })
    .eq('id', rid);

  // Run segmentation while we have the data hot — caches result on the row.
  // Failures leave status=transcribed so /capture/review can re-segment on demand.
  try {
    const { data: coach } = await admin
      .from('coaches')
      .select('org_id')
      .eq('id', recording.coach_id)
      .single();

    const segResult = await runSegmentation({
      transcript,
      teamId: recording.team_id,
      coachId: recording.coach_id,
      sessionId: recording.session_id ?? null,
      orgId: coach?.org_id ?? null,
    });

    await admin
      .from('recordings')
      .update({
        status: 'parsed',
        segmentation_result: segResult,
        segmentation_completed_at: new Date().toISOString(),
      })
      .eq('id', rid);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Segmentation failed';
    console.error(`Segmentation failed for recording ${rid}:`, message);
    await admin
      .from('recordings')
      .update({ status: 'transcribed', last_error: message })
      .eq('id', rid);
  }

  return NextResponse.json({ ok: true });
}
