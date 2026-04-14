import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { MAX_NOTE_LENGTH } from '@/lib/player-notes-utils';

// ─── GET /api/player-notes?player_id=xxx ─────────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('player_id');
    if (!playerId) return NextResponse.json({ error: 'player_id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const { data: notes, error } = await admin
      .from('player_notes')
      .select('*')
      .eq('player_id', playerId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ notes: notes ?? [] });
  } catch (err) {
    console.error('[player-notes GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── POST /api/player-notes — create a note ───────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { player_id, team_id, content, pinned = false } = body;

    if (!player_id || !team_id) {
      return NextResponse.json({ error: 'player_id and team_id are required' }, { status: 400 });
    }
    const trimmed = (content ?? '').trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'content is required' }, { status: 400 });
    }
    if (trimmed.length > MAX_NOTE_LENGTH) {
      return NextResponse.json({ error: `content must be ${MAX_NOTE_LENGTH} characters or fewer` }, { status: 400 });
    }

    const admin = await createServiceSupabase();

    const { data: coach } = await admin.from('coaches').select('id').eq('id', user.id).single();

    const { data: note, error } = await admin
      .from('player_notes')
      .insert({
        player_id,
        team_id,
        coach_id: coach?.id ?? null,
        content: trimmed,
        pinned: Boolean(pinned),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    console.error('[player-notes POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── PATCH /api/player-notes?id=xxx — update content or pinned ───────────────

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.content !== undefined) {
      const trimmed = body.content.trim();
      if (!trimmed) return NextResponse.json({ error: 'content cannot be empty' }, { status: 400 });
      if (trimmed.length > MAX_NOTE_LENGTH) {
        return NextResponse.json({ error: `content must be ${MAX_NOTE_LENGTH} characters or fewer` }, { status: 400 });
      }
      updates.content = trimmed;
    }
    if (body.pinned !== undefined) {
      updates.pinned = Boolean(body.pinned);
    }

    const admin = await createServiceSupabase();
    const { data: note, error } = await admin
      .from('player_notes')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ note });
  } catch (err) {
    console.error('[player-notes PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── DELETE /api/player-notes?id=xxx ─────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const { error } = await admin.from('player_notes').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[player-notes DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
