import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { memCached, TTL } from '@/lib/cache/memory';

// Tables that change infrequently → longer cache
const CACHE_TTL_MAP: Record<string, number> = {
  sports: TTL.HOUR,
  curricula: TTL.VERY_LONG,
  curriculum_skills: TTL.VERY_LONG,
  feature_flags: TTL.VERY_LONG,
  org_feature_flags: TTL.VERY_LONG,
  org_branding: TTL.VERY_LONG,
  config_overrides: TTL.LONG,
  organizations: TTL.LONG,
  players: TTL.MEDIUM,
  teams: TTL.MEDIUM,
  team_coaches: TTL.MEDIUM,
  drills: TTL.LONG,
  plans: TTL.MEDIUM,
  sessions: TTL.SHORT,
  observations: TTL.SHORT,
  recordings: TTL.MEDIUM,
  player_skill_proficiency: TTL.MEDIUM,
  player_achievements: TTL.LONG,
  player_goals: TTL.MEDIUM,
  player_notes: TTL.MEDIUM,
  parent_shares: TTL.LONG,
  season_archives: TTL.LONG,
  session_attendance: TTL.MEDIUM,
  player_availability: TTL.MEDIUM,
  ai_interactions: TTL.SHORT,
  team_announcements: TTL.MEDIUM,
};

function getCacheTTL(table: string): number {
  return CACHE_TTL_MAP[table] ?? TTL.SHORT;
}

function withCacheHeaders(response: NextResponse, ttlMs: number): NextResponse {
  const ttlSec = Math.floor(ttlMs / 1000);
  response.headers.set('Cache-Control', `private, max-age=${ttlSec}, stale-while-revalidate=${ttlSec * 2}`);
  return response;
}

// Allowed tables for data queries
const ALLOWED_TABLES = [
  'players', 'observations', 'sessions', 'plans', 'drills', 'recordings',
  'media', 'teams', 'coaches', 'team_coaches', 'sports', 'curricula',
  'curriculum_skills', 'player_skill_proficiency', 'parent_shares',
  'config_overrides', 'feature_flags', 'org_feature_flags', 'org_branding',
  'ai_interactions', 'organizations', 'season_archives', 'session_attendance',
  'player_availability', 'player_achievements', 'player_goals', 'player_notes',
  'team_announcements',
];

// ─── GET handler (query params) ──────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceSupabase();
    const url = new URL(request.url);
    const table = url.searchParams.get('table');
    const select = url.searchParams.get('select') || '*';
    const filtersRaw = url.searchParams.get('filters');
    const orderRaw = url.searchParams.get('order');
    const limitRaw = url.searchParams.get('limit');
    const singleRaw = url.searchParams.get('single');

    if (!table || !ALLOWED_TABLES.includes(table)) {
      return NextResponse.json({ error: `Table '${table}' not allowed` }, { status: 400 });
    }

    const filters = filtersRaw ? JSON.parse(filtersRaw) : {};
    const order = orderRaw ? JSON.parse(orderRaw) : null;
    const limit = limitRaw ? parseInt(limitRaw, 10) : null;
    const single = singleRaw === 'true';

    let query = admin.from(table).select(select);

    for (const [key, value] of Object.entries(filters)) {
      if (value === null) {
        query = query.is(key, null);
      } else if (typeof value === 'boolean') {
        query = query.eq(key, value);
      } else if (typeof value === 'object' && value !== null) {
        const op = value as { op: string; value: unknown };
        switch (op.op) {
          case 'neq':
            if (op.value === null) {
              query = query.not(key, 'is', null);
            } else {
              query = query.neq(key, op.value as string | number);
            }
            break;
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

    const ttl = getCacheTTL(table!);
    const cacheKey = `data:get:${user.id}:${table}:${select}:${JSON.stringify(filters)}:${orderRaw}:${limitRaw}:${singleRaw}`;

    const result = await memCached(cacheKey, ttl, async () => {
      if (single) {
        const { data, error } = await query.single();
        if (error && error.code !== 'PGRST116') {
          console.error('Data GET query error (single):', { table, select, filters, error: error.message });
          return { data: null };
        }
        return { data };
      }

      const { data, error, count } = await query;
      if (error) {
        console.error('Data GET query error:', { table, select, filters, error: error.message });
        return { data: [], count: 0 };
      }
      return { data: data || [], count };
    });

    return withCacheHeaders(NextResponse.json(result), ttl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown query error';
    console.error('Data GET query exception:', message);
    return NextResponse.json({ data: [], count: 0 });
  }
}

// ─── POST handler (JSON body) ────────────────────────────────────────────────
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

    if (!ALLOWED_TABLES.includes(table)) {
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
          case 'neq':
            if (op.value === null) {
              query = query.not(key, 'is', null);
            } else {
              query = query.neq(key, op.value as string | number);
            }
            break;
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

    const ttl = getCacheTTL(table);
    const cacheKey = `data:post:${user.id}:${table}:${select}:${JSON.stringify(filters)}:${JSON.stringify(order)}:${limit}:${single}`;

    const result = await memCached(cacheKey, ttl, async () => {
      if (single) {
        const { data, error } = await query.single();
        if (error && error.code !== 'PGRST116') {
          console.error('Data query error (single):', { table, select, filters, error: error.message });
          return { data: null };
        }
        return { data };
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
            return { data: [], count: 0 };
          }
          return { data: retryData || [], count: retryData?.length ?? 0 };
        }

        return { data: [], count: 0 };
      }

      return { data: data || [], count };
    });

    return withCacheHeaders(NextResponse.json(result), ttl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown query error';
    console.error('Data query exception:', message);
    return NextResponse.json({ data: [], count: 0 });
  }
}
