import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AUDIO_BUCKET = 'audio';
const SIGNED_URL_TTL_SECONDS = 6 * 60 * 60; // 6h — comfortable headroom for Deepgram fetch
const STALE_TRANSCRIBING_MS = 30 * 60 * 1000; // recover requests stuck >30 min

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: recordingId } = await context.params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  const { data: recording, error: fetchErr } = await admin
    .from('recordings')
    .select('id, coach_id, storage_path, mime_type, status, transcript_callback_secret, transcript_request_id, transcript_started_at, raw_transcript')
    .eq('id', recordingId)
    .single();

  if (fetchErr || !recording) {
    return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
  }
  if (recording.coach_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Auto-recover stale 'transcribing' rows whose Deepgram callback never arrived.
  // Treat as if no submission happened and re-issue.
  const stuck =
    recording.status === 'transcribing'
    && !recording.raw_transcript
    && recording.transcript_started_at
    && Date.now() - new Date(recording.transcript_started_at).getTime() > STALE_TRANSCRIBING_MS;

  // Idempotent for healthy in-flight requests: confirm rather than re-submit.
  if (recording.transcript_request_id && !stuck) {
    return NextResponse.json({
      recordingId,
      requestId: recording.transcript_request_id,
      status: recording.status,
      alreadySubmitted: true,
    });
  }

  if (!stuck && recording.status !== 'uploading' && recording.status !== 'uploaded') {
    return NextResponse.json(
      { error: `Recording status is ${recording.status}; cannot finalize` },
      { status: 409 },
    );
  }
  if (!recording.storage_path) {
    return NextResponse.json({ error: 'Missing storage_path' }, { status: 500 });
  }
  if (!recording.transcript_callback_secret) {
    return NextResponse.json({ error: 'Missing callback secret' }, { status: 500 });
  }

  // Confirm the file actually exists in Storage before submitting to Deepgram.
  const { data: signed, error: signErr } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(recording.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signErr || !signed?.signedUrl) {
    console.error('createSignedUrl failed:', signErr);
    return NextResponse.json(
      { error: 'Audio file not found in storage. Upload may have failed.' },
      { status: 400 },
    );
  }

  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramKey) {
    return NextResponse.json(
      { error: 'DEEPGRAM_API_KEY not configured' },
      { status: 500 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'NEXT_PUBLIC_APP_URL not configured — webhook callback cannot be built' },
      { status: 500 },
    );
  }

  const callbackUrl = new URL(`${baseUrl}/api/voice/transcript-webhook`);
  callbackUrl.searchParams.set('rid', recordingId);
  callbackUrl.searchParams.set('t', recording.transcript_callback_secret);

  const dgUrl = new URL('https://api.deepgram.com/v1/listen');
  dgUrl.searchParams.set('model', 'nova-2');
  dgUrl.searchParams.set('punctuate', 'true');
  dgUrl.searchParams.set('smart_format', 'true');
  dgUrl.searchParams.set('paragraphs', 'true');
  dgUrl.searchParams.set('callback', callbackUrl.toString());
  dgUrl.searchParams.set('callback_method', 'post');

  let dgResponse: Response;
  try {
    dgResponse = await fetch(dgUrl.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: signed.signedUrl }),
    });
  } catch (e) {
    console.error('Deepgram submit failed:', e);
    await admin
      .from('recordings')
      .update({ status: 'failed', last_error: 'Deepgram unreachable' })
      .eq('id', recordingId);
    return NextResponse.json({ error: 'Transcription provider unreachable' }, { status: 502 });
  }

  if (!dgResponse.ok) {
    const errorBody = await dgResponse.text().catch(() => '');
    console.error(`Deepgram error ${dgResponse.status}:`, errorBody);
    await admin
      .from('recordings')
      .update({ status: 'failed', last_error: `Deepgram ${dgResponse.status}` })
      .eq('id', recordingId);
    return NextResponse.json(
      { error: `Transcription submit failed (${dgResponse.status})` },
      { status: 502 },
    );
  }

  const dgJson = (await dgResponse.json().catch(() => ({}))) as { request_id?: string };
  const requestId = dgJson.request_id ?? null;

  await admin
    .from('recordings')
    .update({
      status: 'transcribing',
      transcript_request_id: requestId,
      transcript_started_at: new Date().toISOString(),
    })
    .eq('id', recordingId);

  return NextResponse.json({
    recordingId,
    requestId,
    status: 'transcribing',
  });
}
