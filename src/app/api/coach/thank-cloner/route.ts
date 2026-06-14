/**
 * POST /api/coach/thank-cloner — ticket 0081.
 *
 * The publishing coach taps "Thank this coach" on a 0076 stuck
 * milestone card on /home. We write ONE row into
 * `coach_thank_messages` so the cloning coach reads it in their
 * inbox the next time they open SportsIQ. The publish → clone →
 * stick → recognize loop CLOSES here with a real coach-to-coach
 * human signal — the schema-level UNIQUE on (sender, recipient,
 * share) keeps the surface from drifting into a chat product.
 *
 * Ownership posture:
 *  - Caller MUST be the milestone's `published_coach_id`. 404 if
 *    a foreign coach attempts to thank.
 *  - Cloner is resolved server-side from `drill_clone_stick_signals`
 *    (drill branch) or from the practice plan's clone rows (plan
 *    branch). The client never supplies the recipient.
 *
 * Privacy / COPPA contract (LESSONS#0036):
 *  - `.select()` allow-lists on every read.
 *  - NEVER reads players / observations / parent_email / DOB /
 *    medical_notes / jersey / nickname.
 *  - Response payload carries `{ ok, message_id }` only — no email,
 *    no surname, no team-name.
 *
 * Anti-spam:
 *  - UNIQUE (sender, recipient, drill_share_id|plan_share_id) makes
 *    a re-tap silent-success — we look up the existing row first
 *    and return its id; only on a first-time write does the INSERT
 *    fire. (Belt + braces — the DB UNIQUE is the final guard.)
 *
 * Body sanitization:
 *  - HTML stripped via a conservative tag regex.
 *  - Length: 1..280 chars after trim. 400 on either side.
 *  - Defensive anti-email-leak per LESSONS#0061 — literal SPACE in
 *    the regex, not `\s+`, so labelled-key newlines never trip it.
 *  - 400 `body_contains_email` if the scan fires.
 *
 * Tier posture: NO new tier feature key. Universal — the publish-
 * graph is a free-tier-onward consequence and the cloning coach
 * may be on Free even when the publisher is on Pro.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// LESSONS#0061 — defensive scan uses a literal SPACE, not `\s+`, so
// a prompt-style labelled-key newline never tricks the guard. The
// pattern catches the common email shape; it is intentionally
// conservative — false positives are OK on this surface because the
// publisher's "thank-you" never legitimately includes an email.
const EMAIL_LIKE_RE = /[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function sanitizeBody(raw: unknown): {
  ok: true;
  body: string;
} | {
  ok: false;
  error: 'body_empty_or_too_long' | 'body_contains_email';
} {
  if (typeof raw !== 'string') return { ok: false, error: 'body_empty_or_too_long' };
  const stripped = stripHtml(raw).trim();
  if (stripped.length === 0 || stripped.length > 280) {
    return { ok: false, error: 'body_empty_or_too_long' };
  }
  if (EMAIL_LIKE_RE.test(stripped)) {
    return { ok: false, error: 'body_contains_email' };
  }
  return { ok: true, body: stripped };
}

type MilestoneRow = {
  id: string;
  published_coach_id: string;
  milestone_kind: string;
};

type StickRow = {
  drill_share_id: string;
  cloner_coach_id: string;
};

export async function POST(request: Request) {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    milestoneId?: unknown;
    body?: unknown;
    planShareId?: unknown;
  };

  const milestoneId = typeof body.milestoneId === 'string' ? body.milestoneId : '';
  if (!milestoneId) {
    return NextResponse.json({ error: 'milestoneId required' }, { status: 400 });
  }

  const sanitized = sanitizeBody(body.body);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  try {
    // 1) Resolve the milestone. The caller MUST be the publisher.
    //    Allow-list: id, published_coach_id, milestone_kind only.
    const { data: milestoneRow } = await admin
      .from('coach_reputation_milestones')
      .select('id, published_coach_id, milestone_kind')
      .eq('id', milestoneId)
      .maybeSingle();
    const milestone = milestoneRow as MilestoneRow | null;
    if (!milestone || milestone.published_coach_id !== user.id) {
      // 404 (not 403) so the response shape never confirms milestone
      // existence to a non-owner — same posture as the /consume route.
      return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
    }

    // 2) Resolve the cloner. Try the drill branch first via the
    //    linked stick signal; fall back to the plan branch if the
    //    request specified a planShareId.
    let drillShareId: string | null = null;
    let planShareId: string | null = null;
    let recipientCoachId: string | null = null;

    // Drill branch — the 0076 stuck_* milestones link 1:1 to a
    // drill_clone_stick_signals row via the drill_share owned by
    // the publisher. We scope by published_coach_id → drill_shares
    // → drill_clone_stick_signals and pick the most-recent stick.
    if (!planShareId) {
      // Read the publisher's drill_shares (allow-list id only).
      const { data: shareRows } = await admin
        .from('drill_shares')
        .select('id, coach_id')
        .eq('coach_id', user.id);
      const publisherShareIds = ((shareRows ?? []) as Array<{ id: string }>).map(
        (r) => r.id,
      );

      if (publisherShareIds.length > 0) {
        const { data: stickRow } = await admin
          .from('drill_clone_stick_signals')
          .select('drill_share_id, cloner_coach_id, stuck_at')
          .in('drill_share_id', publisherShareIds)
          .order('stuck_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const stick = stickRow as StickRow | null;
        if (stick) {
          drillShareId = stick.drill_share_id;
          recipientCoachId = stick.cloner_coach_id;
        }
      }
    }

    // Plan branch — if the client passed a planShareId (the plan
    // milestone surface, which is not yet shipped but the route
    // supports the shape from day one per the ticket's AC ix), we
    // resolve the cloner via the published plan's clone rows.
    if (!recipientCoachId && typeof body.planShareId === 'string' && body.planShareId) {
      const { data: planShareRow } = await admin
        .from('practice_plan_shares')
        .select('id, coach_id, plan_id')
        .eq('id', body.planShareId)
        .maybeSingle();
      const planShare = planShareRow as
        | { id: string; coach_id: string; plan_id?: string }
        | null;
      if (planShare && planShare.coach_id === user.id) {
        planShareId = planShare.id;
        // The cloning coach is the first coach with a `plans` row
        // whose source_plan_id matches the published plan id. We
        // pick the most-recent clone — the publish-loop closure
        // surface is "the last coach who ran your plan".
        const { data: cloneRows } = await admin
          .from('plans')
          .select('coach_id, source_plan_id, created_at')
          .eq('source_plan_id', planShare.plan_id ?? '')
          .order('created_at', { ascending: false })
          .limit(1);
        const clones = (cloneRows ?? []) as Array<{
          coach_id: string;
          source_plan_id: string;
        }>;
        if (clones.length > 0) {
          recipientCoachId = clones[0].coach_id;
        }
      }
    }

    if (!recipientCoachId || (!drillShareId && !planShareId)) {
      // No cloner resolvable for this milestone — silently 404. The
      // milestone-card render gate keeps this from happening in
      // practice; this is the defensive bound.
      return NextResponse.json({ error: 'Cloner not found' }, { status: 404 });
    }

    // 3) Idempotent write. Look up an existing message on the same
    //    (sender, recipient, share) edge first; the schema UNIQUE
    //    is the load-bearing final guard.
    const existingChain = admin
      .from('coach_thank_messages')
      .select('id')
      .eq('sender_coach_id', user.id)
      .eq('recipient_coach_id', recipientCoachId);
    const existingQuery = drillShareId
      ? existingChain.eq('drill_share_id', drillShareId)
      : existingChain.eq('plan_share_id', planShareId!);
    const { data: existingRow } = await existingQuery.maybeSingle();
    if (existingRow && (existingRow as { id?: string }).id) {
      return NextResponse.json({
        ok: true,
        message_id: (existingRow as { id: string }).id,
      });
    }

    // 4) Insert. Allow-list: only the four FK keys + body +
    //    milestone_id. sent_at defaults to NOW() in the schema.
    const insertPayload = {
      sender_coach_id: user.id,
      recipient_coach_id: recipientCoachId,
      drill_share_id: drillShareId,
      plan_share_id: planShareId,
      milestone_id: milestone.id,
      body: sanitized.body,
    };
    const { data: inserted, error } = await admin
      .from('coach_thank_messages')
      .insert(insertPayload)
      .select('id')
      .single();
    if (error) {
      // The UNIQUE constraint may race with a concurrent re-tap; in
      // that case re-read the existing row.
      const fallbackChain = admin
        .from('coach_thank_messages')
        .select('id')
        .eq('sender_coach_id', user.id)
        .eq('recipient_coach_id', recipientCoachId);
      const fallbackQuery = drillShareId
        ? fallbackChain.eq('drill_share_id', drillShareId)
        : fallbackChain.eq('plan_share_id', planShareId!);
      const { data: fallbackRow } = await fallbackQuery.maybeSingle();
      if (fallbackRow && (fallbackRow as { id?: string }).id) {
        return NextResponse.json({
          ok: true,
          message_id: (fallbackRow as { id: string }).id,
        });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      message_id: (inserted as { id: string }).id,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
