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

  try {
    // Create a temporary Deepgram API key with limited scope and TTL
    const response = await fetch('https://api.deepgram.com/v1/keys', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${deepgramApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        comment: `SportsIQ temp key for ${user.id}`,
        scopes: ['usage:write'],
        time_to_live_in_seconds: 300, // 5 minutes
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Deepgram key creation failed:', errorText);
      return NextResponse.json({ error: 'Failed to create temporary key' }, { status: 502 });
    }

    const data = await response.json();

    return NextResponse.json({
      token: data.key,
      expiresAt: new Date(Date.now() + 300 * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Voice token error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
