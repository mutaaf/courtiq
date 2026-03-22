import Dexie, { type Table } from 'dexie';

export interface LocalObservation {
  localId: string;
  playerId: string | null;
  teamId: string;
  coachId: string;
  sessionId: string | null;
  recordingId: string | null;
  category: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  text: string;
  rawText: string | null;
  source: string;
  aiParsed: boolean;
  skillId: string | null;
  result: string | null;
  isSynced: boolean;
  syncedAt: string | null;
  createdAt: string;
}

export interface LocalRecording {
  localId: string;
  teamId: string;
  coachId: string;
  sessionId: string | null;
  audioBlob: Blob;
  mimeType: string;
  duration: number;
  rawTranscript: string | null;
  status: string;
  isSynced: boolean;
  createdAt: string;
}

export interface LocalMedia {
  localId: string;
  teamId: string;
  coachId: string;
  playerId: string | null;
  sessionId: string | null;
  type: string;
  blob: Blob;
  mimeType: string;
  caption: string | null;
  isSynced: boolean;
  createdAt: string;
}

export interface SyncQueueItem {
  id?: number;
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  createdAt: string;
}

class CourtIQDatabase extends Dexie {
  observations!: Table<LocalObservation, string>;
  recordings!: Table<LocalRecording, string>;
  media!: Table<LocalMedia, string>;
  syncQueue!: Table<SyncQueueItem, number>;

  constructor() {
    super('CourtIQDB');

    this.version(1).stores({
      observations: 'localId, teamId, playerId, sessionId, isSynced, createdAt',
      recordings: 'localId, teamId, sessionId, isSynced, status, createdAt',
      media: 'localId, teamId, playerId, isSynced, createdAt',
      syncQueue: '++id, entityType, status, createdAt',
    });
  }
}

export const localDB = typeof window !== 'undefined' ? new CourtIQDatabase() : null;
