import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
      const res = await fetch(
        'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true',
        {
          method: 'POST',
          headers: {
            'Authorization': `Token ${deepgramKey}`,
            'Content-Type': audioFile.type || 'audio/webm',
          },
          body: audioBuffer,
        }
      );

      if (res.ok) {
        const result = await res.json();
        const transcript = result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
        if (transcript) {
          return NextResponse.json({ transcript, provider: 'deepgram' });
        }
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
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const audioBuffer = Buffer.from(await audioFile.arrayBuffer());
      const base64Audio = audioBuffer.toString('base64');
      const mimeType = audioFile.type || 'audio/webm';

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType,
            data: base64Audio,
          },
        },
        'Transcribe this audio recording exactly as spoken. This is a youth sports coach giving observations about players during practice. Output ONLY the transcription text, nothing else. Do not add any commentary, labels, or formatting.',
      ]);

      const transcript = result.response.text().trim();
      if (transcript) {
        return NextResponse.json({ transcript, provider: 'gemini' });
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
