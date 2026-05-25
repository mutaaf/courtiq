import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Director-side discovery opt-in (ticket 0033).
//
// GET  /api/org/discoverable → { discoverable: boolean } for the caller's org.
// PATCH /api/org/discoverable { discoverable: boolean } → flips ONLY the
//        settings.discoverable jsonb flag (read-modify-write so the rest of the
//        org's settings is preserved), then returns { discoverable }.
//
// This is the one place the merge happens atomically server-side, and the
// org-ownership check lives in one place — rather than a client mutate() that
// would have to read-merge the whole settings jsonb itself. It still keeps the
// client off direct Supabase (AGENTS.md rule 3): the toggle component calls
// these endpoints. Gated on the caller HAVING an org (no feature_* tier key —
// this is an ungated acquisition surface, same product call as 0024's invite).
//
// Authenticated: 401 with no DB read when unauthenticated. (Middleware treats
// /api/org/ as public for the public /api/org/[slug] page, so this route does
// its OWN auth check — the only correct place for it, like /api/org/invite.)

async function resolveCallerOrgId(): Promise<
  | { orgId: string }
  | { error: NextResponse }
> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const admin = await createServiceSupabase();
  const { data: coach } = await admin
    .from('coaches')
    .select('org_id')
    .eq('id', user.id)
    .single();

  if (!coach?.org_id) {
    // No org → nothing to list in the directory; surface a benign 200 with the
    // flag OFF rather than an error (mirrors /api/org/invite's graceful null).
    return { error: NextResponse.json({ discoverable: false, hasOrg: false }) };
  }
  return { orgId: coach.org_id };
}

export async function GET() {
  const resolved = await resolveCallerOrgId();
  if ('error' in resolved) return resolved.error;

  const admin = await createServiceSupabase();
  const { data: org } = await admin
    .from('organizations')
    .select('settings')
    .eq('id', resolved.orgId)
    .single();

  const settings = (org?.settings as Record<string, unknown>) ?? {};
  return NextResponse.json({
    discoverable: settings.discoverable === true,
    hasOrg: true,
  });
}

export async function PATCH(request: Request) {
  const resolved = await resolveCallerOrgId();
  if ('error' in resolved) return resolved.error;

  let discoverable = false;
  try {
    const body = await request.json();
    discoverable = body?.discoverable === true;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Read-modify-write so only the discoverable flag changes; the rest of the
  // org's settings jsonb is preserved.
  const { data: org } = await admin
    .from('organizations')
    .select('settings')
    .eq('id', resolved.orgId)
    .single();

  const settings = { ...((org?.settings as Record<string, unknown>) ?? {}), discoverable };

  const { error } = await admin
    .from('organizations')
    .update({ settings })
    .eq('id', resolved.orgId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ discoverable, hasOrg: true });
}
