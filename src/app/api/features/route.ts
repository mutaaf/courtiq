import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

    // Get all feature flags
    const { data: flags } = await supabase
      .from('feature_flags')
      .select('*')
      .order('flag_key');

    // Get org-level overrides
    const { data: orgFlags } = await supabase
      .from('org_feature_flags')
      .select('*')
      .eq('org_id', coach.org_id);

    const orgFlagMap = new Map(
      (orgFlags || []).map((f: any) => [f.flag_key, f])
    );

    // Compute effective flags
    const effectiveFlags = (flags || []).map((flag: any) => {
      const orgOverride = orgFlagMap.get(flag.flag_key);
      return {
        flag_key: flag.flag_key,
        name: flag.name,
        description: flag.description,
        enabled: orgOverride ? orgOverride.enabled : flag.default_enabled,
        source: orgOverride ? 'org' : 'system',
        enabledAt: orgOverride?.enabled_at || null,
      };
    });

    return NextResponse.json({ flags: effectiveFlags });
  } catch (error: any) {
    console.error('Features GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { flagKey, enabled } = body;

  if (!flagKey || typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'flagKey and enabled (boolean) required' }, { status: 400 });
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

    if (coach.role !== 'admin') {
      return NextResponse.json({ error: 'Only admins can toggle feature flags' }, { status: 403 });
    }

    // Verify the flag exists
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('flag_key')
      .eq('flag_key', flagKey)
      .single();

    if (!flag) {
      return NextResponse.json({ error: 'Feature flag not found' }, { status: 404 });
    }

    // Upsert the org override
    const { data: orgFlag, error } = await supabase
      .from('org_feature_flags')
      .upsert(
        {
          org_id: coach.org_id,
          flag_key: flagKey,
          enabled,
          enabled_by: user.id,
          enabled_at: new Date().toISOString(),
        },
        { onConflict: 'org_id,flag_key' }
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ flag: orgFlag });
  } catch (error: any) {
    console.error('Features PUT error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
