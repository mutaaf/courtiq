import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

// 5 MB threshold for "large" files
const LARGE_FILE_SIZE = 5 * 1024 * 1024;
// 10 minutes in seconds — warn the user
const MAX_RECOMMENDED_DURATION_SEC = 600;
// 2 minute timeout for transcription requests
const TRANSCRIPTION_TIMEOUT_MS = 120_000;

/**
 * Estimate audio duration from file size and mime type.
 * Rough heuristics — actual duration may vary by codec and bitrate.
 */
function estimateDurationSec(fileSize: number, mimeType: string): number {
  // Typical bitrates (bytes per second)
  const bitrateMap: Record<string, number> = {
    'audio/webm': 16_000,    // ~128 kbps opus
    'audio/ogg': 16_000,
    'audio/mp4': 16_000,
    'audio/m4a': 16_000,
    'audio/mpeg': 16_000,    // mp3 ~128 kbps
    'audio/wav': 176_400,    // 44.1kHz 16-bit stereo
  };
  const bytesPerSec = bitrateMap[mimeType] || 16_000;
  return fileSize / bytesPerSec;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const audioFile = formData.get('audio') as File | null;
  const teamId = formData.get('teamId') as string | null;

  if (!audioFile || !teamId) {
    return NextResponse.json({ error: 'audio file and teamId required' }, { status: 400 });
  }

  const fileSize = audioFile.size;
  const mimeType = audioFile.type || 'audio/webm';
  const estimatedDuration = estimateDurationSec(fileSize, mimeType);
  const isLargeFile = fileSize > LARGE_FILE_SIZE || estimatedDuration > 120;

  // Warn about very long audio
  if (estimatedDuration > MAX_RECOMMENDED_DURATION_SEC) {
    return NextResponse.json({
      error: `This audio is estimated at ~${Math.round(estimatedDuration / 60)} minutes. Files over 10 minutes may timeout or be expensive to transcribe. Please trim the audio or split it into shorter segments.`,
      estimatedDurationSec: Math.round(estimatedDuration),
      tooLong: true,
    }, { status: 413 });
  }

  const admin = await createServiceSupabase();

  // Get coach's org to find AI key
  const { data: coach } = await admin.from('coaches').select('org_id').eq('id', user.id).single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  const { data: org } = await admin.from('organizations').select('settings').eq('id', coach.org_id).single();
  const settings = (org?.settings || {}) as Record<string, any>;
  const aiKeys = settings.ai_keys || {};

  // Try Deepgram first if available
  const deepgramKey = process.env.DEEPGRAM_API_KEY;
  if (deepgramKey) {
    try {
      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);

      try {
        const res = await fetch(
          'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
          {
            method: 'POST',
            headers: {
              'Authorization': `Token ${deepgramKey}`,
              'Content-Type': mimeType,
            },
            body: audioBuffer,
            signal: controller.signal,
          }
        );

        clearTimeout(timeout);

        if (res.ok) {
          const result = await res.json();
          const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
          if (transcript) {
            return NextResponse.json({
              transcript,
              provider: 'deepgram',
              estimatedDurationSec: Math.round(estimatedDuration),
              isLargeFile,
            });
          }
        }
      } catch (e: any) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
          console.error('Deepgram transcription timed out after 2 minutes');
        }
        throw e;
      }
    } catch (e) {
      console.error('Deepgram transcription failed, trying Gemini:', e);
    }
  }

  // Try Gemini (supports audio natively)
  const geminiKey = aiKeys.gemini || process.env.GEMINI_API_KEY;
  if (geminiKey) {
    try {
      const genAI = new GoogleGenerativeAI(geminiKey);
      // Use Flash for transcription — fast and cost-effective
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      const base64Audio = audioBuffer.toString('base64');

      // Build the transcription prompt based on file size
      const transcriptionPrompt = isLargeFile
        ? [
            'Transcribe this audio recording exactly as spoken. This is a youth sports coach giving observations about players during practice or games.',
            '',
            'IMPORTANT — this is a long recording. Follow these rules:',
            '- Process the ENTIRE audio from beginning to end. Do not skip, summarize, or truncate any section.',
            '- Transcribe every word spoken, even if sections seem repetitive.',
            '- If there are long pauses or silence, simply continue transcribing when speech resumes.',
            '- Maintain the chronological order of everything spoken.',
            '- If different speakers are detectable, note speaker changes with a line break.',
            '',
            'Output ONLY the transcription text, nothing else. Do not add any commentary, labels, timestamps, or formatting.',
          ].join('\n')
        : 'Transcribe this audio recording exactly as spoken. This is a youth sports coach giving observations about players during practice. Output ONLY the transcription text, nothing else. Do not add any commentary, labels, or formatting.';

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TRANSCRIPTION_TIMEOUT_MS);

      try {
        const result = await model.generateContent([
          {
            inlineData: {
              mimeType,
              data: base64Audio,
            },
          },
          transcriptionPrompt,
        ]);

        clearTimeout(timeout);

        const transcript = result.response.text().trim();
        if (transcript) {
          return NextResponse.json({
            transcript,
            provider: 'gemini',
            estimatedDurationSec: Math.round(estimatedDuration),
            isLargeFile,
          });
        }
      } catch (e: any) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') {
          return NextResponse.json({
            error: 'Transcription timed out. The audio file may be too long. Try trimming it to under 5 minutes.',
            estimatedDurationSec: Math.round(estimatedDuration),
            needsManualTranscript: true,
          }, { status: 408 });
        }
        throw e;
      }
    } catch (e: any) {
      console.error('Gemini transcription failed:', e.message);
    }
  }

  return NextResponse.json({
    error: 'No transcription provider available. Configure a Gemini API key in Settings → AI, or set DEEPGRAM_API_KEY.',
    needsManualTranscript: true,
  }, { status: 400 });
}
