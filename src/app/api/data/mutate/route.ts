import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();
  const body = await request.json();
  const { table, operation, data: payload, filters = {}, select = '*' } = body;

  const allowed = [
    'players', 'observations', 'sessions', 'plans', 'recordings',
    'media', 'teams', 'coaches', 'team_coaches', 'parent_shares',
    'config_overrides', 'organizations',
  ];

  if (!allowed.includes(table)) {
    return NextResponse.json({ error: `Table '${table}' not allowed for mutations` }, { status: 400 });
  }

  try {
    if (operation === 'insert') {
      const { data, error } = await admin.from(table).insert(payload).select(select);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (operation === 'update') {
      let query = admin.from(table).update(payload);
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query.select(select);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ data });
    }

    if (operation === 'delete') {
      let query = admin.from(table).delete();
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
      const { error } = await query;
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid operation' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
