/**
 * POST /api/plans/program-canon-inherited/dismiss — ticket 0090.
 *
 * The coach tapped "Got it" on the inheritance banner; record the
 * dismissal in `coach_first_signal_celebrations` (the 0088 dedup
 * primitive, widened by migration 075 to include
 * 'program_canon_inherited').
 *
 * Idempotent: a re-tap upserts the same (coach_id, kind) row.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();
  const nowIso = new Date().toISOString();

  try {
    await admin
      .from('coach_first_signal_celebrations')
      .upsert(
        {
          coach_id: user.id,
          kind: 'program_canon_inherited',
          fired_at: nowIso,
          celebrated_at: nowIso,
          dismissed_at: nowIso,
        },
        { onConflict: 'coach_id,kind' },
      );
  } catch (err) {
    console.error('[plans/program-canon-inherited/dismiss] upsert failed:', err);
    return NextResponse.json({ error: 'Failed to dismiss' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
