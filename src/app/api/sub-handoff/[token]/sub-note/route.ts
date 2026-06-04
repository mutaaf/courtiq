import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import {
  validateObserverToken,
  validateSubNoteText,
  tryConsumeSubNoteSlot,
} from '@/lib/sub-handoff-utils';

// POST /api/sub-handoff/[token]/sub-note — PUBLIC, no auth. The sub-coach
// leaves a one-line note back to the regular coach at the end of practice.
//
// Voice contract: the sub-authored text is voice-scanned per LESSONS#0023.
// A banned word returns 400 { reason: 'voice', hint: '…' } with a gentle
// nudge ("write the note like you'd text a friend — keep it short and
// concrete"). Length cap 500 chars.
//
// Rate limit: at most 3 notes per token (sub doesn't spam the regular
// coach). The limiter is process-local in-memory; on a multi-instance
// deploy this is best-effort, NOT a security boundary — the regular
// coach's mailbox just sees at most 3 entries within the 24h window.
//
// Idempotency: a 2nd/3rd POST within the limit UPDATES the existing
// sub_note_text + sub_note_at on the handoff row.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { text } = body as { text?: unknown };

  // Validate text BEFORE consuming a rate-limit slot — a malformed call
  // should not eat into the budget.
  let trimmed: string;
  try {
    trimmed = validateSubNoteText(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'invalid';
    if (reason === 'voice') {
      return NextResponse.json(
        {
          reason: 'voice',
          hint: "write the note like you'd text a friend — keep it short and concrete",
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: 'note too long or empty' }, { status: 400 });
  }

  // Token validation comes AFTER text validation but BEFORE rate-limit
  // consumption — a 410 must surface even on the first call against an
  // expired token. The DB check below resolves the row.
  const validation = validateObserverToken(token);
  if (!validation) {
    return NextResponse.json({ error: 'Link expired' }, { status: 410 });
  }

  // Rate-limit BEFORE the DB lookup — a 4th POST never touches Postgres.
  // The check happens after token validation so an expired token's 410
  // never silently consumes a slot, but before any DB roundtrip so a
  // spammed token never piles up reads.
  if (!tryConsumeSubNoteSlot(token)) {
    return NextResponse.json(
      { error: 'Too many notes on this link' },
      { status: 429 },
    );
  }

  const supabase = await createServiceSupabase();

  try {
    const { data: handoff } = await supabase
      .from('sub_handoffs')
      .select('id, observer_token, session_id, coach_id')
      .eq('observer_token', token)
      .single();

    if (!handoff) {
      return NextResponse.json({ error: 'Handoff not found' }, { status: 404 });
    }

    const { data: updated, error } = await supabase
      .from('sub_handoffs')
      .update({
        sub_note_text: trimmed,
        sub_note_at: new Date().toISOString(),
        // Clear seen-at on a re-write so the regular coach sees the new
        // note (the seen-bookmark is per-note-write, not per-row).
        sub_note_seen_at: null,
      })
      .eq('id', handoff.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, handoff: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sub-handoff sub-note error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
