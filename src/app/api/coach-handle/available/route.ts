// GET /api/coach-handle/available?handle=<h> — ticket 0054
//
// Authed availability check the /settings/referrals claim sheet uses for the
// debounced "is this handle free?" indicator. Three short-circuit checks
// before the DB read (so a malformed or reserved handle never causes a
// query):
//   1) shape: `isValidHandleShape` (lowercase alphanumeric + hyphen, 2–32).
//   2) reserved: `isReservedHandle` (the small route-prefix protection list).
//   3) DB: a single `coaches` SELECT by handle (service-role) — exists or not.
//
// Response payload keyset is EXACTLY { available, reason } — we never reveal
// which coach holds a taken handle. The keyset is locked by a vitest
// `Object.keys().sort()` assertion (LESSONS#0078).

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isValidHandleShape, isReservedHandle } from '@/lib/coach-handle-utils';

type Reason = 'taken' | 'reserved' | 'invalid' | null;

function reply(available: boolean, reason: Reason) {
  return NextResponse.json({ available, reason });
}

export async function GET(request: Request) {
  // Auth boundary — the available-check is a coach-facing affordance, not a
  // public surface, so an anonymous caller gets a 401.
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const handle = (url.searchParams.get('handle') ?? '').trim();

  // 1) Shape — short-circuit before any DB query.
  if (!handle || !isValidHandleShape(handle)) {
    return reply(false, 'invalid');
  }

  // 2) Reserved — short-circuit before any DB query.
  if (isReservedHandle(handle)) {
    return reply(false, 'reserved');
  }

  // 3) DB lookup — service-role, single row read; never returns WHICH coach
  // holds it.
  const admin = await createServiceSupabase();
  const { data: holder } = await admin
    .from('coaches')
    .select('id')
    .eq('handle', handle)
    .maybeSingle();

  if (holder) return reply(false, 'taken');
  return reply(true, null);
}
