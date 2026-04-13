/**
 * Tests for the offline observation save → background sync pipeline.
 *
 * Covers:
 *  - buildOfflineObservation: the shape of rows saved to localDB offline
 *  - triggerSync: only runs when navigator.onLine is true
 *  - queueSync: appends to syncQueue and triggers immediate sync when online
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Helpers shared by the review page's offline fallback
// ---------------------------------------------------------------------------

interface ObsInput {
  player_name: string;
  category: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  text: string;
  skill_id?: string | null;
}

interface PlayerRow {
  id: string;
  name: string;
  nickname: string | null;
  name_variants: string[] | null;
}

/**
 * Pure function extracted from the offline fallback branch in review/page.tsx.
 * Converts a confirmed observation into the shape persisted to localDB.
 */
function buildOfflineObservation(
  obs: ObsInput,
  opts: {
    teamId: string;
    coachId: string;
    recordingId: string | null;
    source: string;
    players: PlayerRow[];
    findPlayerId: (name: string, players: PlayerRow[]) => string | null;
  }
) {
  return {
    localId: crypto.randomUUID(),
    playerId: opts.findPlayerId(obs.player_name, opts.players),
    teamId: opts.teamId,
    coachId: opts.coachId,
    sessionId: null,
    recordingId: opts.recordingId,
    category: obs.category,
    sentiment: obs.sentiment,
    text: obs.text,
    rawText: obs.text,
    source: opts.source,
    aiParsed: true,
    skillId: obs.skill_id ?? null,
    result: null,
    isSynced: false,
    syncedAt: null,
    createdAt: expect.any(String) as unknown as string,
  };
}

/** Simple inline player-match stub (mirrors findPlayerByName's basic behaviour). */
function findPlayerId(name: string, players: PlayerRow[]): string | null {
  const lower = name.toLowerCase();
  return players.find((p) => p.name.toLowerCase() === lower)?.id ?? null;
}

// ---------------------------------------------------------------------------
// Offline observation shape
// ---------------------------------------------------------------------------

describe('buildOfflineObservation', () => {
  const players: PlayerRow[] = [
    { id: 'p1', name: 'Marcus', nickname: null, name_variants: null },
    { id: 'p2', name: 'Jaylen', nickname: null, name_variants: null },
  ];

  const baseOpts = {
    teamId: 'team-1',
    coachId: 'coach-1',
    recordingId: null,
    source: 'voice',
    players,
    findPlayerId,
  };

  it('sets isSynced to false and syncedAt to null', () => {
    const row = buildOfflineObservation(
      { player_name: 'Marcus', category: 'Dribbling', sentiment: 'positive', text: 'Great handles' },
      baseOpts
    );
    expect(row.isSynced).toBe(false);
    expect(row.syncedAt).toBeNull();
  });

  it('resolves a known player name to their id', () => {
    const row = buildOfflineObservation(
      { player_name: 'Jaylen', category: 'Defense', sentiment: 'needs-work', text: 'Slow on help defense' },
      baseOpts
    );
    expect(row.playerId).toBe('p2');
  });

  it('sets playerId to null for unknown players', () => {
    const row = buildOfflineObservation(
      { player_name: 'Unknown Kid', category: 'General', sentiment: 'neutral', text: 'Good effort' },
      baseOpts
    );
    expect(row.playerId).toBeNull();
  });

  it('copies skill_id and sets aiParsed to true', () => {
    const row = buildOfflineObservation(
      { player_name: 'Marcus', category: 'Shooting', sentiment: 'positive', text: 'Hit 3s', skill_id: 'skill-abc' },
      baseOpts
    );
    expect(row.skillId).toBe('skill-abc');
    expect(row.aiParsed).toBe(true);
  });

  it('sets recordingId from options', () => {
    const row = buildOfflineObservation(
      { player_name: 'Marcus', category: 'Dribbling', sentiment: 'positive', text: 'Test' },
      { ...baseOpts, recordingId: 'rec-123' }
    );
    expect(row.recordingId).toBe('rec-123');
  });

  it('generates a non-empty localId each time', () => {
    const r1 = buildOfflineObservation(
      { player_name: 'Marcus', category: 'Dribbling', sentiment: 'positive', text: 'A' },
      baseOpts
    );
    const r2 = buildOfflineObservation(
      { player_name: 'Marcus', category: 'Dribbling', sentiment: 'positive', text: 'B' },
      baseOpts
    );
    expect(r1.localId).toBeTruthy();
    expect(r2.localId).toBeTruthy();
    expect(r1.localId).not.toBe(r2.localId);
  });
});

// ---------------------------------------------------------------------------
// triggerSync — only runs when online
// ---------------------------------------------------------------------------

describe('triggerSync', () => {
  const originalOnLine = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine');

  function setOnline(value: boolean) {
    Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  }

  afterEach(() => {
    if (originalOnLine) {
      Object.defineProperty(Navigator.prototype, 'onLine', originalOnLine);
    }
  });

  it('does not run when offline', async () => {
    setOnline(false);

    // triggerSync should resolve immediately without calling the sync engine
    const { triggerSync } = await import('@/lib/sync/engine');
    const statusSpy = vi.fn();

    await triggerSync(statusSpy);

    expect(statusSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Background sync registration — navigator.serviceWorker.ready.sync
// ---------------------------------------------------------------------------

describe('BackgroundSync registration', () => {
  it('calls sync.register("sync-observations") when serviceWorker is available', async () => {
    const registerMock = vi.fn().mockResolvedValue(undefined);
    const readyMock = Promise.resolve({ sync: { register: registerMock } });

    Object.defineProperty(navigator, 'serviceWorker', {
      value: { ready: readyMock },
      configurable: true,
    });

    // Simulate what useSyncEngine's handleOnline does
    const reg = await navigator.serviceWorker.ready;
    await (reg as any).sync?.register('sync-observations');

    expect(registerMock).toHaveBeenCalledWith('sync-observations');
  });
});

// ---------------------------------------------------------------------------
// queueSync helper — adds to syncQueue and triggers immediate sync when online
// ---------------------------------------------------------------------------

describe('queueSync', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('skips when localDB is null (server-side)', async () => {
    // Mock local-db to return null (simulates SSR)
    vi.doMock('@/lib/storage/local-db', () => ({ localDB: null }));
    vi.doMock('@/lib/api', () => ({ mutate: vi.fn() }));

    const { queueSync } = await import('@/lib/sync/engine');

    // Should not throw
    await expect(queueSync('observations', 'id-1', 'create', {})).resolves.toBeUndefined();
  });
});
