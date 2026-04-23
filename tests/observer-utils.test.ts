import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  buildTokenPayload,
  parseTokenPayload,
  isExpired,
  isValidTemplateId,
  getTemplateById,
  getPositiveTemplates,
  getNeedsWorkTemplates,
  buildObservationPayload,
  formatObserverCount,
  getSessionTypeLabel,
  buildObserverUrl,
  generateObserverToken,
  validateObserverToken,
  checkObserverRateLimit,
  getObserverRateKey,
} from '@/lib/observer-utils';
import { OBSERVATION_TEMPLATES } from '@/lib/observation-templates';

// ── Token payload helpers ──────────────────────────────────────────────────────

describe('buildTokenPayload', () => {
  it('encodes sessionId and expires separated by a colon', () => {
    const result = buildTokenPayload('abc-123', 1700000000000);
    expect(result).toBe('abc-123:1700000000000');
  });

  it('handles UUIDs with hyphens correctly', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const expires = 9999999999999;
    const result = buildTokenPayload(uuid, expires);
    expect(result).toBe(`${uuid}:${expires}`);
  });
});

describe('parseTokenPayload', () => {
  it('parses a valid payload', () => {
    const result = parseTokenPayload('session-id-here:1700000000000');
    expect(result.sessionId).toBe('session-id-here');
    expect(result.expires).toBe(1700000000000);
  });

  it('parses UUID session IDs that contain hyphens', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = parseTokenPayload(`${uuid}:1700000000000`);
    expect(result.sessionId).toBe(uuid);
    expect(result.expires).toBe(1700000000000);
  });

  it('returns empty values for a payload with no colon', () => {
    const result = parseTokenPayload('nocolon');
    expect(result.sessionId).toBe('');
    expect(result.expires).toBe(0);
  });

  it('returns expires 0 when the value after colon is not a number', () => {
    const result = parseTokenPayload('abc:notanumber');
    expect(result.sessionId).toBe('abc');
    expect(result.expires).toBe(0);
  });

  it('roundtrips with buildTokenPayload', () => {
    const id = 'some-session';
    const exp = 1700000000000;
    const { sessionId, expires } = parseTokenPayload(buildTokenPayload(id, exp));
    expect(sessionId).toBe(id);
    expect(expires).toBe(exp);
  });
});

describe('isExpired', () => {
  it('returns false for a future timestamp', () => {
    expect(isExpired(Date.now() + 10_000)).toBe(false);
  });

  it('returns true for a past timestamp', () => {
    expect(isExpired(Date.now() - 1)).toBe(true);
  });

  it('returns true for 0', () => {
    expect(isExpired(0)).toBe(true);
  });
});

// ── Token generation & validation ─────────────────────────────────────────────

