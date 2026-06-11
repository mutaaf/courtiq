/**
 * POST /api/coach/inbox/mark-read — ticket 0081.
 *
 * Stamps `read_at = NOW()` on the supplied message ids that the
 * caller actually owns (recipient_coach_id = caller). Foreign ids
 * are silently ignored — the publisher can NEVER mark someone
 * else's message read.
 *
 * The /home Inbox panel fires this on reveal (mark-as-SEEN on view,
 * NOT mark-as-replied — there is no reply primitive). Repeated
 * fires are idempotent: an already-stamped row stays at its first
 * read_at.
 *
 * Privacy / COPPA contract (LESSONS#0036):
 *  - `.select()` allow-lists on every read.
 *  - NEVER reads players / observations / parent_email.
 *  - Body: `{ messageIds: string[] }` — no email / surname / phone.
 *
 * Tier posture: universal — every recipient marks their own inbox
 * messages read regardless of tier.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    messageIds?: unknown;
  };
  const rawIds = Array.isArray(body.messageIds) ? body.messageIds : [];
  const messageIds = rawIds.filter((v): v is string => typeof v === 'string');
  if (messageIds.length === 0) {
    return NextResponse.json({ updated: 0 });
  }

  const admin = await createServiceSupabase();

  try {
    // Recipient-only update. The `eq('recipient_coach_id', user.id)`
    // is the load-bearing ownership guard — a foreign id in the
    // messageIds list silently misses the WHERE clause and does
    // not fire an update.
    // LESSONS#0036 — the .select('id') on the returning row keeps
    // the response shape allow-listed (we never echo the body /
    // sender / share ids back).
    // LESSONS#0072 — we never delete a field on the returned row;
    // we map to count only.
    const { data, error } = await admin
      .from('coach_thank_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('recipient_coach_id', user.id)
      .in('id', messageIds)
      .is('read_at', null)
      .select('id');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const updated = ((data ?? []) as Array<{ id: string }>).length;
    return NextResponse.json({ updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
