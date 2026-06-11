/**
 * GET /api/coach/inbox — ticket 0081.
 *
 * Returns the caller's inbox rows: every `coach_thank_messages` row
 * where the caller is the recipient, ordered with unread (`read_at`
 * NULL) first, then most-recent. Cap at 50.
 *
 * Each rendered message carries:
 *  - `id`, `sender_first_name`, `sender_program_name`,
 *    `drill_or_plan_title`, `body`, `sent_at`, `read_at`.
 *
 * Privacy / COPPA contract (LESSONS#0036):
 *  - `.select()` allow-lists on every read.
 *  - NEVER reads players / observations / parent_email / DOB.
 *  - The sender's email / surname / phone NEVER leaves the server.
 *  - The "program name" we render is the sender's organization name —
 *    the same scope the 0076 milestone surface already exposes.
 *  - LESSONS#0072 — we never `delete` a field on a DB-read object;
 *    every projection here is a SPREAD into a new object.
 *
 * Tier posture: universal — every coach who received a thank-you
 * sees their inbox regardless of tier.
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

const MAX_ROWS = 50;

type MessageRow = {
  id: string;
  sender_coach_id: string;
  drill_share_id: string | null;
  plan_share_id: string | null;
  body: string;
  sent_at: string;
  read_at: string | null;
};

export async function GET() {
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = await createServiceSupabase();

  try {
    // 1) Read the recipient's messages — unread first, then most-recent.
    //    Allow-list: id, sender_coach_id, drill_share_id, plan_share_id,
    //    body, sent_at, read_at. NEVER reads sender email/full_name.
    const { data: msgRowsRaw, error } = await admin
      .from('coach_thank_messages')
      .select(
        'id, sender_coach_id, drill_share_id, plan_share_id, body, sent_at, read_at',
      )
      .eq('recipient_coach_id', user.id)
      .order('read_at', { ascending: true, nullsFirst: true })
      .order('sent_at', { ascending: false })
      .limit(MAX_ROWS);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const messages = (msgRowsRaw ?? []) as MessageRow[];
    if (messages.length === 0) {
      return NextResponse.json({ messages: [] });
    }

    // 2) Batched lookups for the rendered fields. We resolve sender_id
    //    → coach.first_name + org_id, then org_id → organization.name,
    //    then drill_share_id → drill.name (or plan_share_id → plan.title).
    const senderIds = Array.from(new Set(messages.map((m) => m.sender_coach_id)));
    const drillShareIds = Array.from(
      new Set(
        messages
          .map((m) => m.drill_share_id)
          .filter((v): v is string => v !== null),
      ),
    );
    const planShareIds = Array.from(
      new Set(
        messages
          .map((m) => m.plan_share_id)
          .filter((v): v is string => v !== null),
      ),
    );

    // Sender coach allow-list: id, full_name (server-side split to
    // first name only), org_id. NEVER reads email / phone / handle.
    // LESSONS#0072 — we strip the surname here, never thread the
    // full_name to the projected message.
    const { data: coachRowsRaw } = await admin
      .from('coaches')
      .select('id, full_name, org_id')
      .in('id', senderIds);
    type CoachRow = {
      id: string;
      full_name: string | null;
      org_id: string | null;
    };
    const coachRows = (coachRowsRaw ?? []) as CoachRow[];
    const coachById = new Map<string, { id: string; first_name: string | null; org_id: string | null }>();
    for (const c of coachRows) {
      // Server-side first-name extraction — full_name.split(' ')[0]
      // is the canonical pattern (cf. /api/team-card/[token]). The
      // surname NEVER leaves this function.
      const firstName = c.full_name ? c.full_name.split(' ')[0] : null;
      coachById.set(c.id, {
        id: c.id,
        first_name: firstName,
        org_id: c.org_id,
      });
    }

    const orgIds = Array.from(
      new Set(coachRows.map((c) => c.org_id).filter((v): v is string => !!v)),
    );
    let orgById = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgRowsRaw } = await admin
        .from('organizations')
        .select('id, name')
        .in('id', orgIds);
      type OrgRow = { id: string; name: string };
      const orgRows = (orgRowsRaw ?? []) as OrgRow[];
      orgById = new Map(orgRows.map((o) => [o.id, o.name]));
    }

    // Drill share → drill name. Allow-list: drill_shares(id, drill_id)
    // + drills(id, name).
    let drillTitleByShareId = new Map<string, string>();
    if (drillShareIds.length > 0) {
      const { data: drillShareRowsRaw } = await admin
        .from('drill_shares')
        .select('id, drill_id')
        .in('id', drillShareIds);
      type DSR = { id: string; drill_id: string };
      const dsRows = (drillShareRowsRaw ?? []) as DSR[];
      const drillIds = Array.from(new Set(dsRows.map((r) => r.drill_id)));
      let drillNameById = new Map<string, string>();
      if (drillIds.length > 0) {
        const { data: drillRowsRaw } = await admin
          .from('drills')
          .select('id, name')
          .in('id', drillIds);
        type DR = { id: string; name: string };
        const drillRows = (drillRowsRaw ?? []) as DR[];
        drillNameById = new Map(drillRows.map((d) => [d.id, d.name]));
      }
      drillTitleByShareId = new Map(
        dsRows.map((r) => [r.id, drillNameById.get(r.drill_id) ?? 'a drill']),
      );
    }

    // Plan share → plan title. Allow-list: practice_plan_shares(id,
    // plan_id) + plans(id, title).
    let planTitleByShareId = new Map<string, string>();
    if (planShareIds.length > 0) {
      const { data: planShareRowsRaw } = await admin
        .from('practice_plan_shares')
        .select('id, plan_id')
        .in('id', planShareIds);
      type PSR = { id: string; plan_id: string };
      const psRows = (planShareRowsRaw ?? []) as PSR[];
      const planIds = Array.from(new Set(psRows.map((r) => r.plan_id)));
      let planTitleByPlanId = new Map<string, string>();
      if (planIds.length > 0) {
        const { data: planRowsRaw } = await admin
          .from('plans')
          .select('id, title')
          .in('id', planIds);
        type PR = { id: string; title: string };
        const planRows = (planRowsRaw ?? []) as PR[];
        planTitleByPlanId = new Map(planRows.map((p) => [p.id, p.title]));
      }
      planTitleByShareId = new Map(
        psRows.map((r) => [r.id, planTitleByPlanId.get(r.plan_id) ?? 'a plan']),
      );
    }

    // 3) Project the rendered shape. LESSONS#0072 — every projection
    //    is a SPREAD into a new object (we never carry the raw row
    //    through to the response).
    const rendered = messages.map((m) => {
      const sender = coachById.get(m.sender_coach_id);
      const senderFirstName = sender?.first_name ?? 'A coach';
      const senderProgramName = sender?.org_id
        ? orgById.get(sender.org_id) ?? 'another program'
        : 'another program';
      const title = m.drill_share_id
        ? drillTitleByShareId.get(m.drill_share_id) ?? 'a drill'
        : m.plan_share_id
          ? planTitleByShareId.get(m.plan_share_id) ?? 'a plan'
          : 'a drill';
      return {
        id: m.id,
        sender_first_name: senderFirstName,
        sender_program_name: senderProgramName,
        drill_or_plan_title: title,
        body: m.body,
        sent_at: m.sent_at,
        read_at: m.read_at,
      };
    });

    return NextResponse.json({ messages: rendered });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
