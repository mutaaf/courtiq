/**
 * POST /api/cron/refresh-drill-sequences
 *
 * Ticket 0044 — Vercel Cron Job that runs nightly at 03:00 UTC (outside the
 * Monday-morning email windows) and refreshes the per-sport "if a coach
 * upvoted drill A, the next drill they upvoted within 14 days was drill B"
 * aggregate. The result lives in `drill_sequence_aggregates`; the GET route
 * at `/api/drill-sequence-suggestions` applies the k-anonymity floor at
 * read time.
 *
 * The cron reads ONLY two tables — `coach_drill_signals` (filtered to
 * `rating='up'` AND `signal_type='rating'`, so dismiss-suggestion rows are
 * never consumed) and `drills` (for the sport slug) — and writes
 * `drill_sequence_aggregates` as a single DELETE-then-INSERT snapshot so
 * the table is always internally consistent for the reader.
 *
 * Protected by CRON_SECRET, matching every other cron in this directory.
 */
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';

const WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

interface SignalRow {
  coach_id: string;
  drill_id: string;
  last_rated_at: string;
}

interface DrillJoinRow {
  id: string;
  sports?: { slug: string | null } | null;
}

interface AggregateInsertRow {
  sport: string;
  drill_id: string;
  next_drill_id: string;
  coach_count: number;
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  // When CRON_SECRET is set, only a matching Bearer is honoured; otherwise
  // the route is open for local invocations (matches every sibling cron).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = await createServiceSupabase();

  // ── 1. Read every upvote (signal_type = 'rating', rating = 'up') ──────────
  // Sort by last_rated_at ASC so consecutive same-coach rows are already
  // ordered by time when we walk them below.
  const { data: signals, error: signalsErr } = await admin
    .from('coach_drill_signals')
    .select('coach_id, drill_id, last_rated_at')
    .eq('rating', 'up')
    .eq('signal_type', 'rating')
    .order('last_rated_at', { ascending: true });

  if (signalsErr) {
    console.error('[refresh-drill-sequences] signals read failed:', signalsErr.message);
    return NextResponse.json({ error: signalsErr.message }, { status: 500 });
  }

  const upvotes = (signals ?? []) as SignalRow[];

  // ── 2. Read every drill's sport slug ──────────────────────────────────────
  // The aggregate's `sport` column is a TEXT slug (e.g. 'basketball'); the
  // drills table holds `sport_id`, so we join to `sports.slug`.
  const { data: drillRows, error: drillsErr } = await admin
    .from('drills')
    .select('id, sports(slug)');

  if (drillsErr) {
    console.error('[refresh-drill-sequences] drills read failed:', drillsErr.message);
    return NextResponse.json({ error: drillsErr.message }, { status: 500 });
  }

  const drillToSport = new Map<string, string>();
  for (const row of (drillRows ?? []) as DrillJoinRow[]) {
    // PostgREST may return `sports` as an object OR an array depending on
    // the FK; both shapes are tolerated here.
    const sportsField = (row as { sports?: unknown }).sports;
    let slug: string | null = null;
    if (Array.isArray(sportsField)) {
      slug = (sportsField[0] as { slug?: string | null })?.slug ?? null;
    } else if (sportsField && typeof sportsField === 'object') {
      slug = (sportsField as { slug?: string | null }).slug ?? null;
    }
    if (row.id && slug) drillToSport.set(row.id, slug);
  }

  // ── 3. Walk each coach's upvote series; emit (sport, A, B) tuples ─────────
  // The aggregate is "distinct coaches whose next upvote within 14 days was
  // B". So:
  //   key   = `${sport}:${A}:${B}`
  //   value = Set<coach_id>
  // and `coach_count = set.size` after the walk.
  const byCoach = new Map<string, SignalRow[]>();
  for (const sig of upvotes) {
    const list = byCoach.get(sig.coach_id) ?? [];
    list.push(sig);
    byCoach.set(sig.coach_id, list);
  }

  // Per-pair coach set. Within ONE coach's series we walk each ordered
  // (A, B) consecutive pair where time(B) - time(A) <= 14 days. Adding the
  // same coach twice to the set collapses to one (distinct-coach contract).
  const pairs = new Map<string, Set<string>>();

  for (const [coachId, series] of byCoach) {
    // The series came back ordered ascending, but a defensive sort guards
    // against any future ordering change in the SELECT.
    const ordered = [...series].sort((a, b) => a.last_rated_at.localeCompare(b.last_rated_at));
    for (let i = 0; i < ordered.length - 1; i++) {
      const a = ordered[i];
      const b = ordered[i + 1];
      if (a.drill_id === b.drill_id) continue; // a drill rated again — skip self-pair.
      const dt = new Date(b.last_rated_at).getTime() - new Date(a.last_rated_at).getTime();
      if (dt < 0 || dt > WINDOW_MS) continue;
      const sport = drillToSport.get(a.drill_id);
      if (!sport) continue; // a drill with no resolvable sport — skip.
      const key = `${sport}:${a.drill_id}:${b.drill_id}`;
      const set = pairs.get(key) ?? new Set<string>();
      set.add(coachId);
      pairs.set(key, set);
    }
  }

  const inserts: AggregateInsertRow[] = [];
  for (const [key, coachSet] of pairs) {
    // key shape: `${sport}:${A}:${B}` where A and B are uuids that never
    // contain `:`. The sport slug doesn't either (slugs are kebab-case).
    const firstColon = key.indexOf(':');
    const secondColon = key.indexOf(':', firstColon + 1);
    const sport = key.slice(0, firstColon);
    const drillId = key.slice(firstColon + 1, secondColon);
    const nextDrillId = key.slice(secondColon + 1);
    inserts.push({
      sport,
      drill_id: drillId,
      next_drill_id: nextDrillId,
      coach_count: coachSet.size,
    });
  }

  // ── 4. Snapshot-replace the aggregates table ──────────────────────────────
  // DELETE-then-INSERT keeps the table consistent for the GET route. We
  // can't wrap in a single DB transaction via supabase-js, but the reader
  // tolerates an empty table briefly (it renders nothing) and the cron is
  // idempotent — a re-run produces the same final state.
  //
  // The `coach_count >= 0` predicate is a sentinel "delete-all" filter
  // because the supabase-js client requires SOME filter on delete().
  const { error: delErr } = await admin
    .from('drill_sequence_aggregates')
    .delete()
    .gte('coach_count', 0);
  if (delErr) {
    console.error('[refresh-drill-sequences] delete failed:', delErr.message);
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  if (inserts.length > 0) {
    const { error: insErr } = await admin
      .from('drill_sequence_aggregates')
      .insert(inserts);
    if (insErr) {
      console.error('[refresh-drill-sequences] insert failed:', insErr.message);
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const tookMs = Date.now() - startedAt;
  console.log(`[refresh-drill-sequences] rows_written=${inserts.length} took_ms=${tookMs}`);

  return NextResponse.json({
    rows_written: inserts.length,
    took_ms: tookMs,
  });
}
