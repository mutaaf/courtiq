import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isValidTitle, isValidBody, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } from '@/lib/announcement-utils';

// ─── GET /api/team-announcements?team_id=xxx ─────────────────────────────────
// Returns all non-expired announcements for the team (newest first).
// Requires auth.

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const now = new Date().toISOString();

    const { data: announcements, error } = await admin
      .from('team_announcements')
      .select('*')
      .eq('team_id', teamId)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ announcements: announcements ?? [] });
  } catch (err) {
    console.error('[team-announcements GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── POST /api/team-announcements ─────────────────────────────────────────────
// Creates a new announcement for a team.
// Body: { team_id, title, body, expires_at? }

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { team_id, title, body: bodyText, expires_at } = body;

    if (!team_id) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }
    if (!isValidTitle(title ?? '')) {
      return NextResponse.json(
        { error: `title must be 1–${MAX_TITLE_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (!isValidBody(bodyText ?? '')) {
      return NextResponse.json(
        { error: `body must be 1–${MAX_BODY_LENGTH} characters` },
        { status: 400 }
      );
    }

    const admin = await createServiceSupabase();

    const { data: announcement, error } = await admin
      .from('team_announcements')
      .insert({
        team_id,
        created_by: user.id,
        title: title.trim(),
        body: bodyText.trim(),
        expires_at: expires_at ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    console.error('[team-announcements POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── DELETE /api/team-announcements?id=xxx ────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const { error } = await admin.from('team_announcements').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[team-announcements DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