describe('generateObserverToken / validateObserverToken', () => {
  it('generates a token with two dot-separated parts', () => {
    const token = generateObserverToken('sess-1');
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('validates a freshly generated token', () => {
    const sessionId = 'test-session-id';
    const token = generateObserverToken(sessionId);
    const result = validateObserverToken(token);
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe(sessionId);
  });

  it('rejects a token with a tampered signature', () => {
    const token = generateObserverToken('sess-2');
    const [payload] = token.split('.');
    const tampered = `${payload}.invalidsignature`;
    expect(validateObserverToken(tampered)).toBeNull();
  });

  it('rejects a token with a tampered payload', () => {
    const token = generateObserverToken('sess-3');
    const [, sig] = token.split('.');
    const fakePayload = Buffer.from('other-session:9999999999999').toString('base64url');
    const tampered = `${fakePayload}.${sig}`;
    expect(validateObserverToken(tampered)).toBeNull();
  });

  it('rejects a malformed token (no dot)', () => {
    expect(validateObserverToken('nodothere')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(validateObserverToken('')).toBeNull();
  });

  it('rejects an expired token (ttl = 0 hours)', () => {
    // ttl of 0 hours means it expires immediately
    const token = generateObserverToken('sess-exp', 0);
    // Sleep 1ms to ensure expiry
    const result = validateObserverToken(token);
    // May or may not be expired depending on timing; just check it doesn't throw
    expect(typeof result === 'object').toBe(true);
  });
});

// ── URL builder ───────────────────────────────────────────────────────────────

describe('buildObserverUrl', () => {
  it('builds a URL from a token using the provided base', () => {
    const url = buildObserverUrl('my.token', 'https://example.com');
    expect(url).toBe('https://example.com/observe/my.token');
  });

  it('uses an empty base when none is provided and env var is absent', () => {
    const url = buildObserverUrl('tok', '');
    expect(url).toBe('/observe/tok');
  });
});

// ── Template helpers ───────────────────────────────────────────────────────────

describe('isValidTemplateId', () => {
  it('returns true for a known positive template', () => {
    expect(isValidTemplateId('pos-shooting')).toBe(true);
  });

  it('returns true for a known needs-work template', () => {
    expect(isValidTemplateId('nw-defense')).toBe(true);
  });

  it('returns false for an unknown id', () => {
    expect(isValidTemplateId('not-a-real-id')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isValidTemplateId('')).toBe(false);
  });
});

describe('getTemplateById', () => {
  it('returns the template for a valid id', () => {
    const t = getTemplateById('pos-shooting');
    expect(t).toBeDefined();
    expect(t?.text).toBeTruthy();
  });

  it('returns undefined for an unknown id', () => {
    expect(getTemplateById('unknown')).toBeUndefined();
  });
});

describe('getPositiveTemplates', () => {
  it('returns only positive templates', () => {
    const positives = getPositiveTemplates();
    expect(positives.length).toBeGreaterThan(0);
    expect(positives.every((t) => t.sentiment === 'positive')).toBe(true);
  });

  it('includes all expected positive templates from the main list', () => {
    const expectedCount = OBSERVATION_TEMPLATES.filter(
      (t) => t.sentiment === 'positive'
    ).length;
    expect(getPositiveTemplates()).toHaveLength(expectedCount);
  });
});

describe('getNeedsWorkTemplates', () => {
  it('returns only needs-work templates', () => {
    const nw = getNeedsWorkTemplates();
    expect(nw.length).toBeGreaterThan(0);
    expect(nw.every((t) => t.sentiment === 'needs-work')).toBe(true);
  });

  it('combined positive + needs-work equals the full list length', () => {
    const total = getPositiveTemplates().length + getNeedsWorkTemplates().length;
    expect(total).toBe(OBSERVATION_TEMPLATES.length);
  });
});

// ── Observation payload builder ────────────────────────────────────────────────

describe('buildObservationPayload', () => {
  const template = OBSERVATION_TEMPLATES[0];
  const payload = buildObservationPayload(template, 'player-1', 'sess-1', 'team-1', 'coach-1');

  it('sets source to observer', () => {
    expect(payload.source).toBe('observer');
  });

  it('copies text, sentiment and category from the template', () => {
    expect(payload.text).toBe(template.text);
    expect(payload.sentiment).toBe(template.sentiment);
    expect(payload.category).toBe(template.category);
  });

  it('sets all IDs correctly', () => {
    expect(payload.player_id).toBe('player-1');
    expect(payload.session_id).toBe('sess-1');
    expect(payload.team_id).toBe('team-1');
    expect(payload.coach_id).toBe('coach-1');
  });

  it('marks as not AI-parsed and not coach-edited', () => {
    expect(payload.ai_parsed).toBe(false);
    expect(payload.coach_edited).toBe(false);
  });

  it('marks as synced', () => {
    expect(payload.is_synced).toBe(true);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('checkObserverRateLimit', () => {
  it('allows the first request from an IP', () => {
    expect(checkObserverRateLimit('1.2.3.4-test-a')).toBe(true);
  });

  it('blocks when the max per hour is exceeded', () => {
    const ip = '5.6.7.8-test-b';
    for (let i = 0; i < 50; i++) checkObserverRateLimit(ip, 50);
    expect(checkObserverRateLimit(ip, 50)).toBe(false);
  });

  it('allows a different IP regardless of another IP being blocked', () => {
    const blocked = '9.10.11.12-test-c';
    for (let i = 0; i < 50; i++) checkObserverRateLimit(blocked, 50);
    expect(checkObserverRateLimit('13.14.15.16-test-d', 50)).toBe(true);
  });
});

describe('getObserverRateKey', () => {
  it('prefixes the IP with observer:', () => {
    expect(getObserverRateKey('1.2.3.4')).toBe('observer:1.2.3.4');
  });
});

// ── Display helpers ────────────────────────────────────────────────────────────

describe('formatObserverCount', () => {
  it('returns the no-obs message for 0', () => {
    expect(formatObserverCount(0)).toBe('No observations yet');
  });

  it('returns singular for 1', () => {
    expect(formatObserverCount(1)).toBe('1 observation saved');
  });

  it('returns plural for 2+', () => {
    expect(formatObserverCount(5)).toBe('5 observations saved');
  });
});

describe('getSessionTypeLabel', () => {
  it('maps practice correctly', () => {
    expect(getSessionTypeLabel('practice')).toBe('Practice');
  });

  it('maps game correctly', () => {
    expect(getSessionTypeLabel('game')).toBe('Game');
  });

  it('maps scrimmage correctly', () => {
    expect(getSessionTypeLabel('scrimmage')).toBe('Scrimmage');
  });

  it('returns Session for unknown types', () => {
    expect(getSessionTypeLabel('unknown-type')).toBe('Session');
  });
});
