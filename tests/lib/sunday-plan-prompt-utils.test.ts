/**
 * Ticket 0058 — Sunday-evening plan-finish email builder + preferences
 * helpers.
 *
 * Voice contract (AGENTS.md + LESSONS#0023): no banned hype word in the
 * subject or body. The cron logic must be parameterized by team name,
 * day-of-next-session, gap count, draft snapshot, referral code, and
 * unsubscribe URL — every field is coach-owned or coach-authored content;
 * NO player names, NO observation text, NO parent data.
 *
 * `.test.ts` per LESSONS#0038.
 */
import { describe, it, expect } from 'vitest';
import {
  buildSundayPlanPromptEmail,
  buildSundayPlanPromptSubject,
  getSundayPromptKey,
  hasAlreadySentSundayPrompt,
  isSundayPromptDisabled,
  markSundayPromptSent,
  getIsoWeekKey,
  type DraftSnapshot,
} from '@/lib/sunday-plan-prompt-utils';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

const DEFAULT_DRAFT: DraftSnapshot = {
  draftId: 'plan-1',
  draftTitle: 'Closeout & spacing',
  drills: [
    { name: 'Defensive Slides', durationMinutes: 10 },
    { name: 'Closeout Drill', durationMinutes: 12 },
  ],
};

describe('buildSundayPlanPromptSubject', () => {
  it('names the team AND the gap, gap=2 case', () => {
    const subject = buildSundayPlanPromptSubject({
      teamName: 'Hawks',
      dayOfNextSession: 'Tuesday',
      gapCount: 2,
    });
    expect(subject).toBe('Your Tuesday plan for the Hawks — 2 drills left');
  });

  it('uses the singular for gap=1', () => {
    const subject = buildSundayPlanPromptSubject({
      teamName: 'Hawks',
      dayOfNextSession: 'Tuesday',
      gapCount: 1,
    });
    expect(subject).toBe('Your Tuesday plan for the Hawks — 1 drill left');
  });

  it('says "last 1 minute" when everything is filled but the coach has not flipped it yet (gap=0)', () => {
    const subject = buildSundayPlanPromptSubject({
      teamName: 'Hawks',
      dayOfNextSession: 'Tuesday',
      gapCount: 0,
    });
    expect(subject).toBe('Your Tuesday plan for the Hawks — last 1 minute');
  });

  it('falls back to "your team" when team name is missing', () => {
    const subject = buildSundayPlanPromptSubject({
      teamName: '',
      dayOfNextSession: 'Tuesday',
      gapCount: 2,
    });
    expect(subject).toBe('Your Tuesday plan for your team — 2 drills left');
  });

  it('contains no AGENTS.md banned hype word for each fixture', () => {
    for (const fixture of [
      { teamName: 'Hawks', dayOfNextSession: 'Tuesday', gapCount: 0 },
      { teamName: 'Hawks', dayOfNextSession: 'Tuesday', gapCount: 2 },
      { teamName: 'Hawks', dayOfNextSession: 'Tuesday', gapCount: 4 },
    ]) {
      const subject = buildSundayPlanPromptSubject(fixture).toLowerCase();
      for (const banned of BANNED) {
        expect(subject).not.toContain(banned);
      }
    }
  });
});

