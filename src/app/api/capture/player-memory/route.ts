import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// GET /api/capture/player-memory?playerId=<id>&teamId=<id>
//
// Returns the focused player's most recent PRIOR observation per sentiment so the
// coach is reminded what that kid was working on the moment they start observing
// them again (ticket 0025). Reads only the `observations` rows the coach already
// authored — no AI call, no new field, no new data.
//
// Best-effort: returns { lastNeedsWork: null, lastPositive: null } on any missing
// or non-owned data rather than an error, so the memory line never blocks capture
// (mirrors the 0014 carryover route).
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const empty = { lastNeedsWork: null, lastPositive: null } as const;

  const { searchParams } = new URL(request.url);
  const playerId = searchParams.get('playerId');
  const teamId = searchParams.get('teamId');
  if (!playerId || !teamId) return NextResponse.json(empty);

  const admin = await createServiceSupabase();

  // Resolve caller's org to scope the read.
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  // Confirm the team belongs to the same org — a non-owned teamId returns nulls
  // rather than another team's observations (never leak another team's history).
  const { data: team } = await admin
    .from('teams')
    .select('org_id')
    .eq('id', teamId)
    .single();

  if (!team || !coach || team.org_id !== coach.org_id) {
    return NextResponse.json(empty);
  }

  // Most recent PRIOR observation per sentiment. Ordering by created_at desc +
  // limit(1) selects the last row that already exists — the note the coach is
  // mid-recording isn't persisted yet, so it can't show as its own "last time".
  const readLatest = async (sentiment: 'needs-work' | 'positive') => {
    const { data } = await admin
      .from('observations')
      .select('text, created_at')
      .eq('player_id', playerId)
      .eq('team_id', teamId)
      .eq('sentiment', sentiment)
      .order('created_at', { ascending: false })
      .limit(1);
    return (data?.[0] ?? null) as { text: string; created_at: string } | null;
  };

  const [needsWork, positive] = await Promise.all([
    readLatest('needs-work'),
    readLatest('positive'),
  ]);

  return NextResponse.json({
    lastNeedsWork: needsWork?.text ?? null,
    lastPositive: positive?.text ?? null,
    // The needs-work line is the primary memory; fall back to the positive's date.
    observedAt: needsWork?.created_at ?? positive?.created_at ?? null,
  });
}
