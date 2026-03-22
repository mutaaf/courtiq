'use client';

import { localDB, type SyncQueueItem } from '@/lib/storage/local-db';
import { createClient } from '@/lib/supabase/client';

const SYNC_INTERVAL = 30_000; // 30 seconds
let syncTimer: NodeJS.Timeout | null = null;
let isSyncing = false;

export async function startSyncEngine(onStatusChange?: (status: 'idle' | 'syncing' | 'error') => void) {
  if (syncTimer) return;

  // Initial sync
  await runSync(onStatusChange);

  // Periodic sync
  syncTimer = setInterval(() => {
    if (navigator.onLine) {
      runSync(onStatusChange);
    }
  }, SYNC_INTERVAL);

  // Sync on reconnect
  window.addEventListener('online', () => runSync(onStatusChange));
}

export function stopSyncEngine() {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}

async function runSync(onStatusChange?: (status: 'idle' | 'syncing' | 'error') => void) {
  if (isSyncing || !localDB || !navigator.onLine) return;

  isSyncing = true;
  onStatusChange?.('syncing');

  try {
    // 1. Push local observations
    await pushObservations();

    // 2. Push recordings metadata
    await pushRecordings();

    // 3. Process sync queue
    await processSyncQueue();

    onStatusChange?.('idle');
  } catch (error) {
    console.error('Sync error:', error);
    onStatusChange?.('error');
  } finally {
    isSyncing = false;
  }
}

async function pushObservations() {
  if (!localDB) return;

  const unsynced = await localDB.observations
    .where('isSynced')
    .equals(0)
    .toArray();

  if (unsynced.length === 0) return;

  const supabase = createClient();

  for (const obs of unsynced) {
    try {
      const { error } = await supabase.from('observations').insert({
        player_id: obs.playerId,
        team_id: obs.teamId,
        coach_id: obs.coachId,
        session_id: obs.sessionId,
        recording_id: obs.recordingId,
        category: obs.category,
        sentiment: obs.sentiment,
        text: obs.text,
        raw_text: obs.rawText,
        source: obs.source,
        ai_parsed: obs.aiParsed,
        skill_id: obs.skillId,
        result: obs.result,
        local_id: obs.localId,
        is_synced: true,
      });

      if (!error) {
        await localDB.observations.update(obs.localId, {
          isSynced: true,
          syncedAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error('Failed to sync observation:', obs.localId, err);
    }
  }
}

async function pushRecordings() {
  if (!localDB) return;

  const unsynced = await localDB.recordings
    .where('isSynced')
    .equals(0)
    .toArray();

  if (unsynced.length === 0) return;

  const supabase = createClient();

  for (const rec of unsynced) {
    try {
      // Upload audio blob to Supabase Storage
      const fileName = `recordings/${rec.coachId}/${rec.localId}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('audio')
        .upload(fileName, rec.audioBlob, {
          contentType: rec.mimeType,
          upsert: true,
        });

      if (uploadError) throw uploadError;

      // Create recording record
      const { error } = await supabase.from('recordings').insert({
        team_id: rec.teamId,
        coach_id: rec.coachId,
        session_id: rec.sessionId,
        storage_path: fileName,
        mime_type: rec.mimeType,
        raw_transcript: rec.rawTranscript,
        status: 'uploaded',
        duration_seconds: Math.round(rec.duration),
      });

      if (!error) {
        await localDB.recordings.update(rec.localId, {
          isSynced: true,
        });
      }
    } catch (err) {
      console.error('Failed to sync recording:', rec.localId, err);
    }
  }
}

async function processSyncQueue() {
  if (!localDB) return;

  const pending = await localDB.syncQueue
    .where('status')
    .equals('pending')
    .toArray();

  const supabase = createClient();

  for (const item of pending) {
    try {
      await localDB.syncQueue.update(item.id!, { status: 'syncing' });

      const payload = item.payload as Record<string, unknown>;

      switch (item.operation) {
        case 'create':
          await supabase.from(item.entityType).insert(payload);
          break;
        case 'update':
          await supabase
            .from(item.entityType)
            .update(payload)
            .eq('id', item.entityId);
          break;
        case 'delete':
          await supabase.from(item.entityType).delete().eq('id', item.entityId);
          break;
      }

      await localDB.syncQueue.delete(item.id!);
    } catch (err) {
      const retryCount = (item.retryCount || 0) + 1;
      await localDB.syncQueue.update(item.id!, {
        status: retryCount >= 5 ? 'failed' : 'pending',
        retryCount,
      });
    }
  }
}

export async function queueSync(
  entityType: string,
  entityId: string,
  operation: 'create' | 'update' | 'delete',
  payload: unknown
) {
  if (!localDB) return;

  await localDB.syncQueue.add({
    entityType,
    entityId,
    operation,
    payload,
    status: 'pending',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  });

  // Trigger immediate sync if online
  if (navigator.onLine) {
    runSync();
  }
}
