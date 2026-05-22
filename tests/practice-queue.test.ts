import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addDrillToQueue, readQueue, readQueuedDrillIds, getQueueKey } from '@/lib/practice-queue';
import type { Drill } from '@/types/database';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
});

const drill: Drill = {
  id: 'drill-1',
  sport_id: 'sport-1',
  org_id: null,
  coach_id: null,
  curriculum_skill_id: null,
  name: 'Figure-8 Dribble',
  description: 'Dribble through cones in a figure-8 pattern',
  category: 'dribbling',
  age_groups: ['U10', 'U12'],
  duration_minutes: 10,
  player_count_min: 1,
  player_count_max: null,
  equipment: ['cones', 'basketball'],
  video_url: null,
  diagram_url: null,
  cv_eval_config: null,
  setup_instructions: null,
  teaching_cues: ['Keep eyes up', 'Low dribble'],
  source: 'seeded',
  created_at: '2025-01-01T00:00:00Z',
};

describe('practice-queue', () => {
  beforeEach(() => {
    Object.keys(store).forEach((k) => delete store[k]);
  });

  it('reads empty queue for a new session', () => {
    expect(readQueue('s1')).toEqual([]);
  });

  it('readQueuedDrillIds returns empty set for new session', () => {
    expect(readQueuedDrillIds('s1').size).toBe(0);
  });

  it('getQueueKey includes session id', () => {
    expect(getQueueKey('abc')).toBe('practice-timer-queue-v1-abc');
  });

  it('emits category (not skill_category)', () => {
    addDrillToQueue('s1', drill);
    const [item] = readQueue('s1');
    expect(item.category).toBe('dribbling');
    expect((item as any).skill_category).toBeUndefined();
  });

  it('emits description', () => {
    addDrillToQueue('s1', drill);
    expect(readQueue('s1')[0].description).toBe('Dribble through cones in a figure-8 pattern');
  });

  it('converts duration_minutes to durationSecs', () => {
    addDrillToQueue('s1', drill);
    expect(readQueue('s1')[0].durationSecs).toBe(600);
  });

  it('defaults duration to 5 minutes when null', () => {
    addDrillToQueue('s1', { ...drill, duration_minutes: null });
    expect(readQueue('s1')[0].durationSecs).toBe(300);
  });

  it('defaults cues to empty array when null', () => {
    addDrillToQueue('s1', { ...drill, teaching_cues: null });
    expect(readQueue('s1')[0].cues).toEqual([]);
  });

  it('defaults description to empty string when falsy', () => {
    addDrillToQueue('s1', { ...drill, description: '' });
    expect(readQueue('s1')[0].description).toBe('');
  });

  it('sets drillId from drill.id', () => {
    addDrillToQueue('s1', drill);
    expect(readQueue('s1')[0].drillId).toBe('drill-1');
  });

  it('readQueuedDrillIds contains added drill id', () => {
    addDrillToQueue('s1', drill);
    expect(readQueuedDrillIds('s1').has('drill-1')).toBe(true);
  });

  it('accumulates multiple drills', () => {
    const drill2 = { ...drill, id: 'drill-2', name: 'Layup Lines' };
    addDrillToQueue('s1', drill);
    addDrillToQueue('s1', drill2);
    expect(readQueue('s1')).toHaveLength(2);
    expect(readQueuedDrillIds('s1').size).toBe(2);
  });

  it('scopes queue to session id — other sessions unaffected', () => {
    addDrillToQueue('s1', drill);
    expect(readQueue('s2')).toHaveLength(0);
  });

  it('id field includes drill id prefix', () => {
    addDrillToQueue('s1', drill);
    expect(readQueue('s1')[0].id).toMatch(/^drill-drill-1-/);
  });
});
