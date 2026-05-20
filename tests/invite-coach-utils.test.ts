import { describe, it, expect, beforeEach } from 'vitest';
import {
  INVITE_MIN_SESSIONS,
  INVITE_MIN_OBSERVATIONS,
  DISMISS_DURATION_MS,
  getInviteDismissKey,
  isInviteDismissed,
  dismissInviteCard,
  meetsShowThreshold,
  extractFirstName,
  buildReferralUrl,
  buildInviteMessage,
  buildReferralBadgeText,
} from '@/lib/invite-coach-utils';

// ─── getInviteDismissKey ──────────────────────────────────────────────────────

describe('getInviteDismissKey', () => {
  it('produces a namespaced key from coachId', () => {
    expect(getInviteDismissKey('abc123')).toBe('sportsiq-invite-dismiss-abc123');
  });

  it('is different for different coach IDs', () => {
    expect(getInviteDismissKey('coach-1')).not.toBe(getInviteDismissKey('coach-2'));
  });
});

// ─── isInviteDismissed / dismissInviteCard ────────────────────────────────────

describe('isInviteDismissed', () => {
  beforeEach(() => localStorage.clear());

  it('returns false when no key exists', () => {
    expect(isInviteDismissed('coach-x')).toBe(false);
  });

  it('returns true when stored expiry is in the future', () => {
    const future = Date.now() + 1_000_000;
    localStorage.setItem(getInviteDismissKey('coach-x'), String(future));
    expect(isInviteDismissed('coach-x')).toBe(true);
  });

  it('returns false when stored expiry has already passed', () => {
    const past = Date.now() - 1;
    localStorage.setItem(getInviteDismissKey('coach-x'), String(past));
    expect(isInviteDismissed('coach-x')).toBe(false);
  });

  it('returns false for a corrupt (NaN) stored value', () => {
    localStorage.setItem(getInviteDismissKey('coach-x'), 'not-a-number');
    expect(isInviteDismissed('coach-x')).toBe(false);
  });

  it('is scoped to the coachId — dismissing one does not affect another', () => {
    dismissInviteCard('coach-a');
    expect(isInviteDismissed('coach-b')).toBe(false);
  });
});

describe('dismissInviteCard', () => {
  beforeEach(() => localStorage.clear());

  it('sets an expiry ~30 days in the future', () => {
    const before = Date.now();
    dismissInviteCard('coach-y');
    const stored = Number(localStorage.getItem(getInviteDismissKey('coach-y')));
    // Allow ±1 s of clock drift
    expect(stored).toBeGreaterThanOrEqual(before + DISMISS_DURATION_MS - 1_000);
    expect(stored).toBeLessThanOrEqual(before + DISMISS_DURATION_MS + 1_000);
  });

  it('makes isInviteDismissed return true immediately after', () => {
    dismissInviteCard('coach-y');
    expect(isInviteDismissed('coach-y')).toBe(true);
  });
});

// ─── meetsShowThreshold ───────────────────────────────────────────────────────

describe('meetsShowThreshold', () => {
  it('returns true at the exact minimums', () => {
    expect(meetsShowThreshold(INVITE_MIN_SESSIONS, INVITE_MIN_OBSERVATIONS)).toBe(true);
  });

  it('returns true well above minimums', () => {
    expect(meetsShowThreshold(10, 100)).toBe(true);
  });

  it('returns false when sessions are one below minimum', () => {
    expect(meetsShowThreshold(INVITE_MIN_SESSIONS - 1, INVITE_MIN_OBSERVATIONS)).toBe(false);
  });

  it('returns false when observations are one below minimum', () => {
    expect(meetsShowThreshold(INVITE_MIN_SESSIONS, INVITE_MIN_OBSERVATIONS - 1)).toBe(false);
  });

  it('returns false for a brand-new coach (0 / 0)', () => {
    expect(meetsShowThreshold(0, 0)).toBe(false);
  });
});

// ─── extractFirstName ─────────────────────────────────────────────────────────

describe('extractFirstName', () => {
  it('returns the first word of a full name', () => {
    expect(extractFirstName('Sarah Johnson')).toBe('Sarah');
  });

  it('returns the name unchanged when there is no space', () => {
    expect(extractFirstName('Marcus')).toBe('Marcus');
  });

  it('handles three-word names', () => {
    expect(extractFirstName('Maria de la Cruz')).toBe('Maria');
  });

  it('returns "Coach" for null', () => {
    expect(extractFirstName(null)).toBe('Coach');
  });

  it('returns "Coach" for undefined', () => {
    expect(extractFirstName(undefined)).toBe('Coach');
  });

  it('returns "Coach" for an empty string', () => {
    expect(extractFirstName('')).toBe('Coach');
  });
});

// ─── buildReferralUrl ─────────────────────────────────────────────────────────

describe('buildReferralUrl', () => {
  it('constructs a signup URL with the ref param', () => {
    expect(buildReferralUrl('https://sportsiq.app', 'ABC123')).toBe(
      'https://sportsiq.app/signup?ref=ABC123'
    );
  });

  it('works with a localhost origin', () => {
    expect(buildReferralUrl('http://localhost:3000', 'XYZ789')).toBe(
      'http://localhost:3000/signup?ref=XYZ789'
    );
  });
});

// ─── buildInviteMessage ───────────────────────────────────────────────────────

const BASE_PARAMS = {
  teamName: 'YMCA Rockets',
  referralUrl: 'https://sportsiq.app/signup?ref=TEST99',
};

describe('buildInviteMessage — player pluralisation', () => {
  it('uses singular "player" for exactly 1 player', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 1, observations: 10 });
    expect(msg).toContain('1 player ');
    expect(msg).not.toContain('1 players');
  });

  it('uses plural "players" for 0 players', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 0, observations: 5 });
    expect(msg).toContain('0 players');
  });

  it('uses plural "players" for 12 players', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 12, observations: 47 });
    expect(msg).toContain('12 players');
  });
});

describe('buildInviteMessage — content', () => {
  it('includes the team name', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 5, observations: 20 });
    expect(msg).toContain('YMCA Rockets');
  });

  it('includes the observation count', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 5, observations: 37 });
    expect(msg).toContain('37 observations');
  });

  it('includes the referral URL', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 5, observations: 20 });
    expect(msg).toContain('https://sportsiq.app/signup?ref=TEST99');
  });

  it('includes the free-month disclosure', () => {
    const msg = buildInviteMessage({ ...BASE_PARAMS, players: 5, observations: 20 });
    expect(msg).toContain('free month');
  });
});

// ─── buildReferralBadgeText ───────────────────────────────────────────────────

describe('buildReferralBadgeText', () => {
  it('uses singular "coach" for 1 referral', () => {
    expect(buildReferralBadgeText(1)).toBe('🎉 1 coach referred');
  });

  it('uses plural "coaches" for 2 referrals', () => {
    expect(buildReferralBadgeText(2)).toBe('🎉 2 coaches referred');
  });

  it('uses plural "coaches" for many referrals', () => {
    expect(buildReferralBadgeText(10)).toBe('🎉 10 coaches referred');
  });
});
