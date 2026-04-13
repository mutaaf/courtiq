import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { AvailabilityStatus, PlayerAvailability } from '@/types/database';

// ─── GET /api/player-availability?team_id=<id> ───────────────────────────────
// Returns the latest availability record for every player on the team.
// Returns {} (empty object) for players with no record (implicitly available).

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');
  if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

  const admin = await createServiceSupabase();

  // Verify coach is on this team
  const { data: membership } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Fetch all availability rows for this team, ordered newest-first
  const { data: rows, error } = await admin
    .from('player_availability')
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Deduplicate: keep only the latest record per player
  const latestByPlayer: Record<string, PlayerAvailability> = {};
  for (const row of rows ?? []) {
    if (!latestByPlayer[row.player_id]) {
      latestByPlayer[row.player_id] = row as PlayerAvailability;
    }
  }

  return NextResponse.json({ availability: latestByPlayer });
}

// ─── POST /api/player-availability ───────────────────────────────────────────
// Upsert availability for a player. Creates a new record (history preserved).
// Body: { player_id, team_id, status, reason?, expected_return?, notes? }

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { player_id, team_id, status, reason, expected_return, notes } = body as {
    player_id: string;
    team_id: string;
    status: AvailabilityStatus;
    reason?: string;
    expected_return?: string;
    notes?: string;
  };

  if (!player_id || !team_id || !status) {
    return NextResponse.json({ error: 'player_id, team_id, and status are required' }, { status: 400 });
  }

  const validStatuses: AvailabilityStatus[] = ['available', 'limited', 'injured', 'sick', 'unavailable'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Verify coach belongs to this team
  const { data: membership } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', team_id)
    .eq('coach_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await admin
    .from('player_availability')
    .insert({
      player_id,
      team_id,
      status,
      reason: reason ?? null,
      expected_return: expected_return ?? null,
      notes: notes ?? null,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ availability: data });
}

// ─── DELETE /api/player-availability?player_id=<id>&team_id=<id> ─────────────
// Removes all availability records for a player (resets to "available")

export async function DELETE(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('player_id');
  const teamId = searchParams.get('team_id');

  if (!playerId || !teamId) {
    return NextResponse.json({ error: 'player_id and team_id required' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Verify coach belongs to this team
  const { data: membership } = await admin
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .single();

  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await admin
    .from('player_availability')
    .delete()
    .eq('player_id', playerId)
    .eq('team_id', teamId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
