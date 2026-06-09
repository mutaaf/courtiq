import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { fireClonStickForThumbUp } from '@/lib/clone-stick-write-hook';

// ─── /api/coach-drill-signals ─────────────────────────────────────────────────
// Ticket 0039 — server-side mirror of the break-screen drill thumbs-up so a
// coach's rating travels across phones, teams, and seasons. The localStorage
// helpers in `src/lib/drill-rating-utils.ts` stay as the offline / pre-merge
// fallback; this route is the lifetime source of truth for the picker's sort
// and for the 0037 coaching signature's re-rank.
//
// Both verbs:
//   1. createServerSupabase().auth.getUser() → 401 if no caller. The route
//      NEVER trusts a client-supplied coach_id; it always resolves the coach
//      from the auth user (defense against a forged body — AGENTS.md rule 3 +
//      LESSONS#39's "assert the real contract").
//   2. Then createServiceSupabase() for the read/write. Service-role is the
//      only allowed server access path (AGENTS.md rule 3).
//
// COPPA / data minimization: the payload contains ONLY (drill_id, rating,
// run_count, last_rated_at). No team_id, no player reference, no observation
// text — so the signal can never leak through to the public surfaces (the
// share token routes from 0010/0017/0026/0027 don't read this table at all).

/** The shape of one row the GET returns. Matches `coach_drill_signals` 1:1. */
export interface CoachDrillSignalPayload {
  drill_id: string;
  rating: 'up' | 'down';
  run_count: number;
  last_rated_at: string;
}

// LESSONS#0008 — a no-param App Router GET must declare zero arguments so the
// vitest can invoke it as `GET()`; auth + cookies come from the mocked
// `createServerSupabase`, not from a passed `Request`.
export async function GET() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const { data, error } = await admin
    .from('coach_drill_signals')
    .select('drill_id, rating, run_count, last_rated_at')
    .eq('coach_id', user.id)
    .order('last_rated_at', { ascending: false });

  if (error) {
    // A read failure is non-fatal for the picker — return an empty list so the
    // UI falls back to localStorage cleanly rather than blocking the surface.
    return NextResponse.json({ signals: [] satisfies CoachDrillSignalPayload[] });
  }

  const signals = (data ?? []) as CoachDrillSignalPayload[];
  return NextResponse.json({ signals });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Body is { drill_id, rating: 'up' | 'down' | null, run_count? }. A client-
  // supplied `coach_id` is IGNORED — the coach is always the authenticated
  // user (LESSONS#39).
  const body = await request.json().catch(() => ({}));
  const drillId = body?.drill_id;
  const rating = body?.rating; // 'up' | 'down' | null
  const runCountRaw = body?.run_count;

  if (typeof drillId !== 'string' || drillId.length === 0) {
    return NextResponse.json({ error: 'drill_id is required' }, { status: 400 });
  }
  if (rating !== 'up' && rating !== 'down' && rating !== null) {
    return NextResponse.json({ error: 'rating must be "up", "down", or null' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  if (rating === null) {
    // Matches the existing `toggleDrillRating` semantics — tapping the same
    // rating removes it.
    const { error } = await admin
      .from('coach_drill_signals')
      .delete()
      .eq('coach_id', user.id)
      .eq('drill_id', drillId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ deleted: true, drill_id: drillId });
  }

  // Upsert: a PK of (coach_id, drill_id) means the same coach voting on the
  // same drill flips the rating in place; a different coach gets their own row.
  const upsertPayload: {
    coach_id: string;
    drill_id: string;
    rating: 'up' | 'down';
    last_rated_at: string;
    run_count?: number;
  } = {
    coach_id: user.id,
    drill_id: drillId,
    rating,
    last_rated_at: new Date().toISOString(),
  };
  if (typeof runCountRaw === 'number' && runCountRaw >= 0) {
    upsertPayload.run_count = Math.floor(runCountRaw);
  }

  const { data, error } = await admin
    .from('coach_drill_signals')
    .upsert(upsertPayload, { onConflict: 'coach_id,drill_id' })
    .select('drill_id, rating, run_count, last_rated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Ticket 0076 — when the caller thumbs-up a drill they previously
  // cloned, write a stick-signal row + fire the publishing coach's
  // milestone hook. Best-effort per LESSONS#0036 — errors caught
  // inside the helper so the thumbs-up response is unaffected.
  if (rating === 'up') {
    await fireClonStickForThumbUp(admin, user.id, drillId);
  }

  return NextResponse.json({ signal: data });
}
