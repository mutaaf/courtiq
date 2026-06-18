/**
 * POST /api/coach/paid-receipts/dismiss — ticket 0089.
 *
 * The day-60 receipts card's "Got it" button calls this route. The
 * route UPSERTs a row into `coach_first_signal_celebrations` with
 * `kind: 'paid_receipts_d60'` so the next GET sees the row in the
 * dedup table and returns `eligible: false` (the card silences for
 * the rest of the window).
 *
 * The dedup primitive is REUSED from ticket 0088 (per the engineering
 * note — share one per-coach dedup table across activation +
 * retention milestones, don't fragment into two near-identical
 * tables). The widened CHECK enum on the table (migration 074) adds
 * exactly one new literal: 'paid_receipts_d60'.
 *
 * COPPA: writes only (coach_id, kind, fired_at, dismissed_at). Never
 * reads or writes any minor-data field. Service-role write per
 * AGENTS.md rule 3.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(_request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();
  try {
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from('coach_first_signal_celebrations')
      .upsert(
        {
          coach_id: user.id,
          kind: 'paid_receipts_d60',
          fired_at: nowIso,
          dismissed_at: nowIso,
        },
        { onConflict: 'coach_id,kind' },
      );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
