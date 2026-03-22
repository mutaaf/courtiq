import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

const SYNCABLE_ENTITIES = [
  'observations',
  'recordings',
  'sessions',
  'players',
  'media',
] as const;

export async function GET(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('teamId');
  const since = searchParams.get('since'); // ISO timestamp of last sync
  const entities = searchParams.get('entities')?.split(',') || [...SYNCABLE_ENTITIES];

  if (!teamId) {
    return NextResponse.json({ error: 'teamId required' }, { status: 400 });
  }

  try {
    const changes: Record<string, any[]> = {};

    for (const entity of entities) {
      if (!SYNCABLE_ENTITIES.includes(entity as any)) continue;

      let query = supabase
        .from(entity)
        .select('*')
        .eq('team_id', teamId);

      if (since) {
        query = query.gt('updated_at', since);
      }

      query = query.order('updated_at', { ascending: true }).limit(500);

      const { data, error } = await query;
      if (error) {
        console.error(`Sync pull error for ${entity}:`, error);
        continue;
      }

      if (data && data.length > 0) {
        changes[entity] = data;
      }
    }

    return NextResponse.json({
      changes,
      serverTimestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Sync pull error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
