import { describe, it, expect } from 'vitest';
import { chalkTalkSportFor } from '@/lib/labs-sport-utils';

describe('chalkTalkSportFor', () => {
  it('opens basketball teams on the basketball board', () => {
    expect(chalkTalkSportFor('basketball')).toBe('basketball');
  });
  it('opens flag football teams on the 5v5 board by default', () => {
    expect(chalkTalkSportFor('flag-football')).toBe('flag5');
    expect(chalkTalkSportFor('Flag Football 5v5')).toBe('flag5');
    expect(chalkTalkSportFor('football')).toBe('flag5');
  });
  it('opens 7v7 teams on the 7v7 board', () => {
    expect(chalkTalkSportFor('flag-football-7v7')).toBe('flag7');
    expect(chalkTalkSportFor('7v7 flag')).toBe('flag7');
  });
  it('opens soccer teams on the soccer board (9v9 when the team says so)', () => {
    expect(chalkTalkSportFor('soccer')).toBe('soccer7');
    expect(chalkTalkSportFor('Youth Soccer 7v7')).toBe('soccer7');
    expect(chalkTalkSportFor('soccer-9v9')).toBe('soccer9');
  });
  it('falls back to basketball for sports the board does not know', () => {
    expect(chalkTalkSportFor('volleyball')).toBe('basketball');
    expect(chalkTalkSportFor('')).toBe('basketball');
    expect(chalkTalkSportFor(null)).toBe('basketball');
    expect(chalkTalkSportFor(undefined)).toBe('basketball');
  });
});
