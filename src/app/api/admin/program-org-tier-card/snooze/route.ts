import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';

// ─── POST /api/admin/program-org-tier-card/snooze ────────────────────────────
// Ticket 0087 — the director-side "Maybe later" primitive.
//
// Writes (or refreshes) one `org_card_snoozes` row keyed by
// (org_id, card_kind = 'program_org_tier', snoozed_until = now() + 14d).
// The program-pulse route reads the row and suppresses the program-org-tier
// card while `snoozed_until` is in the future.
//
// Authed director-only — mirrors the role gate on /api/ai/program-pulse
// (coach.role === 'admin'). Caller's org_id MUST match the body's orgId so
// a director cannot snooze a different org's card.
//
// No tier check: snoozing is universal across tiers (the card itself is the
// thing that gates by tier; the snooze just hides it).

const SNOOZE_DAYS = 14;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { orgId } = body ?? {};
  if (!orgId || typeof orgId !== 'string') {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  }

  // Resolve the caller's role + org. The director gate is admin-of-their-
  // own-org; a cross-org request is rejected with 403 so we never leak
  // another org's snooze state.
  const { data: callerRow } = await admin
    .from('coaches')
    .select('id, org_id, role')
    .eq('id', user.id)
    .single();
  const callerOrgId = (callerRow as any)?.org_id as string | undefined;
  const callerRole = (callerRow as any)?.role as string | undefined;

  if (callerRole !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  if (!callerOrgId || callerOrgId !== orgId) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 403 });
  }

  const snoozedUntil = new Date(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const snoozedAt = new Date().toISOString();

  const { error } = await admin
    .from('org_card_snoozes')
    .upsert(
      {
        org_id: orgId,
        card_kind: 'program_org_tier',
        snoozed_until: snoozedUntil,
        snoozed_by_coach_id: user.id,
        snoozed_at: snoozedAt,
      },
      { onConflict: 'org_id,card_kind' },
    );

  if (error) {
    return NextResponse.json({ error: 'Failed to snooze' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, snoozedUntil });
}
