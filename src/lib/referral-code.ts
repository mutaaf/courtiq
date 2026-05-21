// Shared referral-code generation.
//
// Extracted from src/app/api/referrals/route.ts (ticket 0010) so the public
// team-card GET route can resolve a coach's referral code with the EXACT same
// deterministic algorithm rather than duplicating it. Both the referrals GET and
// the team-card GET must produce identical codes for a given coach id.

// Alphabet excludes visually confusing characters (0/O, 1/I/L).
export const REFERRAL_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Deterministic 6-char code from the first 6 bytes of the user UUID. */
export function makeReferralCode(userId: string): string {
  const hex = userId.replace(/-/g, '');
  return Array.from({ length: 6 }, (_, i) => {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return REFERRAL_CHARS[byte % REFERRAL_CHARS.length];
  }).join('');
}
