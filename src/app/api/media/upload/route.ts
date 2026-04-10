import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const sessionId = formData.get('sessionId') as string;
  const teamId = formData.get('teamId') as string;
  const playerIds = formData.get('playerIds') as string | null; // comma-separated

  if (!file || !sessionId || !teamId) {
    return NextResponse.json(
      { error: 'file, sessionId, and teamId are required' },
      { status: 400 }
    );
  }

  const admin = await createServiceSupabase();

  try {
    const mediaId = generateId();
    const ext = file.name.split('.').pop() || 'bin';
    const storagePath = `media/${teamId}/${sessionId}/${mediaId}.${ext}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    // Determine media type
    const mimeType = file.type || 'application/octet-stream';
    const mediaType = mimeType.startsWith('video/') ? 'video' : 'photo';

    // Upload to Supabase storage via service role
    const { error: uploadError } = await admin.storage
      .from('media')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('Media storage upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Parse player IDs if provided
    const parsedPlayerIds = playerIds
      ? playerIds.split(',').map((id) => id.trim()).filter(Boolean)
      : [];

    // Create media record(s) — one per player, or one with null player
    const mediaRecords = parsedPlayerIds.length > 0
      ? parsedPlayerIds.map((pid) => ({
          id: parsedPlayerIds.length === 1 ? mediaId : generateId(),
          team_id: teamId,
          coach_id: user.id,
          session_id: sessionId,
          player_id: pid,
          type: mediaType as 'photo' | 'video',
          storage_path: storagePath,
          file_size_bytes: file.size,
          mime_type: mimeType,
          cv_processing_status: 'pending' as const,
          is_synced: true,
        }))
      : [{
          id: mediaId,
          team_id: teamId,
          coach_id: user.id,
          session_id: sessionId,
          player_id: null,
          type: mediaType as 'photo' | 'video',
          storage_path: storagePath,
          file_size_bytes: file.size,
          mime_type: mimeType,
          cv_processing_status: 'pending' as const,
          is_synced: true,
        }];

    const { data: inserted, error: dbError } = await admin
      .from('media')
      .insert(mediaRecords)
      .select();

    if (dbError) {
      console.error('Media DB insert error:', dbError);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = admin.storage
      .from('media')
      .getPublicUrl(storagePath);

    return NextResponse.json({
      media: inserted,
      publicUrl: urlData?.publicUrl || null,
    });
  } catch (error: any) {
    console.error('Media upload error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
