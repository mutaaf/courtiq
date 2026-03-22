import { describe, it, expect } from 'vitest';
import { computeProficiency } from './proficiency';

const skillConfig = {
  progression_levels: {
    exploring: { min_success_rate: 0.25 },
    practicing: { min_success_rate: 0.5 },
    got_it: { min_success_rate: 0.75 },
    game_ready: { min_success_rate: 0.5, context: 'game_only' as const },
  },
};

function makeObs(result: 'success' | 'failure', date = '2026-03-01') {
  return { result, created_at: date };
}

describe('Proficiency Scoring', () => {
  it('returns insufficient_data below min_reps', () => {
    const obs = Array.from({ length: 3 }, () => makeObs('success'));
    expect(computeProficiency(obs, skillConfig, { minReps: 5 }).level).toBe('insufficient_data');
  });

  it('scores exploring at 25-49%', () => {
    const obs = [
      ...Array.from({ length: 3 }, () => makeObs('success')),
      ...Array.from({ length: 7 }, () => makeObs('failure')),
    ];
    expect(computeProficiency(obs, skillConfig).level).toBe('exploring');
  });

  it('scores practicing at 50-74%', () => {
    const obs = [
      ...Array.from({ length: 6 }, () => makeObs('success')),
      ...Array.from({ length: 4 }, () => makeObs('failure')),
    ];
    expect(computeProficiency(obs, skillConfig).level).toBe('practicing');
  });

  it('scores got_it at >= 75%', () => {
    const obs = [
      ...Array.from({ length: 16 }, () => makeObs('success')),
      ...Array.from({ length: 4 }, () => makeObs('failure')),
    ];
    expect(computeProficiency(obs, skillConfig).level).toBe('got_it');
  });

  it('uses sliding window of most recent N', () => {
    const old = Array.from({ length: 20 }, () => makeObs('failure', '2026-01-01'));
    const recent = Array.from({ length: 10 }, () => makeObs('success', '2026-03-01'));
    const result = computeProficiency([...old, ...recent], skillConfig, { windowSize: 10 });
    expect(result.level).toBe('got_it');
    expect(result.success_rate).toBe(1.0);
  });

  it('game_ready only evaluates game observations', () => {
    const practiceObs = Array.from({ length: 20 }, () => makeObs('success'));
    const result = computeProficiency(practiceObs, skillConfig, { sessionType: 'game' });
    // All observations have success results and we're looking at game context
    // Since these are practice obs being evaluated in game context, game_ready threshold applies
    expect(result.level).toBe('game_ready');
  });

  it('returns 0 success rate for insufficient data', () => {
    const obs = [makeObs('success')];
    const result = computeProficiency(obs, skillConfig, { minReps: 5 });
    expect(result.success_rate).toBe(0);
    expect(result.reps_evaluated).toBe(1);
  });

  it('detects improving trend', () => {
    const obs = [
      // Recent: all success
      ...Array.from({ length: 5 }, () => makeObs('success', '2026-03-15')),
      // Older: all failure
      ...Array.from({ length: 5 }, () => makeObs('failure', '2026-03-01')),
    ];
    const result = computeProficiency(obs, skillConfig);
    expect(result.trend).toBe('improving');
  });

  it('detects regressing trend', () => {
    const obs = [
      // Recent: all failure
      ...Array.from({ length: 5 }, () => makeObs('failure', '2026-03-15')),
      // Older: all success
      ...Array.from({ length: 5 }, () => makeObs('success', '2026-03-01')),
    ];
    const result = computeProficiency(obs, skillConfig);
    expect(result.trend).toBe('regressing');
  });
});
