import { describe, it, expect } from 'vitest';
import { computeAttendanceSummary } from '@/app/(dashboard)/sessions/[sessionId]/attendance/page';
import type { Player, AttendanceStatus } from '@/types/database';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePlayer(id: string, name: string): Player {
  return {
    id,
    team_id: 'team-1',
    name,
    nickname: null,
    name_variants: null,
    age_group: 'U12',
    date_of_birth: null,
    position: 'Forward',
    jersey_number: null,
    photo_url: null,
    parent_name: null,
    parent_email: null,
    parent_phone: null,
    medical_notes: null,
    notes: null,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

const players = [
  makePlayer('p1', 'Alice'),
  makePlayer('p2', 'Bob'),
  makePlayer('p3', 'Carol'),
  makePlayer('p4', 'Dave'),
  makePlayer('p5', 'Eve'),
];

// ─── computeAttendanceSummary ─────────────────────────────────────────────────

describe('computeAttendanceSummary', () => {
  it('returns zeros when roster is empty', () => {
    const result = computeAttendanceSummary([], {});
    expect(result).toEqual({ present: 0, absent: 0, excused: 0, total: 0, pct: 0 });
  });

  it('counts 100% when all are present', () => {
    const records: Record<string, AttendanceStatus> = {
      p1: 'present', p2: 'present', p3: 'present', p4: 'present', p5: 'present',
    };
    const result = computeAttendanceSummary(players, records);
    expect(result.present).toBe(5);
    expect(result.absent).toBe(0);
    expect(result.excused).toBe(0);
    expect(result.total).toBe(5);
    expect(result.pct).toBe(100);
  });

  it('counts 0% when all are absent', () => {
    const records: Record<string, AttendanceStatus> = {
      p1: 'absent', p2: 'absent', p3: 'absent', p4: 'absent', p5: 'absent',
    };
    const result = computeAttendanceSummary(players, records);
    expect(result.present).toBe(0);
    expect(result.absent).toBe(5);
    expect(result.pct).toBe(0);
  });

  it('counts mixed statuses correctly', () => {
    const records: Record<string, AttendanceStatus> = {
      p1: 'present',
      p2: 'absent',
      p3: 'excused',
      p4: 'present',
      // p5 not in records
    };
    const result = computeAttendanceSummary(players, records);
    expect(result.present).toBe(2);
    expect(result.absent).toBe(1);
    expect(result.excused).toBe(1);
    expect(result.total).toBe(5);
    // pct = 2/5 = 40
    expect(result.pct).toBe(40);
  });

  it('rounds percentage correctly', () => {
    // 2/3 = 66.67 → rounds to 67
    const three = [makePlayer('a', 'A'), makePlayer('b', 'B'), makePlayer('c', 'C')];
    const records: Record<string, AttendanceStatus> = {
      a: 'present', b: 'present', c: 'absent',
    };
    const result = computeAttendanceSummary(three, records);
    expect(result.pct).toBe(67);
  });

  it('ignores players not in records when computing pct', () => {
    // Only p1 has a record (present). p2-p5 have no record.
    const records: Record<string, AttendanceStatus> = { p1: 'present' };
    const result = computeAttendanceSummary(players, records);
    // Only p1 is present; p2-p5 are neither absent nor present in the draft
    expect(result.present).toBe(1);
    expect(result.absent).toBe(0);
    expect(result.total).toBe(5);
    // pct = 1/5 = 20
    expect(result.pct).toBe(20);
  });

  it('handles 1-player team', () => {
    const single = [makePlayer('solo', 'Solo')];
    const records: Record<string, AttendanceStatus> = { solo: 'present' };
    const result = computeAttendanceSummary(single, records);
    expect(result.pct).toBe(100);
    expect(result.total).toBe(1);
  });

  it('handles all excused (none present)', () => {
    const records: Record<string, AttendanceStatus> = {
      p1: 'excused', p2: 'excused', p3: 'excused', p4: 'excused', p5: 'excused',
    };
    const result = computeAttendanceSummary(players, records);
    expect(result.present).toBe(0);
    expect(result.excused).toBe(5);
    expect(result.pct).toBe(0);
  });
});
