/**
 * Ticket 0065 — pure helpers for the coach-to-director invite primitive.
 *
 * `hashDirectorEmail` mirrors 0050's `program-referral-utils.ts` posture so
 * the dedup query (the shared 30-day check across `coach_director_contacts`
 * AND `program_referrals`) NEVER puts a raw email into a WHERE clause —
 * LESSONS#0023 family. `maskDirectorEmail` is the read-side mask the
 * pre-fill GET surfaces ("m***@example.com"). `validateDirectorName`
 * gates the name field on the share-sheet surface; voice-clean failures
 * speak positively (LESSONS#0023 — never enumerate the banned tokens).
 * `buildDirectorInviteEmail` is the structured (no AI) template the new
 * POST route fires after a successful upsert.
 */
import { describe, it, expect } from 'vitest';
import {
  hashDirectorEmail,
  maskDirectorEmail,
  validateDirectorName,
  buildDirectorInviteEmail,
  type DirectorInviteEmailArgs,
} from '@/lib/director-invite-utils';
import { TRAJECTORY_BANNED_WORDS } from '@/lib/player-trajectory-utils';

describe('hashDirectorEmail (ticket 0065)', () => {
  it('produces a deterministic lowercase hex sha256 for the same normalized email', () => {
    const a = hashDirectorEmail('Mike@Example.COM');
    const b = hashDirectorEmail('  mike@example.com  ');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns empty string for null / empty / non-string input', () => {
    expect(hashDirectorEmail(null)).toBe('');
    expect(hashDirectorEmail(undefined)).toBe('');
    expect(hashDirectorEmail('')).toBe('');
    expect(hashDirectorEmail('   ')).toBe('');
  });

  it('produces different hashes for different normalized emails', () => {
    const a = hashDirectorEmail('mike@example.com');
    const b = hashDirectorEmail('mike@example.net');
    expect(a).not.toBe(b);
  });
});

describe('maskDirectorEmail (ticket 0065)', () => {
  it('masks the local-part to first char + asterisks, keeps the domain intact', () => {
    expect(maskDirectorEmail('mike@example.com')).toBe('m***@example.com');
    expect(maskDirectorEmail('sarahdirector@league.org')).toBe('s***@league.org');
  });

  it('returns empty string for null / invalid input (no crash)', () => {
    expect(maskDirectorEmail(null)).toBe('');
    expect(maskDirectorEmail(undefined)).toBe('');
    expect(maskDirectorEmail('')).toBe('');
    expect(maskDirectorEmail('not-an-email')).toBe('');
  });

  it('handles a one-character local part without crashing', () => {
    expect(maskDirectorEmail('a@example.com')).toBe('a***@example.com');
  });
});

describe('validateDirectorName (ticket 0065)', () => {
  it('accepts a short common first name', () => {
    expect(validateDirectorName('Mike')).toEqual({ ok: true });
    expect(validateDirectorName('Sarah Jane')).toEqual({ ok: true });
  });

  it('rejects empty / whitespace-only as length', () => {
    expect(validateDirectorName('')).toEqual({ ok: false, reason: 'length' });
    expect(validateDirectorName('   ')).toEqual({ ok: false, reason: 'length' });
  });

  it('rejects strings longer than 60 chars as length', () => {
    expect(validateDirectorName('a'.repeat(61))).toEqual({ ok: false, reason: 'length' });
  });

  it('rejects a name containing a banned voice token', () => {
    // "amazing" is in the AGENTS.md banned list — used here as the
    // structural guard, NOT enumerated in the template instruction
    // anywhere in the helper itself (LESSONS#0023).
    expect(validateDirectorName('amazing Mike')).toEqual({ ok: false, reason: 'voice' });
  });
});

