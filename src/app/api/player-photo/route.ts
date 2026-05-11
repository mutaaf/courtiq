import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const BUCKET = 'player-photos';
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const playerId = formData.get('player_id') as string | null;

  if (!file || !playerId) {
    return NextResponse.json({ error: 'file and player_id required' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, WebP, or GIF allowed' }, { status: 400 });
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Verify coach belongs to an org
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('user_id', user.id)
    .single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  // Verify the player belongs to the same org
  const { data: player } = await admin
    .from('players')
    .select('id, org_id')
    .eq('id', playerId)
    .eq('org_id', coach.org_id)
    .single();
  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

  const ext =
    file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
        ? 'webp'
        : file.type === 'image/gif'
          ? 'gif'
          : 'jpg';
  const storagePath = `${coach.org_id}/${playerId}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    console.error('Player photo upload error:', uploadError);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = admin.storage.from(BUCKET).getPublicUrl(storagePath);

  // Cache-bust so the new photo renders immediately everywhere
  const finalUrl = `${publicUrl}?t=${Date.now()}`;

  await admin.from('players').update({ photo_url: finalUrl }).eq('id', playerId);

  return NextResponse.json({ url: finalUrl });
}

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('player_id');
  if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

  const admin = await createServiceSupabase();

  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('user_id', user.id)
    .single();
  if (!coach) return NextResponse.json({ error: 'Coach not found' }, { status: 404 });

  await admin
    .from('players')
    .update({ photo_url: null })
    .eq('id', playerId)
    .eq('org_id', coach.org_id);

  return NextResponse.json({ success: true });
}