describe('buildSundayPlanPromptEmail', () => {
  function build(
    overrides: Partial<Parameters<typeof buildSundayPlanPromptEmail>[0]> = {},
  ) {
    return buildSundayPlanPromptEmail({
      teamName: 'Hawks',
      dayOfNextSession: 'Tuesday',
      gapCount: 2,
      missingSegment: 'cooldown',
      draftSnapshot: DEFAULT_DRAFT,
      referralCode: 'ABCDEF',
      unsubscribeUrl: 'https://example.test/settings/profile',
      appUrl: 'https://example.test',
      ...overrides,
    });
  }

  it('returns {subject, html, text}', () => {
    const out = build();
    expect(out).toHaveProperty('subject');
    expect(out).toHaveProperty('html');
    expect(out).toHaveProperty('text');
    expect(typeof out.subject).toBe('string');
    expect(typeof out.html).toBe('string');
    expect(typeof out.text).toBe('string');
  });

  it('the subject matches the builder', () => {
    const out = build();
    expect(out.subject).toBe(
      buildSundayPlanPromptSubject({
        teamName: 'Hawks',
        dayOfNextSession: 'Tuesday',
        gapCount: 2,
      }),
    );
  });

  it('the html includes the draft title and every drill name + duration', () => {
    const out = build();
    expect(out.html).toContain('Closeout &amp; spacing'); // html-escaped &
    expect(out.html).toContain('Defensive Slides');
    expect(out.html).toContain('Closeout Drill');
    expect(out.html).toContain('10');
    expect(out.html).toContain('12');
  });

  it('the html CTA href deep-links to /plans?draftId=<id>', () => {
    const out = build();
    expect(out.html).toMatch(
      /href="https:\/\/example\.test\/plans\?draftId=plan-1"/,
    );
    expect(out.html).toMatch(/Finish in 12 minutes/);
  });

  it('the html footer carries the coach\'s referral code', () => {
    const out = build();
    expect(out.html).toContain('ABCDEF');
  });

  it('the html footer carries an unsubscribe link', () => {
    const out = build();
    expect(out.html).toContain('https://example.test/settings/profile');
  });

  it('the one-line "what\'s missing" line uses positive voice (no banned hype word)', () => {
    const out = build({ missingSegment: 'cooldown', gapCount: 1 });
    const lower = out.html.toLowerCase();
    for (const banned of BANNED) {
      expect(lower).not.toContain(banned);
    }
  });

  it('every banned hype word is absent from both html and text for the gap=4 fixture', () => {
    const out = build({
      gapCount: 4,
      missingSegment: 'warmup',
      draftSnapshot: { ...DEFAULT_DRAFT, drills: [] },
    });
    for (const banned of BANNED) {
      expect(out.html.toLowerCase()).not.toContain(banned);
      expect(out.text.toLowerCase()).not.toContain(banned);
    }
  });

  it('every banned hype word is absent for the gap=0 fixture', () => {
    const out = build({ gapCount: 0, missingSegment: null });
    for (const banned of BANNED) {
      expect(out.html.toLowerCase()).not.toContain(banned);
      expect(out.text.toLowerCase()).not.toContain(banned);
    }
  });

  it('falls back gracefully when team name is missing', () => {
    const out = build({ teamName: '' });
    expect(out.subject).toContain('your team');
  });

  it('the text fallback is non-empty and includes the CTA URL', () => {
    const out = build();
    expect(out.text).toContain('https://example.test/plans?draftId=plan-1');
    expect(out.text.length).toBeGreaterThan(50);
  });
});

describe('preferences helpers', () => {
  it('getIsoWeekKey returns a stable YYYY-Www string', () => {
    // Sunday May 31, 2026 → ISO week 2026-W22 (Mon May 25 → Sun May 31).
    const key = getIsoWeekKey(new Date('2026-05-31T19:00:00Z'));
    expect(key).toMatch(/^\d{4}-W\d{2}$/);
  });

  it('getSundayPromptKey embeds the iso week', () => {
    const key = getSundayPromptKey('2026-W22');
    expect(key).toBe('sunday_plan_prompt_2026-W22');
  });

  it('hasAlreadySentSundayPrompt returns true when the bookmark is set', () => {
    const prefs = { sunday_plan_prompt_2026: false, sunday_plan_prompt_2026_W22: false, ['sunday_plan_prompt_2026-W22']: true };
    expect(hasAlreadySentSundayPrompt(prefs, '2026-W22')).toBe(true);
  });

  it('hasAlreadySentSundayPrompt returns false on missing key, null prefs, or non-object', () => {
    expect(hasAlreadySentSundayPrompt(null, '2026-W22')).toBe(false);
    expect(hasAlreadySentSundayPrompt({}, '2026-W22')).toBe(false);
    expect(hasAlreadySentSundayPrompt('whatever', '2026-W22')).toBe(false);
    expect(hasAlreadySentSundayPrompt([], '2026-W22')).toBe(false);
  });

  it('isSundayPromptDisabled returns true only on === true', () => {
    expect(isSundayPromptDisabled({ disable_planning_prompts: true })).toBe(true);
    expect(isSundayPromptDisabled({ disable_planning_prompts: false })).toBe(false);
    expect(isSundayPromptDisabled({ disable_planning_prompts: 'true' })).toBe(false);
    expect(isSundayPromptDisabled(null)).toBe(false);
  });

  it('markSundayPromptSent preserves existing keys and sets the new one', () => {
    const before = { disable_practice_reminders: true, foo: 'bar' };
    const after = markSundayPromptSent(before, '2026-W22');
    expect(after).toMatchObject({
      disable_practice_reminders: true,
      foo: 'bar',
      ['sunday_plan_prompt_2026-W22']: true,
    });
  });
});
