import { describe, it, expect } from 'vitest';
import { getDueEmails, parseSentKeys, DRIP_SEQUENCE, type DripKey } from '@/lib/email-drip';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns a timestamp that is `days` days after `createdAt`. */
function daysAfter(createdAt: string, days: number): number {
  return new Date(createdAt).getTime() + days * 24 * 60 * 60 * 1000;
}

const CREATED = '2024-01-01T00:00:00Z';

// ─── DRIP_SEQUENCE shape ──────────────────────────────────────────────────────

describe('DRIP_SEQUENCE', () => {
  it('has exactly 4 entries', () => {
    expect(DRIP_SEQUENCE).toHaveLength(4);
  });

  it('keys are day_1, day_3, day_7, day_14 in order', () => {
    expect(DRIP_SEQUENCE.map((e) => e.key)).toEqual(['day_1', 'day_3', 'day_7', 'day_14']);
  });

  it('afterDays are 1, 3, 7, 14', () => {
    expect(DRIP_SEQUENCE.map((e) => e.afterDays)).toEqual([1, 3, 7, 14]);
  });

  it('each entry has a non-empty subject', () => {
    DRIP_SEQUENCE.forEach((e) => {
      expect(e.subject.length).toBeGreaterThan(10);
    });
  });

  it('buildHtml returns valid HTML containing the coach name', () => {
    DRIP_SEQUENCE.forEach((e) => {
      const html = e.buildHtml('Jordan');
      expect(html).toContain('Jordan');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('SportsIQ');
    });
  });

  it('buildHtml escapes nothing fancy — plain name is embedded', () => {
    const html = DRIP_SEQUENCE[0].buildHtml('María');
    expect(html).toContain('María');
  });
});

// ─── getDueEmails ─────────────────────────────────────────────────────────────

describe('getDueEmails', () => {
  it('returns no emails on day 0', () => {
    const now = daysAfter(CREATED, 0);
    expect(getDueEmails(CREATED, [], now)).toHaveLength(0);
  });

  it('returns day_1 email exactly on day 1', () => {
    const now = daysAfter(CREATED, 1);
    const due = getDueEmails(CREATED, [], now);
    expect(due.map((e) => e.key)).toEqual(['day_1']);
  });

  it('returns day_1 and day_3 on day 3', () => {
    const now = daysAfter(CREATED, 3);
    const due = getDueEmails(CREATED, [], now);
    expect(due.map((e) => e.key)).toEqual(['day_1', 'day_3']);
  });

  it('returns day_1, day_3, day_7 on day 7', () => {
    const now = daysAfter(CREATED, 7);
    const due = getDueEmails(CREATED, [], now);
    expect(due.map((e) => e.key)).toEqual(['day_1', 'day_3', 'day_7']);
  });

  it('returns all 4 on day 14', () => {
    const now = daysAfter(CREATED, 14);
    const due = getDueEmails(CREATED, [], now);
    expect(due).toHaveLength(4);
  });

  it('returns all 4 on day 30 (late catch-up)', () => {
    const now = daysAfter(CREATED, 30);
    const due = getDueEmails(CREATED, [], now);
    expect(due).toHaveLength(4);
  });

  it('skips already-sent emails', () => {
    const now = daysAfter(CREATED, 7);
    const due = getDueEmails(CREATED, ['day_1', 'day_3'], now);
    expect(due.map((e) => e.key)).toEqual(['day_7']);
  });

  it('returns empty when all 4 are already sent', () => {
    const now = daysAfter(CREATED, 14);
    const allSent: DripKey[] = ['day_1', 'day_3', 'day_7', 'day_14'];
    expect(getDueEmails(CREATED, allSent, now)).toHaveLength(0);
  });

  it('handles fractional days — 1.5 days returns day_1 only', () => {
    const now = daysAfter(CREATED, 1) + 12 * 60 * 60 * 1000; // day 1.5
    const due = getDueEmails(CREATED, [], now);
    expect(due.map((e) => e.key)).toEqual(['day_1']);
  });

  it('uses Date.now() when nowMs is omitted (smoke test)', () => {
    // Created far in the past — all 4 should be due
    const pastCreated = '2020-01-01T00:00:00Z';
    const due = getDueEmails(pastCreated, []);
    expect(due).toHaveLength(4);
  });
});

// ─── parseSentKeys ────────────────────────────────────────────────────────────

describe('parseSentKeys', () => {
  it('returns [] for null', () => {
    expect(parseSentKeys(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(parseSentKeys(undefined)).toEqual([]);
  });

  it('returns [] for a non-object primitive', () => {
    expect(parseSentKeys('bad')).toEqual([]);
  });

  it('returns [] when drip_sent key is missing', () => {
    expect(parseSentKeys({ referral_code: 'ABC123' })).toEqual([]);
  });

  it('returns [] when drip_sent is not an array', () => {
    expect(parseSentKeys({ drip_sent: 'day_1' })).toEqual([]);
  });

  it('returns valid DripKeys from array', () => {
    const prefs = { drip_sent: ['day_1', 'day_3'] };
    expect(parseSentKeys(prefs)).toEqual(['day_1', 'day_3']);
  });

  it('filters out unknown keys', () => {
    const prefs = { drip_sent: ['day_1', 'day_99', 'bad_key'] };
    expect(parseSentKeys(prefs)).toEqual(['day_1']);
  });

  it('handles all 4 valid keys', () => {
    const prefs = { drip_sent: ['day_1', 'day_3', 'day_7', 'day_14'] };
    expect(parseSentKeys(prefs)).toEqual(['day_1', 'day_3', 'day_7', 'day_14']);
  });
});
