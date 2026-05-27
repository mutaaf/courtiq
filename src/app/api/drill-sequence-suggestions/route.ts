/**
 * GET /api/drill-sequence-suggestions?drillId=...&sport=...
 *
 * Ticket 0044 — read endpoint for the drill detail page's "coaches who liked
 * this drill in {sport} ran:" block. ENFORCES the k-anonymity floor at the
 * route layer (coach_count >= 5) regardless of what is in the underlying
 * table — the cron writes every pair it observes (so the offline telemetry
 * stays useful as the user base grows), but the route is the privacy
 * boundary the client ever sees.
 *
 * Strips the response keyset to exactly:
 *   { next_drill_id, next_drill_title, coach_count, sport }
 * Never returns `last_refreshed_at`, `drill_id`, any coach identifier, or
 * any column the aggregate doesn't have. The keyset is asserted in
 * tests/api/drill-sequence-suggestions.test.ts via `Object.keys` deep-equal
 * (LESSONS#84) so a future widening fails the gate.
 *
 * Reads ONLY `drill_sequence_aggregates` + `drills` — NEVER any minor-data
 * table. The COPPA boundary is asserted in the test by a table-read allow-
 * list scan.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const FLOOR = 5;
const TOP_N = 3;

interface AggregateRow {
  sport: string;
  drill_id: string;
  next_drill_id: string;
  coach_count: number;
  last_refreshed_at: string;
}

interface DrillNameRow {
  id: string;
  name: string;
}

export interface DrillSequenceSuggestion {
  next_drill_id: string;
  next_drill_title: string;
  coach_count: number;
  sport: string;
}

export async function GET(request: Request) {
  // Auth: any authed coach can read, regardless of tier (the network effect
  // compounds the more coaches see it — gating would invert that).
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const drillId = url.searchParams.get('drillId');
  const sport = url.searchParams.get('sport');
  if (!drillId || !sport) {
    return NextResponse.json(
      { error: 'drillId and sport are required' },
      { status: 400 },
    );
  }

  const admin = await createServiceSupabase();

  // The k-anonymity floor is enforced HERE — a `coach_count = 4` row in the
  // table NEVER crosses to the client even if explicitly requested.
  // LESSONS#39: assert the real contract — the route layer is the boundary.
  const { data: rows, error } = await admin
    .from('drill_sequence_aggregates')
    .select('sport, drill_id, next_drill_id, coach_count')
    .eq('drill_id', drillId)
    .eq('sport', sport)
    .gte('coach_count', FLOOR)
    .order('coach_count', { ascending: false })
    .limit(TOP_N);

  if (error) {
    console.error('[drill-sequence-suggestions] read failed:', error.message);
    return NextResponse.json({ suggestions: [] satisfies DrillSequenceSuggestion[] });
  }

  const aggregates = (rows ?? []) as AggregateRow[];
  if (aggregates.length === 0) {
    return NextResponse.json({ suggestions: [] satisfies DrillSequenceSuggestion[] });
  }

  // Join the drill titles in a single read scoped to the next_drill_ids we
  // actually need (no broader scan of the drills table).
  const nextIds = aggregates.map((r) => r.next_drill_id);
  const { data: drillsRows, error: drillsErr } = await admin
    .from('drills')
    .select('id, name')
    .in('id', nextIds);

  if (drillsErr) {
    console.error('[drill-sequence-suggestions] drills join failed:', drillsErr.message);
    return NextResponse.json({ suggestions: [] satisfies DrillSequenceSuggestion[] });
  }

  const nameById = new Map<string, string>();
  for (const d of (drillsRows ?? []) as DrillNameRow[]) {
    nameById.set(d.id, d.name);
  }

  // Strip every field outside the allow-list before returning. The keyset
  // is the privacy contract — a future widening fails the keyset test.
  const suggestions: DrillSequenceSuggestion[] = aggregates.map((r) => ({
    next_drill_id: r.next_drill_id,
    next_drill_title: nameById.get(r.next_drill_id) ?? 'Untitled drill',
    coach_count: r.coach_count,
    sport: r.sport,
  }));

  return NextResponse.json({ suggestions });
}
