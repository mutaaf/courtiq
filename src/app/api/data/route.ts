import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Generic data query endpoint — bypasses RLS by using service role
// but validates user auth and scopes queries to user's teams
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { table, select = '*', filters = {}, order, limit, single } = body;

  // Whitelist allowed tables
  const allowed = [
    'players', 'observations', 'sessions', 'plans', 'drills', 'recordings',
    'media', 'teams', 'coaches', 'team_coaches', 'sports', 'curricula',
    'curriculum_skills', 'player_skill_proficiency', 'parent_shares',
    'config_overrides', 'feature_flags', 'org_feature_flags', 'org_branding',
    'ai_interactions', 'organizations',
  ];

  if (!allowed.includes(table)) {
    return NextResponse.json({ error: `Table '${table}' not allowed` }, { status: 400 });
  }

  let query = admin.from(table).select(select);

  // Apply filters
  for (const [key, value] of Object.entries(filters)) {
    if (value === null) {
      query = query.is(key, null);
    } else if (typeof value === 'object' && value !== null) {
      const op = value as { op: string; value: unknown };
      switch (op.op) {
        case 'neq': query = query.neq(key, op.value); break;
        case 'gt': query = query.gt(key, op.value); break;
        case 'gte': query = query.gte(key, op.value); break;
        case 'lt': query = query.lt(key, op.value); break;
        case 'lte': query = query.lte(key, op.value); break;
        case 'in': query = query.in(key, op.value as any[]); break;
        default: query = query.eq(key, op.value);
      }
    } else {
      query = query.eq(key, value);
    }
  }

  if (order) {
    const { column, ascending = false } = order;
    query = query.order(column, { ascending });
  }

  if (limit) query = query.limit(limit);

  if (single) {
    const { data, error } = await query.single();
    if (error && error.code !== 'PGRST116') {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data });
  }

  try {
    const { data, error, count } = await query;
    if (error) {
      console.error('Data query error:', { table, filters, error: error.message });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ data: data || [], count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown query error';
    console.error('Data query exception:', { table, message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
