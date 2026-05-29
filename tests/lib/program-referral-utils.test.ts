/**
 * Ticket 0050 — pure helpers backing the parent-to-program-director
 * referral primitive. NO DB, NO fetch. The HMAC matrix has to be tight
 * because the verified id is what gates the director-side banner + claim
 * stamp; same posture as the 0042 pause-token verify (LESSONS#0039).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import {
  hashDirectorEmail,
  isWithinDedupWindow,
  signDirectorId,
  verifyDirectorId,
  isValidEmailShape,
} from '@/lib/program-referral-utils';

const SECRET = 'test-secret-for-program-referral';
const SHARE_TOKEN = 'test-share-token-abc';
const DIRECTOR_HASH = hashDirectorEmail('director@league.org');

describe('hashDirectorEmail (ticket 0050)', () => {
  it('returns a 64-char lowercase hex sha256', () => {
    const h = hashDirectorEmail('director@league.org');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is case-insensitive and trims whitespace', () => {
    const a = hashDirectorEmail('Director@League.ORG');
    const b = hashDirectorEmail('  director@league.org  ');
    const c = hashDirectorEmail('director@league.org');
    expect(a).toEqual(c);
    expect(b).toEqual(c);
  });

  it('returns "" for empty/garbage input — never throws', () => {
    expect(hashDirectorEmail('')).toBe('');
    expect(hashDirectorEmail(null)).toBe('');
    expect(hashDirectorEmail(undefined)).toBe('');
    expect(hashDirectorEmail('   ')).toBe('');
  });

  it('produces distinct hashes for distinct emails', () => {
    expect(hashDirectorEmail('a@x.com')).not.toEqual(hashDirectorEmail('b@x.com'));
  });
});

describe('isWithinDedupWindow (ticket 0050)', () => {
  const NOW = new Date('2026-05-28T12:00:00Z').getTime();

  it('returns true exactly inside the 30-day window', () => {
    const oneDayAgo = new Date(NOW - 24 * 60 * 60 * 1000).toISOString();
    const twentyNineDaysAgo = new Date(NOW - 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(oneDayAgo, NOW)).toBe(true);
    expect(isWithinDedupWindow(twentyNineDaysAgo, NOW)).toBe(true);
  });

  it('returns false at and beyond the 30-day boundary', () => {
    const exactly30 = new Date(NOW - 30 * 24 * 60 * 60 * 1000).toISOString();
    const thirtyOneDaysAgo = new Date(NOW - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(isWithinDedupWindow(exactly30, NOW)).toBe(false);
    expect(isWithinDedupWindow(thirtyOneDaysAgo, NOW)).toBe(false);
  });

  it('accepts a Date or an ISO string', () => {
    const recent = new Date(NOW - 5 * 24 * 60 * 60 * 1000);
    expect(isWithinDedupWindow(recent, NOW)).toBe(true);
    expect(isWithinDedupWindow(recent.toISOString(), NOW)).toBe(true);
  });

  it('returns false for null/garbage input', () => {
    expect(isWithinDedupWindow(null, NOW)).toBe(false);
    expect(isWithinDedupWindow(undefined, NOW)).toBe(false);
    expect(isWithinDedupWindow('not-a-date', NOW)).toBe(false);
    expect(isWithinDedupWindow('', NOW)).toBe(false);
  });
});

describe('signDirectorId + verifyDirectorId (ticket 0050)', () => {
  it('round-trips a valid token under the same secret', () => {
    const token = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    expect(token.split('.')).toHaveLength(3);

    const v = verifyDirectorId(token, SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.shareToken).toBe(SHARE_TOKEN);
      expect(v.directorEmailHash).toBe(DIRECTOR_HASH);
    }
  });

  it('rejects a token signed under a different secret', () => {
    const token = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    expect(verifyDirectorId(token, 'a-different-secret').ok).toBe(false);
  });

  it('rejects a tampered share token', () => {
    const token = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    const [, hash, hmac] = token.split('.');
    const forged = `tampered-share.${hash}.${hmac}`;
    expect(verifyDirectorId(forged, SECRET).ok).toBe(false);
  });

  it('rejects a tampered director email hash', () => {
    const token = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    const [tok, , hmac] = token.split('.');
    const otherHash = hashDirectorEmail('different-director@league.org');
    const forged = `${tok}.${otherHash}.${hmac}`;
    expect(verifyDirectorId(forged, SECRET).ok).toBe(false);
  });

  it('rejects a tampered hmac', () => {
    const token = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    const [tok, hash] = token.split('.');
    const forged = `${tok}.${hash}.AAAAAAAAAAAAAAAA`;
    expect(verifyDirectorId(forged, SECRET).ok).toBe(false);
  });

  it('rejects empty/garbage input — never throws', () => {
    expect(verifyDirectorId('', SECRET).ok).toBe(false);
    expect(verifyDirectorId(null, SECRET).ok).toBe(false);
    expect(verifyDirectorId(undefined, SECRET).ok).toBe(false);
    expect(verifyDirectorId('only.two', SECRET).ok).toBe(false);
    expect(verifyDirectorId('a.b.c.d.e', SECRET).ok).toBe(false);
    expect(verifyDirectorId('totally-bogus', SECRET).ok).toBe(false);
  });

  it('rejects when secret is empty', () => {
    const token = signDirectorId({
      shareToken: SHARE_TOKEN,
      directorEmailHash: DIRECTOR_HASH,
      secret: SECRET,
    });
    expect(verifyDirectorId(token, '').ok).toBe(false);
  });

  it('throws when signing without a secret', () => {
    expect(() =>
      signDirectorId({ shareToken: SHARE_TOKEN, directorEmailHash: DIRECTOR_HASH, secret: '' }),
    ).toThrow();
  });
});

describe('isValidEmailShape (ticket 0050)', () => {
  it.each([
    ['a@b.co'],
    ['director@league.org'],
    ['first.last+tag@sub.domain.co.uk'],
  ])('accepts %s', (e) => {
    expect(isValidEmailShape(e)).toBe(true);
  });

  it.each([
    [''],
    [' '],
    ['no-at-sign'],
    ['two@@signs.com'],
    ['has space@x.com'],
    ['nodot@nope'],
    ['@only-domain.com'],
    ['only-local@'],
  ])('rejects %s', (e) => {
    expect(isValidEmailShape(e)).toBe(false);
  });

  it('rejects null / undefined / non-string', () => {
    expect(isValidEmailShape(null)).toBe(false);
    expect(isValidEmailShape(undefined)).toBe(false);
  });
});
