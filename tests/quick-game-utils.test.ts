import { describe, it, expect } from 'vitest';
import {
  resolveInsertedId,
  buildQuickGamePayload,
  quickGameDestination,
} from '@/lib/quick-game-utils';

describe('resolveInsertedId', () => {
  it('resolves id from array response (Supabase insert with select)', () => {
    expect(resolveInsertedId([{ id: 'abc123' }])).toBe('abc123');
  });

  it('resolves id from object response', () => {
    expect(resolveInsertedId({ id: 'xyz789' })).toBe('xyz789');
  });

  it('returns null for empty array', () => {
    expect(resolveInsertedId([])).toBeNull();
  });

  it('returns null for array item without id', () => {
    expect(resolveInsertedId([{}])).toBeNull();
  });

  it('returns null for object without id', () => {
    expect(resolveInsertedId({})).toBeNull();
  });

  it('returns null for null', () => {
    expect(resolveInsertedId(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(resolveInsertedId(undefined)).toBeNull();
  });

  it('returns null for primitive string', () => {
    expect(resolveInsertedId('some-string')).toBeNull();
  });

  it('returns null for number', () => {
    expect(resolveInsertedId(42)).toBeNull();
  });
});

describe('buildQuickGamePayload', () => {
  it('builds a complete game payload with opponent', () => {
    const payload = buildQuickGamePayload('team-1', 'coach-1', 'game', 'Lakers');
    expect(payload.team_id).toBe('team-1');
    expect(payload.coach_id).toBe('coach-1');
    expect(payload.type).toBe('game');
    expect(payload.opponent).toBe('Lakers');
    expect(payload.notes).toBe('Quick-start game session');
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('trims whitespace from opponent name', () => {
    const payload = buildQuickGamePayload('team-1', 'coach-1', 'scrimmage', '  Bulls  ');
    expect(payload.opponent).toBe('Bulls');
  });

  it('sets opponent to null when empty string', () => {
    const payload = buildQuickGamePayload('team-1', 'coach-1', 'tournament', '');
    expect(payload.opponent).toBeNull();
  });

  it('sets opponent to null for whitespace-only string', () => {
    const payload = buildQuickGamePayload('team-1', 'coach-1', 'game', '   ');
    expect(payload.opponent).toBeNull();
  });

  it('uses todays date in YYYY-MM-DD format', () => {
    const today = new Date().toISOString().split('T')[0];
    const payload = buildQuickGamePayload('team-1', 'coach-1', 'game', '');
    expect(payload.date).toBe(today);
  });

  it('passes scrimmage type through unchanged', () => {
    const payload = buildQuickGamePayload('t', 'c', 'scrimmage', '');
    expect(payload.type).toBe('scrimmage');
  });

  it('passes tournament type through unchanged', () => {
    const payload = buildQuickGamePayload('t', 'c', 'tournament', 'Spring Classic');
    expect(payload.type).toBe('tournament');
    expect(payload.opponent).toBe('Spring Classic');
  });
});

describe('quickGameDestination', () => {
  it('routes game type to game-tracker', () => {
    expect(quickGameDestination('game', 'sess-1')).toBe('/sessions/sess-1/game-tracker');
  });

  it('routes scrimmage type to session detail', () => {
    expect(quickGameDestination('scrimmage', 'sess-2')).toBe('/sessions/sess-2');
  });

  it('routes tournament type to session detail', () => {
    expect(quickGameDestination('tournament', 'sess-3')).toBe('/sessions/sess-3');
  });

  it('includes the session id correctly in game-tracker path', () => {
    const dest = quickGameDestination('game', 'abc-def-123');
    expect(dest).toBe('/sessions/abc-def-123/game-tracker');
    expect(dest).toContain('abc-def-123');
  });
});
