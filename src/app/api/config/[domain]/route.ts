import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { resolveConfigFromDB } from '@/lib/config/resolver';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { domain } = await params;
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');

  try {
    // Get coach's org
    const { data: coach } = await supabase
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    // Get all keys for this domain from system defaults
    const domainDefaults = (SYSTEM_DEFAULTS as any)[domain];
    if (!domainDefaults) {
      return NextResponse.json({ error: `Unknown config domain: ${domain}` }, { status: 400 });
    }

    const config: Record<string, { value: unknown; source: string }> = {};

    for (const key of Object.keys(domainDefaults)) {
      const resolved = await resolveConfigFromDB(
        domain,
        key,
        { orgId: coach.org_id, teamId: teamId || undefined },
        supabase
      );
      config[key] = { value: resolved.value, source: resolved.source };
    }

    return NextResponse.json({ domain, config });
  } catch (error: any) {
    console.error('Config GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { domain } = await params;
  const body = await request.json();
  const { key, value, teamId, reason } = body;

  if (!key || value === undefined) {
    return NextResponse.json({ error: 'key and value required' }, { status: 400 });
  }

  try {
    // Get coach's org
    const { data: coach } = await supabase
      .from('coaches')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    // Only admins and head coaches can set config
    if (!['admin', 'head_coach'].includes(coach.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const scope = teamId ? 'team' : 'org';

    // Check for existing override
    let query = supabase
      .from('config_overrides')
      .select('id, value')
      .eq('domain', domain)
      .eq('key', key)
      .eq('org_id', coach.org_id);

    if (teamId) {
      query = query.eq('team_id', teamId);
    } else {
      query = query.is('team_id', null);
    }

    const { data: existing } = await query.single();

    let override;
    const previousValue = existing?.value ?? null;

    if (existing) {
      const { data } = await supabase
        .from('config_overrides')
        .update({
          value,
          changed_by: user.id,
          change_reason: reason || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single();
      override = data;
    } else {
      const { data } = await supabase
        .from('config_overrides')
        .insert({
          org_id: coach.org_id,
          team_id: teamId || null,
          scope,
          domain,
          key,
          value,
          changed_by: user.id,
          change_reason: reason || null,
        })
        .select()
        .single();
      override = data;
    }

    // Audit log
    await supabase.from('config_audit_log').insert({
      config_override_id: override?.id,
      org_id: coach.org_id,
      team_id: teamId || null,
      domain,
      key,
      action: existing ? 'update' : 'create',
      previous_value: previousValue,
      new_value: value,
      changed_by: user.id,
      change_reason: reason || null,
    });

    return NextResponse.json({ override });
  } catch (error: any) {
    console.error('Config PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ domain: string }> }
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { domain } = await params;
  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');
  const teamId = searchParams.get('teamId');

  if (!key) {
    return NextResponse.json({ error: 'key query param required' }, { status: 400 });
  }

  try {
    const { data: coach } = await supabase
      .from('coaches')
      .select('org_id, role')
      .eq('id', user.id)
      .single();

    if (!coach) {
      return NextResponse.json({ error: 'Coach not found' }, { status: 404 });
    }

    if (!['admin', 'head_coach'].includes(coach.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Find and delete the override
    let query = supabase
      .from('config_overrides')
      .select('id, value')
      .eq('domain', domain)
      .eq('key', key)
      .eq('org_id', coach.org_id);

    if (teamId) {
      query = query.eq('team_id', teamId);
    } else {
      query = query.is('team_id', null);
    }

    const { data: existing } = await query.single();

    if (!existing) {
      return NextResponse.json({ error: 'Override not found' }, { status: 404 });
    }

    await supabase
      .from('config_overrides')
      .delete()
      .eq('id', existing.id);

    // Audit log
    await supabase.from('config_audit_log').insert({
      config_override_id: existing.id,
      org_id: coach.org_id,
      team_id: teamId || null,
      domain,
      key,
      action: 'delete',
      previous_value: existing.value,
      new_value: null,
      changed_by: user.id,
    });

    return NextResponse.json({ deleted: true });
  } catch (error: any) {
    console.error('Config DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
