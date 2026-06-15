import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { extractReactionSeed, type ReactionRow } from '@/lib/reaction-seed-utils';

// GET /api/capture/player-memory?playerId=<id>&teamId=<id>
//
// Returns the focused player's most recent PRIOR observation per sentiment so the
// coach is reminded what that kid was working on the moment they start observing
// them again (ticket 0025). Reads only the `observations` rows the coach already
// authored — no AI call, no new field, no new data.
//
// Ticket 0082 widens this read to ALSO surface the most-recent qualifying
// parent_reactions row for the player in the 14-day lookback (additive
// optional `reaction_seed` field per LESSONS#0103). The seed surfaces as
// ONE quiet zinc-500 line ABOVE the 0025 memory line on the Capture
// player card. The explicit `.select()` allow-list on the reaction read
// is `player_id, parent_name, message, created_at` only per LESSONS#0036
// — never parent_email, never coach_reply_at, never coach_reply_id, never
// the share_token / team_id / coach_id / reaction emoji / is_read.
//
// Best-effort: returns { lastNeedsWork: null, lastPositive: null,
// reaction_seed: null } on any missing or non-owned data rather than an
// error, so the memory line never blocks capture (mirrors the 0014
// carryover route).
export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const empty = { lastNeedsWork: null, lastPositive: null, reaction_seed: null } as const;

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

  // Ticket 0082 — the parent-reaction → capture seed read. Best-effort:
  // any failure on this read returns null `reaction_seed` and leaves the
  // 0025 memory contract byte-identical. Explicit `.select()` allow-list
  // per LESSONS#0036; the helper enforces the 14-day window + the length
  // and player filters in pure code (LESSONS#0072 — never `delete` a field
  // on a DB-read object; the helper shapes a new object).
  const readReactionSeed = async () => {
    try {
      const { data } = await admin
        .from('parent_reactions')
        .select('player_id, parent_name, message, created_at')
        .eq('player_id', playerId);
      if (!data) return null;
      // The DB rows use `parent_name` and `message` (schema columns from
      // migration 023). The helper's input shape uses the ticket-named
      // field aliases (`parent_first_name`, `note`) for clarity — we
      // normalize here without mutating the DB rows.
      const rows: ReactionRow[] = (data as Array<{
        player_id: string;
        parent_name: string | null;
        message: string | null;
        created_at: string;
      }>).map((r) => ({
        player_id: r.player_id,
        parent_first_name: r.parent_name,
        note: r.message,
        created_at: r.created_at,
      }));
      return extractReactionSeed({
        reactions: rows,
        playerId,
        nowMs: Date.now(),
      });
    } catch {
      return null;
    }
  };

  const [needsWork, positive, reactionSeed] = await Promise.all([
    readLatest('needs-work'),
    readLatest('positive'),
    readReactionSeed(),
  ]);

  return NextResponse.json({
    lastNeedsWork: needsWork?.text ?? null,
    lastPositive: positive?.text ?? null,
    // The needs-work line is the primary memory; fall back to the positive's date.
    observedAt: needsWork?.created_at ?? positive?.created_at ?? null,
    reaction_seed: reactionSeed,
  });
}
