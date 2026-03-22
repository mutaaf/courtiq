import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
  if (!deepgramApiKey) {
    return NextResponse.json({ error: 'Deepgram not configured' }, { status: 500 });
  }

  const body = await request.json();
  const { audioUrl, audioBase64, recordingId, teamId, mimeType = 'audio/webm' } = body;

  if (!teamId || (!audioUrl && !audioBase64)) {
    return NextResponse.json({ error: 'teamId and audioUrl or audioBase64 required' }, { status: 400 });
  }

  try {
    // Update recording status
    if (recordingId) {
      await supabase
        .from('recordings')
        .update({ status: 'transcribing' })
        .eq('id', recordingId);
    }

    let transcribeResponse: Response;

    if (audioBase64) {
      // Send raw audio bytes to Deepgram
      const audioBuffer = Buffer.from(audioBase64, 'base64');
      transcribeResponse = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=false',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramApiKey}`,
            'Content-Type': mimeType,
          },
          body: audioBuffer,
        }
      );
    } else {
      // Send URL for Deepgram to fetch
      transcribeResponse = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=false',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: audioUrl }),
        }
      );
    }

    if (!transcribeResponse.ok) {
      const errorText = await transcribeResponse.text();
      console.error('Deepgram transcription failed:', errorText);

      if (recordingId) {
        await supabase
          .from('recordings')
          .update({ status: 'failed', last_error: errorText })
          .eq('id', recordingId);
      }

      return NextResponse.json({ error: 'Transcription failed' }, { status: 502 });
    }

    const result = await transcribeResponse.json();
    const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
    const confidence = result.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0;

    // Update recording with transcript
    if (recordingId) {
      await supabase
        .from('recordings')
        .update({
          raw_transcript: transcript,
          transcript_provider: 'deepgram',
          transcript_confidence: confidence,
          status: 'transcribed',
          duration_seconds: result.metadata?.duration || null,
        })
        .eq('id', recordingId);
    }

    return NextResponse.json({
      transcript,
      confidence,
      duration: result.metadata?.duration || null,
      recordingId,
    });
  } catch (error: any) {
    console.error('Transcribe error:', error);

    if (recordingId) {
      await supabase
        .from('recordings')
        .update({ status: 'failed', last_error: error.message })
        .eq('id', recordingId);
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
