import { describe, it, expect } from 'vitest';
import {
  generateContactToken,
  verifyContactToken,
  buildContactUrl,
  buildShareMessage,
  normalizePhone,
  isValidPhone,
  matchPlayer,
} from '../src/lib/parent-contact-utils';

// ─── Token generation & verification ─────────────────────────────────────────

describe('generateContactToken / verifyContactToken', () => {
  it('generates a token that verifies successfully', () => {
    const token = generateContactToken('team-123', 7);
    const payload = verifyContactToken(token);
    expect(payload).not.toBeNull();
    expect(payload?.teamId).toBe('team-123');
  });

  it('includes an expiry in the future', () => {
    const token = generateContactToken('team-abc', 7);
    const payload = verifyContactToken(token);
    expect(payload!.expires).toBeGreaterThan(Date.now());
  });

  it('returns null for a tampered token', () => {
    const token = generateContactToken('team-123', 7);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(verifyContactToken(tampered)).toBeNull();
  });

  it('returns null for an expired token', () => {
    // negative TTL → already expired
    const token = generateContactToken('team-xyz', -1);
    expect(verifyContactToken(token)).toBeNull();
  });

  it('returns null for a random string', () => {
    expect(verifyContactToken('not.a.real.token')).toBeNull();
    expect(verifyContactToken('')).toBeNull();
  });

  it('different teamIds produce different tokens', () => {
    const t1 = generateContactToken('team-A', 7);
    const t2 = generateContactToken('team-B', 7);
    expect(t1).not.toBe(t2);
  });
});

// ─── buildContactUrl ──────────────────────────────────────────────────────────

describe('buildContactUrl', () => {
  it('builds a correct URL', () => {
    const url = buildContactUrl('some-token', 'https://app.example.com');
    expect(url).toBe('https://app.example.com/parents/join/some-token');
  });

  it('URL-encodes the token', () => {
    const url = buildContactUrl('a.b+c=d', 'https://app.example.com');
    expect(url).toContain(encodeURIComponent('a.b+c=d'));
  });
});

// ─── buildShareMessage ────────────────────────────────────────────────────────

describe('buildShareMessage', () => {
  it('includes the team name and URL', () => {
    const msg = buildShareMessage('Rockets', 'Sarah', 'https://app.example.com/parents/join/tok');
    expect(msg).toContain('Rockets');
    expect(msg).toContain('https://app.example.com/parents/join/tok');
    expect(msg).toContain('Coach Sarah');
  });

  it('falls back gracefully when no coach name', () => {
    const msg = buildShareMessage('Tigers', null, 'https://x.com/y');
    expect(msg).toContain('Your coach');
    expect(msg).not.toContain('Coach null');
  });
});

// ─── normalizePhone ───────────────────────────────────────────────────────────

describe('normalizePhone', () => {
  it('normalises a 10-digit US number', () => {
    expect(normalizePhone('5551234567')).toBe('+15551234567');
  });

  it('normalises a formatted US number', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  it('normalises 11-digit US number starting with 1', () => {
    expect(normalizePhone('15551234567')).toBe('+15551234567');
  });

  it('keeps international numbers', () => {
    expect(normalizePhone('+447911123456')).toBe('+447911123456');
  });
});

// ─── isValidPhone ─────────────────────────────────────────────────────────────

describe('isValidPhone', () => {
  it('accepts valid US numbers', () => {
    expect(isValidPhone('5551234567')).toBe(true);
    expect(isValidPhone('(555) 123-4567')).toBe(true);
    expect(isValidPhone('+1 555 123 4567')).toBe(true);
  });

  it('rejects too-short strings', () => {
    expect(isValidPhone('12345')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });

  it('rejects too-long strings', () => {
    expect(isValidPhone('1234567890123456')).toBe(false);
  });
});

// ─── matchPlayer ──────────────────────────────────────────────────────────────

const players = [
  { id: 'p1', name: 'Marcus Williams', jersey_number: 12 },
  { id: 'p2', name: 'Sofia Ramirez', jersey_number: 23 },
  { id: 'p3', name: 'Jayden Smith', jersey_number: null },
  { id: 'p4', name: 'Tyler Jones', jersey_number: 4 },
];

describe('matchPlayer', () => {
  it('matches by jersey number', () => {
    const hit = matchPlayer(players, '12', undefined);
    expect(hit?.id).toBe('p1');
  });

  it('matches by first name (exact)', () => {
    const hit = matchPlayer(players, undefined, 'Sofia');
    expect(hit?.id).toBe('p2');
  });

  it('matches by first name case-insensitively', () => {
    const hit = matchPlayer(players, undefined, 'sofia');
    expect(hit?.id).toBe('p2');
  });

  it('partial first-name match fallback', () => {
    const hit = matchPlayer(players, undefined, 'Jay');
    expect(hit?.id).toBe('p3');
  });

  it('jersey takes precedence over name when both provided', () => {
    // jersey #4 = Tyler, but name = Marcus — jersey wins
    const hit = matchPlayer(players, '4', 'Marcus');
    expect(hit?.id).toBe('p4');
  });

  it('returns null when no match found', () => {
    expect(matchPlayer(players, '99', undefined)).toBeNull();
    expect(matchPlayer(players, undefined, 'Zara')).toBeNull();
  });

  it('returns null for empty roster', () => {
    expect(matchPlayer([], '12', undefined)).toBeNull();
  });

  it('returns null when no lookup criteria provided', () => {
    expect(matchPlayer(players, undefined, undefined)).toBeNull();
  });
});
