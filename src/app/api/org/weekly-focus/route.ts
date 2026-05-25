import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { canAccess, type Tier } from '@/lib/tier';
import { resolveConfig } from '@/lib/config/resolver';

// ─── /api/org/weekly-focus ─────────────────────────────────────────────────────
// Ticket 0031 — the program director's ONE org-scoped "weekly focus" string.
//
// Storage REUSES the existing System→Org→Team config cascade rather than a new
// table: the focus is a single `config_overrides` row at ORG scope, domain
// `program` / key `focus`, value = the free-text string (stored in the jsonb
// `value` column). It is read back through `resolveConfig` as an org override —
// not a bespoke store — so it composes with the existing config system.
//
//  GET  — any coach OF THE ORG can read the current focus for display. The read
//         is ALWAYS scoped to the CALLER's own org (the orgId query param is
//         advisory): a coach can never read another org's focus, so the focus
//         never leaks across orgs.
//  POST — setting the focus requires the caller to be an `admin` of the org AND
//         the org tier to satisfy canAccess(tier, 'feature_program_focus')
//         (Organization tier only). A non-admin org coach → 403, a cross-org
//         orgId → 404, a non-org tier → 403. The gate is server-side, not
//         UI-only (AGENTS.md rule 5).
//
// COPPA / data-minimization: the focus is a free-text coaching topic set by an
// adult director. It carries NO per-minor data, adds no field to `players`, and
// is never placed on any public/no-auth surface — it lives only in org config.

const FOCUS_DOMAIN = 'program';
const FOCUS_KEY = 'focus';
const MAX_FOCUS_LEN = 140;

/** Resolve the caller's coach row (org_id + role + org tier). */
async function resolveCaller(admin: Awaited<ReturnType<typeof createServiceSupabase>>, userId: string) {
  const { data: callerRow } = await admin
    .from('coaches')
    .select('id, org_id, role, organizations(tier)')
    .eq('id', userId)
    .single();

  return {
    orgId: (callerRow as any)?.org_id as string | undefined,
    role: (callerRow as any)?.role as string | undefined,
    tier: (((callerRow as any)?.organizations?.tier) || 'free') as Tier,
  };
}

/**
 * Read the org's current program focus through the config cascade (org override).
 * Returns the trimmed string, or null when none is set.
 */
async function readOrgFocus(
  admin: Awaited<ReturnType<typeof createServiceSupabase>>,
  orgId: string,
): Promise<string | null> {
  const { data: orgOverrides } = await admin
    .from('config_overrides')
    .select('domain, key, value')
    .eq('org_id', orgId)
    .is('team_id', null);

  const orgMap: Record<string, unknown> = {};
  (orgOverrides || []).forEach((o: any) => {
    orgMap[`${o.domain}.${o.key}`] = o.value;
  });

  // v1 reads at ORG scope only (per the ticket's out-of-scope: no per-team
  // override surface yet), so teamOverrides is intentionally empty.
  const resolved = resolveConfig<unknown>({
    domain: FOCUS_DOMAIN,
    key: FOCUS_KEY,
    systemDefaults: {},
    orgOverrides: orgMap,
    teamOverrides: {},
  });

  const value = typeof resolved === 'string' ? resolved.trim() : null;
  return value || null;
}

// ─── GET — read the caller's own org focus for display ──────────────────────────
export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  try {
    const { orgId: callerOrgId } = await resolveCaller(admin, user.id);
    // No org → no focus (best-effort; the display line just renders nothing).
    if (!callerOrgId) return NextResponse.json({ focus: null });

    // ALWAYS scope to the caller's OWN org — never the orgId from the query — so
    // the focus can never leak across orgs (cross-org read isolation).
    const focus = await readOrgFocus(admin, callerOrgId);
    return NextResponse.json({ focus });
  } catch (error: unknown) {
    console.error('Weekly focus GET error:', error);
    // Best-effort read: the Capture line degrades silently, never gates capture.
    return NextResponse.json({ focus: null });
  }
}

// ─── POST — set the org focus (admin + Organization tier only) ─────────────────
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json().catch(() => ({}));
  const { orgId } = body as { orgId?: string; focus?: unknown };
  const focusRaw = typeof body?.focus === 'string' ? body.focus.trim() : '';

  if (!orgId) {
    return NextResponse.json({ error: 'orgId required' }, { status: 400 });
  }
  if (!focusRaw) {
    return NextResponse.json({ error: 'A weekly focus is required.' }, { status: 400 });
  }
  if (focusRaw.length > MAX_FOCUS_LEN) {
    return NextResponse.json({ error: `Keep the focus under ${MAX_FOCUS_LEN} characters.` }, { status: 400 });
  }

  try {
    const { orgId: callerOrgId, role, tier } = await resolveCaller(admin, user.id);

    // Cross-org request: the caller must be operating on their OWN org. Treat a
    // mismatch as not-found so we never act on (or leak) another org.
    if (!callerOrgId || callerOrgId !== orgId) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Role gate: setting the program direction is an admin/director surface
    // (mirrors the 0028 program-pulse + /admin/org-analytics gate).
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Tier gate: Organization tier only — server-side, not UI-only.
    if (!canAccess(tier, 'feature_program_focus')) {
      return NextResponse.json(
        { error: 'The program weekly focus is an Organization plan feature.' },
        { status: 403 },
      );
    }

    // Upsert the org-scope override (one row per org for program.focus). The
    // unique constraint is (org_id, team_id, domain, key); team_id is null here.
    await admin
      .from('config_overrides')
      .upsert(
        {
          org_id: orgId,
          team_id: null,
          scope: 'org',
          domain: FOCUS_DOMAIN,
          key: FOCUS_KEY,
          value: focusRaw,
          changed_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,team_id,domain,key' },
      );

    return NextResponse.json({ focus: focusRaw });
  } catch (error: unknown) {
    console.error('Weekly focus POST error:', error);
    return NextResponse.json({ error: 'Failed to save the weekly focus.' }, { status: 500 });
  }
}
