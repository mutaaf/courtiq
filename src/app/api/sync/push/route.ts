import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

interface SyncChange {
  entity_type: string;
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: Record<string, unknown>;
  local_id?: string;
  timestamp: string;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { changes, deviceId }: { changes: SyncChange[]; deviceId?: string } = body;

  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json({ error: 'changes array required' }, { status: 400 });
  }

  const results: { entity_id: string; status: string; error?: string }[] = [];

  for (const change of changes) {
    try {
      const { entity_type, entity_id, operation, payload, local_id } = change;

      if (operation === 'create') {
        const insertData = {
          ...payload,
          local_id: local_id || null,
          is_synced: true,
          synced_at: new Date().toISOString(),
        };
        const { error } = await supabase.from(entity_type).insert(insertData);
        if (error) throw error;
      } else if (operation === 'update') {
        const updateData = {
          ...payload,
          is_synced: true,
          synced_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from(entity_type)
          .update(updateData)
          .eq('id', entity_id);
        if (error) throw error;
      } else if (operation === 'delete') {
        const { error } = await supabase
          .from(entity_type)
          .delete()
          .eq('id', entity_id);
        if (error) throw error;
      }

      // Log the sync
      await supabase.from('sync_log').insert({
        coach_id: user.id,
        entity_type,
        entity_id,
        operation,
        payload,
        status: 'synced',
        synced_at: new Date().toISOString(),
      });

      results.push({ entity_id, status: 'synced' });
    } catch (error: any) {
      // Log the failure
      await supabase.from('sync_log').insert({
        coach_id: user.id,
        entity_type: change.entity_type,
        entity_id: change.entity_id,
        operation: change.operation,
        payload: change.payload,
        status: 'failed',
        error_message: error.message,
      });

      results.push({ entity_id: change.entity_id, status: 'failed', error: error.message });
    }
  }

  const synced = results.filter((r) => r.status === 'synced').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  return NextResponse.json({
    synced,
    failed,
    results,
    serverTimestamp: new Date().toISOString(),
  });
}
