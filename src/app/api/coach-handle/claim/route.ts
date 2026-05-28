// POST /api/coach-handle/claim — ticket 0054
//
// One-time claim of the caller's coaches.handle. The route NEVER trusts a
// client-supplied id — the write is always scoped to the AUTHED caller's row
// (same posture as LESSONS#0039). Validation is server-side regardless of
// what the client did:
//   - 401: no authed user.
//   - 400: invalid shape or reserved handle, or malformed body.
//   - 409 already_claimed: the caller's handle is already set (v1 lock).
//   - 409 taken: a concurrent claim won the unique constraint (SQLSTATE
//     23505 surfaces here).
//   - 200 { handle }: success.
//
// v1 is one-time claim. A future "change my handle" flow is explicitly out
// of scope (see ticket 0054 → "Out of scope").

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { isValidHandleShape, isReservedHandle } from '@/lib/coach-handle-utils';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse + validate the body. A missing/malformed body is a 400.
  let body: { handle?: unknown } | null = null;
  try {
    body = (await request.json()) as { handle?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const handleRaw = body?.handle;
  if (typeof handleRaw !== 'string') {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }
  const handle = handleRaw.trim();

  // Server-side shape + reserved checks — NEVER trust client validation.
  if (!isValidHandleShape(handle)) {
    return NextResponse.json({ error: 'invalid_handle' }, { status: 400 });
  }
  if (isReservedHandle(handle)) {
    return NextResponse.json({ error: 'reserved_handle' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Already-claimed? v1 is one-time claim.
  const { data: caller } = await admin
    .from('coaches')
    .select('handle')
    .eq('id', user.id)
    .maybeSingle();

  const existing = (caller?.handle as string | null) ?? null;
  if (existing && existing.length > 0) {
    return NextResponse.json({ error: 'already_claimed' }, { status: 409 });
  }

  // Atomic write — the UNIQUE constraint on coaches.handle is the race
  // arbiter: the loser of a concurrent claim gets SQLSTATE 23505.
  const { error } = await admin
    .from('coaches')
    .update({ handle })
    .eq('id', user.id);

  if (error) {
    const code = (error as { code?: string }).code ?? '';
    if (code === '23505') {
      return NextResponse.json({ error: 'taken' }, { status: 409 });
    }
    return NextResponse.json({ error: 'update_failed' }, { status: 500 });
  }

  return NextResponse.json({ handle });
}
