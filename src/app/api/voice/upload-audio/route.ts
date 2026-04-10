import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const audio = formData.get('audio') as File;
  const path = formData.get('path') as string;

  if (!audio || !path) {
    return NextResponse.json({ error: 'audio and path required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();
  const buffer = Buffer.from(await audio.arrayBuffer());

  const { error } = await admin.storage
    .from('audio')
    .upload(path, buffer, {
      contentType: audio.type || 'audio/webm',
      upsert: true
    });

  if (error) {
    console.error('Storage upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, path });
}
