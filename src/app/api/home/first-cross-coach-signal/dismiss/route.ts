/**
 * POST /api/home/first-cross-coach-signal/dismiss — ticket 0088.
 *
 * The /home `<FirstCrossCoachSignalCard />` "Got it" button calls this
 * route with `{ kind, firedAt }`. The route UPSERTs a row into
 * `coach_first_signal_celebrations` (unique on (coach_id, kind)) so the
 * next /home read sees the kind in `alreadyCelebrated` and silences
 * the card forever (per-kind, per-coach).
 *
 * COPPA: writes only (coach_id, kind, fired_at, dismissed_at). Never
 * reads or writes any minor-data field. Service-role write per
 * AGENTS.md rule 3.
 *
 * Voice posture (LESSONS#0023): this jsdoc instructs positively.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import type { CoachFirstSignalKind } from '@/types/database';

const VALID_KINDS: ReadonlySet<CoachFirstSignalKind> = new Set([
  'clone',
  'thank',
  'parent_forward',
  'parent_forward_cross_team',
  'reaction_cross_team',
]);

function isKind(value: unknown): value is CoachFirstSignalKind {
  return typeof value === 'string' && VALID_KINDS.has(value as CoachFirstSignalKind);
}

export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const kind = (body as { kind?: unknown }).kind;
  const firedAtRaw = (body as { firedAt?: unknown }).firedAt;

  if (!isKind(kind)) {
    return NextResponse.json({ error: 'kind required' }, { status: 400 });
  }
  // The card always carries the fired_at value the GET returned; if
  // the client omits it we accept and stamp a defensive fallback so
  // a re-tap never 500s on a network blip.
  const firedAt = typeof firedAtRaw === 'string' && firedAtRaw ? firedAtRaw : new Date().toISOString();

  const admin = await createServiceSupabase();
  try {
    const nowIso = new Date().toISOString();
    const { error } = await admin
      .from('coach_first_signal_celebrations')
      .upsert(
        {
          coach_id: user.id,
          kind,
          fired_at: firedAt,
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
