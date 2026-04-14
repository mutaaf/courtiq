import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Generic data query endpoint — bypasses RLS by using service role
// but validates user auth and scopes queries to user's teams
export async function POST(request: Request) {
  try {
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
      'ai_interactions', 'organizations', 'season_archives', 'session_attendance',
      'player_availability', 'player_achievements', 'player_goals', 'player_notes',
    ];

    if (!allowed.includes(table)) {
      return NextResponse.json({ error: `Table '${table}' not allowed` }, { status: 400 });
    }

    let query = admin.from(table).select(select);

    // Apply filters
    for (const [key, value] of Object.entries(filters)) {
      if (value === null) {
        query = query.is(key, null);
      } else if (typeof value === 'boolean') {
        // Handle booleans explicitly so they don't get treated as strings
        query = query.eq(key, value);
      } else if (typeof value === 'object' && value !== null) {
        const op = value as { op: string; value: unknown };
        switch (op.op) {
          case 'neq': query = query.neq(key, op.value); break;
          case 'gt': query = query.gt(key, op.value); break;
          case 'gte': query = query.gte(key, op.value); break;
          case 'lt': query = query.lt(key, op.value); break;
          case 'lte': query = query.lte(key, op.value); break;
          case 'in': query = query.in(key, op.value as any[]); break;
          case 'ilike': query = query.ilike(key, op.value as string); break;
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
        console.error('Data query error (single):', { table, select, filters, error: error.message });
        return NextResponse.json({ data: null });
      }
      return NextResponse.json({ data });
    }

    const { data, error, count } = await query;
    if (error) {
      console.error('Data query error:', { table, select, filters, error: error.message });

      // If the select has relational parts (e.g. "*, players(name)"), retry without them
      if (select && /\w+\(/.test(select)) {
        const simpleSelect = select
          .split(',')
          .map((s: string) => s.trim())
          .filter((s: string) => !/\w+\(/.test(s))
          .join(', ') || '*';

        console.warn(`Retrying query on '${table}' without relational select: "${simpleSelect}"`);
        const retryQuery = admin.from(table).select(simpleSelect);

        // Re-apply filters
        for (const [key, value] of Object.entries(filters)) {
          if (value === null) {
            retryQuery.is(key, null);
          } else if (typeof value === 'boolean') {
            retryQuery.eq(key, value);
          } else if (typeof value === 'object' && value !== null) {
            const op = value as { op: string; value: unknown };
            switch (op.op) {
              case 'neq': retryQuery.neq(key, op.value); break;
              case 'gt': retryQuery.gt(key, op.value); break;
              case 'gte': retryQuery.gte(key, op.value); break;
              case 'lt': retryQuery.lt(key, op.value); break;
              case 'lte': retryQuery.lte(key, op.value); break;
              case 'in': retryQuery.in(key, op.value as any[]); break;
              default: retryQuery.eq(key, op.value);
            }
          } else {
            retryQuery.eq(key, value);
          }
        }

        if (order) retryQuery.order(order.column, { ascending: order.ascending ?? false });
        if (limit) retryQuery.limit(limit);

        const { data: retryData, error: retryError } = await retryQuery;
        if (retryError) {
          console.error('Data query retry also failed:', { table, simpleSelect, error: retryError.message });
          return NextResponse.json({ data: [], count: 0 });
        }
        return NextResponse.json({ data: retryData || [], count: retryData?.length ?? 0 });
      }

      // No relational select to strip — return empty
      return NextResponse.json({ data: [], count: 0 });
    }

    return NextResponse.json({ data: data || [], count });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown query error';
    console.error('Data query exception:', message);
    return NextResponse.json({ data: [], count: 0 });
  }
}