describe('buildDirectorInviteEmail (ticket 0065)', () => {
  const DEFAULTS: DirectorInviteEmailArgs = {
    coachFullName: 'Sarah Rodriguez',
    teamName: 'Hawks',
    directorFirstName: 'Mike',
    weeklyPulsePreview: {
      weekLabel: 'Week of May 25',
      sessionCount: 2,
      topCategories: ['Defense', 'Effort'],
      focusLine: 'spacing & off-ball movement',
    },
    deepLinkUrl: 'https://youthsportsiq.com/week/wpt-001?ref=director-invite',
    programClaimUrl:
      'https://youthsportsiq.com/programs?invite=director&ref=signed-payload-001',
    unsubscribeUrl: 'https://youthsportsiq.com/settings/profile',
  };

  it('returns { subject, html, text } with the lead line naming the coach + team', () => {
    const out = buildDirectorInviteEmail(DEFAULTS);
    expect(typeof out.subject).toBe('string');
    expect(out.subject).toContain('Sarah Rodriguez');
    expect(out.subject).toContain('Hawks');

    // Body names the coach, the team, the director.
    expect(out.html).toContain('Sarah Rodriguez');
    expect(out.html).toContain('Hawks');
    expect(out.html).toContain('Mike');
    expect(out.text).toContain('Sarah Rodriguez');
    expect(out.text).toContain('Hawks');
    expect(out.text).toContain('Mike');
  });

  it('renders the weekly-pulse preview shape (week label + session count + top categories + focus)', () => {
    const out = buildDirectorInviteEmail(DEFAULTS);
    expect(out.html).toContain('Week of May 25');
    // The session count appears as "2 session" with optional 's'.
    expect(out.html).toMatch(/2 session/i);
    // Top categories appear (Defense, Effort).
    expect(out.html).toContain('Defense');
    expect(out.html).toContain('Effort');
    // The focus line is HTML-escaped in the rendered email body
    // (`& -> &amp;` per the shared layout escape) — check the text version,
    // which preserves the original `&`, plus the escaped HTML form.
    expect(out.text).toContain('spacing & off-ball movement');
    expect(out.html).toContain('spacing &amp; off-ball movement');
  });

  it('renders the deep-link CTA pointing at /week/<token>?ref=director-invite', () => {
    const out = buildDirectorInviteEmail(DEFAULTS);
    expect(out.html).toContain(DEFAULTS.deepLinkUrl);
    expect(out.html).toMatch(/\?ref=director-invite/);
  });

  it('renders the secondary program-claim line pointing at /programs?invite=director&ref=<signed>', () => {
    const out = buildDirectorInviteEmail(DEFAULTS);
    expect(out.html).toContain(DEFAULTS.programClaimUrl);
    expect(out.html).toMatch(/invite=director/);
    expect(out.html).toMatch(/ref=signed-payload-001/);
  });

  it('renders the unsubscribe footer link from the existing email layout', () => {
    // The email layout's default footer carries the manage-preferences link.
    // The helper either passes through the unsubscribeUrl or uses the
    // default — either way, the rendered HTML must include unsubscribe wiring.
    const out = buildDirectorInviteEmail(DEFAULTS);
    expect(out.html).toMatch(/unsubscribe|manage email preferences/i);
  });

  it('contains NO AGENTS.md banned token in subject or body (LESSONS#0023)', () => {
    const out = buildDirectorInviteEmail(DEFAULTS);
    const haystack = `${out.subject}\n${out.html}\n${out.text}`.toLowerCase();
    for (const banned of TRAJECTORY_BANNED_WORDS) {
      expect(haystack).not.toContain(banned);
    }
  });

  it('escapes user-provided strings against HTML injection', () => {
    const out = buildDirectorInviteEmail({
      ...DEFAULTS,
      coachFullName: 'Sarah <script>alert(1)</script> Rodriguez',
      directorFirstName: 'Mike & Co',
    });
    expect(out.html).not.toContain('<script>alert(1)</script>');
    expect(out.html).toMatch(/&lt;script&gt;/);
    expect(out.html).toMatch(/Mike &amp; Co/);
  });

  it('falls back to "your team" rather than crashing when topCategories is empty', () => {
    const out = buildDirectorInviteEmail({
      ...DEFAULTS,
      weeklyPulsePreview: {
        ...DEFAULTS.weeklyPulsePreview,
        topCategories: [],
        focusLine: null,
      },
    });
    // The structured preview still names the team and the week label.
    expect(out.html).toContain('Hawks');
    expect(out.html).toContain('Week of May 25');
  });
});
