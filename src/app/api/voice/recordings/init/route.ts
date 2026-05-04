import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireAIAccess } from '@/lib/ai/guard';
import { getAudioLimit } from '@/lib/tier';

const AUDIO_BUCKET = 'audio';

const EXT_BY_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

function inferExt(fileName: string | undefined, mimeType: string | undefined): string {
  if (mimeType && EXT_BY_MIME[mimeType]) return EXT_BY_MIME[mimeType];
  if (fileName) {
    const m = fileName.toLowerCase().match(/\.([a-z0-9]{2,5})$/);
    if (m) return m[1];
  }
  return 'webm';
}

export async function POST(request: Request) {
  const guard = await requireAIAccess('long_session_audio');
  if ('response' in guard) return guard.response;
  const { user, coach, orgTier, admin } = guard;

  let body: {
    teamId?: string;
    sessionId?: string | null;
    fileName?: string;
    mimeType?: string;
    sizeBytes?: number;
    estimatedDurationSec?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { teamId, sessionId, fileName, mimeType, sizeBytes, estimatedDurationSec } = body;

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }
  if (typeof sizeBytes !== 'number' || sizeBytes <= 0) {
    return NextResponse.json({ error: 'sizeBytes required' }, { status: 400 });
  }

  const audioLimit = getAudioLimit(orgTier);
  const estDurationSec = Math.max(0, Math.round(estimatedDurationSec ?? 0));
  const maxSec = audioLimit.maxMinutesPerUpload * 60;

  // Cheap synchronous check first — bail before issuing any DB query.
  if (estDurationSec > maxSec) {
    return NextResponse.json(
      {
        error: `Your ${orgTier.replace('_', ' ')} plan caps audio uploads at ${audioLimit.maxMinutesPerUpload} minutes. This file is ~${Math.round(estDurationSec / 60)} minutes.`,
        upgrade: true,
        currentTier: orgTier,
        maxMinutesPerUpload: audioLimit.maxMinutesPerUpload,
      },
      { status: 402 },
    );
  }

  // Two independent checks: team ownership + monthly long-session quota.
  // Run in parallel to halve init latency.
  const isLongSession = estDurationSec > audioLimit.longSessionThresholdSec;
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const [teamRes, longCountRes] = await Promise.all([
    admin.from('teams').select('id, org_id').eq('id', teamId).single(),
    isLongSession
      ? admin
          .from('recordings')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', user.id)
          .gt('total_duration_seconds', audioLimit.longSessionThresholdSec)
          .gte('created_at', monthStart.toISOString())
      : Promise.resolve({ count: 0 } as { count: number | null }),
  ]);

  const team = teamRes.data;
  if (!team || team.org_id !== coach.org_id) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  if (isLongSession && (longCountRes.count ?? 0) >= audioLimit.maxLongSessionsPerMonth) {
    return NextResponse.json(
      {
        error: `You've used all ${audioLimit.maxLongSessionsPerMonth} long-session uploads for this month. Upgrade for more.`,
        upgrade: true,
        currentTier: orgTier,
        maxLongSessionsPerMonth: audioLimit.maxLongSessionsPerMonth,
      },
      { status: 402 },
    );
  }

  const recordingId = crypto.randomUUID();
  const callbackSecret = crypto.randomBytes(32).toString('hex');
  const ext = inferExt(fileName, mimeType);
  const storagePath = `recordings/${coach.id}/${recordingId}.${ext}`;

  const { error: insertErr } = await admin.from('recordings').insert({
    id: recordingId,
    team_id: teamId,
    coach_id: coach.id,
    session_id: sessionId ?? null,
    storage_path: storagePath,
    file_size_bytes: sizeBytes,
    mime_type: mimeType || 'audio/webm',
    duration_seconds: estDurationSec || null,
    status: 'uploading',
    transcript_callback_secret: callbackSecret,
  });

  if (insertErr) {
    console.error('init recording insert failed:', insertErr);
    return NextResponse.json({ error: 'Failed to create recording' }, { status: 500 });
  }

  return NextResponse.json({
    recordingId,
    bucket: AUDIO_BUCKET,
    storagePath,
    // tus endpoint for resumable upload — client uses its own session token.
    uploadEndpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/upload/resumable`,
  });
}
