/**
 * Tests for the Player Injury & Availability feature.
 *
 * Covers:
 *  - deduplicateByPlayer: keeps latest record per player
 *  - deduplicateByPlayer: empty input returns empty map
 *  - deduplicateByPlayer: multiple players correctly separated
 *  - isPlayerAvailable: no record → available
 *  - isPlayerAvailable: status='available' → true
 *  - isPlayerAvailable: status='injured' → false
 *  - isPlayerAvailable: status='sick' → false
 *  - isPlayerAvailable: status='limited' → false
 *  - isPlayerAvailable: status='unavailable' → false
 *  - countUnavailablePlayers: no unavailable → 0
 *  - countUnavailablePlayers: all unavailable → full count
 *  - countUnavailablePlayers: mixed statuses → correct count
 *  - AVAILABILITY_CONFIG: all 5 statuses present
 *  - AVAILABILITY_CONFIG: each entry has label, color, bg, border, icon
 *  - VALID_STATUSES: contains exactly the expected 5 values
 */

import { describe, it, expect } from 'vitest';
import {
  deduplicateByPlayer,
  isPlayerAvailable,
  countUnavailablePlayers,
  VALID_STATUSES,
} from '@/lib/availability-utils';
import { AVAILABILITY_CONFIG } from '@/components/roster/availability-badge';
import type { PlayerAvailability, AvailabilityStatus } from '@/types/database';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeRecord(
  playerId: string,
  status: AvailabilityStatus,
  createdAt = '2024-01-01T10:00:00Z',
): PlayerAvailability {
  return {
    id: `av-${playerId}-${createdAt}`,
    player_id: playerId,
    team_id: 'team-1',
    status,
    reason: null,
    expected_return: null,
    notes: null,
    created_by: null,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

// ─── deduplicateByPlayer ──────────────────────────────────────────────────────

describe('deduplicateByPlayer', () => {
  it('returns an empty map for empty input', () => {
    expect(deduplicateByPlayer([])).toEqual({});
  });

  it('returns the only record when there is one', () => {
    const record = makeRecord('p1', 'injured');
    const result = deduplicateByPlayer([record]);
    expect(result['p1']).toEqual(record);
    expect(Object.keys(result)).toHaveLength(1);
  });

  it('keeps the latest record when a player has multiple entries', () => {
    const older = makeRecord('p1', 'injured', '2024-01-01T08:00:00Z');
    const newer = makeRecord('p1', 'limited', '2024-01-01T12:00:00Z');
    const result = deduplicateByPlayer([older, newer]);
    expect(result['p1'].status).toBe('limited');
  });

  it('keeps the latest even when array is reversed (older first)', () => {
    const older = makeRecord('p1', 'sick', '2024-01-02T06:00:00Z');
    const newer = makeRecord('p1', 'available', '2024-01-03T06:00:00Z');
    const result = deduplicateByPlayer([newer, older]); // newer passed first
    expect(result['p1'].status).toBe('available');
  });

  it('handles multiple different players independently', () => {
    const p1 = makeRecord('p1', 'injured', '2024-01-01T10:00:00Z');
    const p2 = makeRecord('p2', 'sick', '2024-01-01T10:00:00Z');
    const p2newer = makeRecord('p2', 'available', '2024-01-02T10:00:00Z');
    const result = deduplicateByPlayer([p1, p2, p2newer]);
    expect(result['p1'].status).toBe('injured');
    expect(result['p2'].status).toBe('available');
  });
});

// ─── isPlayerAvailable ───────────────────────────────────────────────────────

describe('isPlayerAvailable', () => {
  it('returns true when player has no record in the map', () => {
    expect(isPlayerAvailable('p1', {})).toBe(true);
  });

  it('returns true when status is available', () => {
    const map = { p1: makeRecord('p1', 'available') };
    expect(isPlayerAvailable('p1', map)).toBe(true);
  });

  it('returns false when status is injured', () => {
    const map = { p1: makeRecord('p1', 'injured') };
    expect(isPlayerAvailable('p1', map)).toBe(false);
  });

  it('returns false when status is sick', () => {
    const map = { p1: makeRecord('p1', 'sick') };
    expect(isPlayerAvailable('p1', map)).toBe(false);
  });

  it('returns false when status is limited', () => {
    const map = { p1: makeRecord('p1', 'limited') };
    expect(isPlayerAvailable('p1', map)).toBe(false);
  });

  it('returns false when status is unavailable', () => {
    const map = { p1: makeRecord('p1', 'unavailable') };
    expect(isPlayerAvailable('p1', map)).toBe(false);
  });
});

// ─── countUnavailablePlayers ─────────────────────────────────────────────────

describe('countUnavailablePlayers', () => {
  it('returns 0 when availabilityMap is empty', () => {
    expect(countUnavailablePlayers(['p1', 'p2', 'p3'], {})).toBe(0);
  });

  it('returns 0 when all players are available', () => {
    const map = {
      p1: makeRecord('p1', 'available'),
      p2: makeRecord('p2', 'available'),
    };
    expect(countUnavailablePlayers(['p1', 'p2'], map)).toBe(0);
  });

  it('returns full count when all players are restricted', () => {
    const map = {
      p1: makeRecord('p1', 'injured'),
      p2: makeRecord('p2', 'sick'),
      p3: makeRecord('p3', 'limited'),
    };
    expect(countUnavailablePlayers(['p1', 'p2', 'p3'], map)).toBe(3);
  });

  it('counts only restricted players in a mixed roster', () => {
    const map = {
      p1: makeRecord('p1', 'available'),
      p2: makeRecord('p2', 'injured'),
      p3: makeRecord('p3', 'unavailable'),
    };
    expect(countUnavailablePlayers(['p1', 'p2', 'p3'], map)).toBe(2);
  });

  it('ignores player IDs not present in the map', () => {
    const map = { p1: makeRecord('p1', 'injured') };
    // p2, p3 not in map → treated as available
    expect(countUnavailablePlayers(['p1', 'p2', 'p3'], map)).toBe(1);
  });
});

// ─── AVAILABILITY_CONFIG ──────────────────────────────────────────────────────

describe('AVAILABILITY_CONFIG', () => {
  const expectedStatuses: AvailabilityStatus[] = ['available', 'limited', 'injured', 'sick', 'unavailable'];

  it('has entries for all 5 statuses', () => {
    for (const s of expectedStatuses) {
      expect(AVAILABILITY_CONFIG[s]).toBeDefined();
    }
  });

  it('each entry has a non-empty label', () => {
    for (const s of expectedStatuses) {
      expect(typeof AVAILABILITY_CONFIG[s].label).toBe('string');
      expect(AVAILABILITY_CONFIG[s].label.length).toBeGreaterThan(0);
    }
  });

  it('each entry has color, bg, border, icon fields', () => {
    for (const s of expectedStatuses) {
      const cfg = AVAILABILITY_CONFIG[s];
      expect(cfg.color).toBeTruthy();
      expect(cfg.bg).toBeTruthy();
      expect(cfg.border).toBeTruthy();
      // Lucide icons are React components — function or object (forwardRef wrapper)
      expect(cfg.icon).toBeTruthy();
    }
  });
});

// ─── VALID_STATUSES ───────────────────────────────────────────────────────────

describe('VALID_STATUSES', () => {
  it('contains exactly 5 entries', () => {
    expect(VALID_STATUSES).toHaveLength(5);
  });

  it('includes all expected status values', () => {
    const expected: AvailabilityStatus[] = ['available', 'limited', 'injured', 'sick', 'unavailable'];
    for (const s of expected) {
      expect(VALID_STATUSES).toContain(s);
    }
  });
});
