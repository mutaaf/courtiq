/**
 * Ticket 0041 — pure helpers for the Monday parent-rollup email cron.
 *
 * These tests pin the deterministic top-3 selection, the dedup-key format
 * (mirrors 0023's digest key exactly so the two emails coexist), the
 * subject + HTML builder shape, and the COPPA discipline: the HTML helper
 * never reads a `players` row — it only consumes
 * { reaction, message, parent_name, created_at } objects.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob (reserved for
 * Playwright). See docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import {
  isParentRollupDisabled,
  hasAlreadySentRollup,
  markRollupSent,
  getRollupKey,
  selectTopReactions,
  buildRollupSubject,
  buildRollupHtml,
  type RollupReaction,
} from '@/lib/weekly-parent-rollup-utils';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MONDAY = '2026-04-20';

function r(overrides: Partial<RollupReaction>): RollupReaction {
  return {
    reaction: '❤️',
    message: null,
    parent_name: null,
    created_at: '2026-04-21T10:00:00Z',
    ...overrides,
  };
}

// ─── selectTopReactions: deterministic order, messages preferred ──────────────

describe('selectTopReactions', () => {
  it('prefers reactions with messages over hearts-only, both sorted by created_at DESC', () => {
    const rows: RollupReaction[] = [
      r({ message: null, parent_name: 'Anon1', created_at: '2026-04-22T08:00:00Z' }),
      r({ message: 'thanks for sticking with Devon on his shooting.', parent_name: 'Sarah', created_at: '2026-04-21T09:00:00Z' }),
      r({ message: 'he came home pumped after Saturday.', parent_name: 'James', created_at: '2026-04-24T12:00:00Z' }),
      r({ message: null, parent_name: 'Anon2', created_at: '2026-04-25T08:00:00Z' }),
      r({ message: 'first time he asked for the ball at school.', parent_name: 'Maria', created_at: '2026-04-23T15:00:00Z' }),
    ];

    const top = selectTopReactions(rows, { limit: 3 });

    expect(top).toHaveLength(3);
    // All three carry a non-null message — never falls through to hearts-only when
    // messages are available.
    expect(top.every((t) => typeof t.message === 'string' && t.message.length > 0)).toBe(true);
    // Within the message set, sort is created_at DESC.
    expect(top[0].parent_name).toBe('James');
    expect(top[1].parent_name).toBe('Maria');
    expect(top[2].parent_name).toBe('Sarah');
  });

  it('returns whatever count is available when fewer than the limit have messages', () => {
    const rows: RollupReaction[] = [
      r({ message: 'one', parent_name: 'A', created_at: '2026-04-21T10:00:00Z' }),
      r({ message: 'two', parent_name: 'B', created_at: '2026-04-22T10:00:00Z' }),
      r({ message: null, parent_name: 'C', created_at: '2026-04-23T10:00:00Z' }),
    ];

    const top = selectTopReactions(rows, { limit: 3 });

    expect(top).toHaveLength(2);
    expect(top.map((t) => t.message)).toEqual(['two', 'one']);
  });

  it('returns [] when no reactions have a message', () => {
    const rows: RollupReaction[] = [
      r({ message: null, parent_name: 'A' }),
      r({ message: '   ', parent_name: 'B' }),
      r({ message: '', parent_name: 'C' }),
    ];

    expect(selectTopReactions(rows, { limit: 3 })).toEqual([]);
  });

  it('renders without parent_name as anonymous (handled by HTML builder, not the selector)', () => {
    const rows: RollupReaction[] = [
      r({ message: 'one', parent_name: null, created_at: '2026-04-21T10:00:00Z' }),
    ];

    const top = selectTopReactions(rows, { limit: 3 });

    expect(top).toHaveLength(1);
    expect(top[0].parent_name).toBeNull();
  });
});

// ─── Subject formatting ───────────────────────────────────────────────────────

describe('buildRollupSubject', () => {
  it('uses the coach first name and the week label', () => {
    const subj = buildRollupSubject('Marcus Hill', 'Apr 20–26');
    expect(subj).toBe("Marcus, your team's parents this week — Apr 20–26");
  });

  it('falls back to the full name when there is no space', () => {
    expect(buildRollupSubject('Coach', 'May 4–10')).toBe(
      "Coach, your team's parents this week — May 4–10",
    );
  });
});

// ─── Dedup-key formatting (must mirror 0023's pattern verbatim) ──────────────

describe('getRollupKey', () => {
  it('produces parent_rollup_week_<YYYY-MM-DD>', () => {
    expect(getRollupKey(MONDAY)).toBe('parent_rollup_week_2026-04-20');
  });
});

describe('hasAlreadySentRollup / markRollupSent', () => {
  it('returns false on null / non-object prefs', () => {
    expect(hasAlreadySentRollup(null, MONDAY)).toBe(false);
    // arrays / non-object prefs are ignored
    expect(hasAlreadySentRollup([] as unknown as Parameters<typeof hasAlreadySentRollup>[0], MONDAY)).toBe(false);
  });

  it('returns true after markRollupSent for that week', () => {
    const next = markRollupSent({}, MONDAY);
    expect(hasAlreadySentRollup(next, MONDAY)).toBe(true);
  });

  it('preserves existing keys, including the weekly-digest dedup key', () => {
    const existing = {
      'digest_week_2026-04-20': true,
      disable_weekly_digest: true,
    } as Parameters<typeof markRollupSent>[0];
    const next = markRollupSent(existing, MONDAY);
    expect((next as Record<string, unknown>)['digest_week_2026-04-20']).toBe(true);
    expect((next as Record<string, unknown>)['disable_weekly_digest']).toBe(true);
    expect(hasAlreadySentRollup(next as Parameters<typeof hasAlreadySentRollup>[0], MONDAY)).toBe(true);
  });

  it('different weeks are independent', () => {
    const next = markRollupSent({}, MONDAY);
    expect(hasAlreadySentRollup(next, '2026-04-27')).toBe(false);
  });
});

// ─── Opt-out — new key, independent from weekly digest ────────────────────────

describe('isParentRollupDisabled', () => {
  it('returns false on null / empty / unset prefs (default is opt-in)', () => {
    expect(isParentRollupDisabled(null)).toBe(false);
    expect(isParentRollupDisabled({})).toBe(false);
    expect(isParentRollupDisabled({ weekly_parent_rollup: true })).toBe(false);
  });

  it('returns true only when weekly_parent_rollup === false', () => {
    expect(isParentRollupDisabled({ weekly_parent_rollup: false })).toBe(true);
  });

  it('does NOT reuse disable_weekly_digest — the two opt-outs are independent', () => {
    expect(isParentRollupDisabled({ disable_weekly_digest: true })).toBe(false);
  });
});

// ─── HTML builder — clipboard voice, no banned words, no players row ──────────

describe('buildRollupHtml', () => {
  const APP_URL = 'https://app.example.com';

  it('renders the count, week label, and the three quoted notes with parent first names', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus Hill',
      weekLabel: 'Apr 20–26',
      totalCount: 12,
      topReactions: [
        { reaction: '❤️', message: "thanks for sticking with Devon on his shooting.", parent_name: 'Sarah', created_at: '2026-04-21T09:00:00Z' },
        { reaction: '❤️', message: 'he came home pumped after Saturday.', parent_name: 'James Wong', created_at: '2026-04-24T12:00:00Z' },
        { reaction: '❤️', message: 'first time he asked for the ball at school.', parent_name: 'Maria', created_at: '2026-04-23T15:00:00Z' },
      ],
      appUrl: APP_URL,
    });

    expect(html).toContain('12');
    expect(html).toContain('Apr 20–26');
    expect(html).toContain("thanks for sticking with Devon on his shooting.");
    expect(html).toContain('he came home pumped after Saturday.');
    expect(html).toContain('first time he asked for the ball at school.');
    // Parent first name only.
    expect(html).toContain('Sarah');
    expect(html).toContain('James');
    expect(html).not.toContain('James Wong'); // last name stripped
  });

  it('renders an anonymous label when parent_name is null', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus',
      weekLabel: 'Apr 20–26',
      totalCount: 1,
      topReactions: [
        { reaction: '❤️', message: 'thanks.', parent_name: null, created_at: '2026-04-21T09:00:00Z' },
      ],
      appUrl: APP_URL,
    });

    expect(html).toContain('A parent');
    expect(html).toContain('thanks.');
  });

  it('renders the count and a "no notes this week" line when there are reactions but no messages', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus',
      weekLabel: 'Apr 20–26',
      totalCount: 5,
      topReactions: [],
      appUrl: APP_URL,
    });

    expect(html).toContain('5');
    expect(html).toMatch(/no notes this week/i);
  });

  it('does not enumerate the AGENTS.md banned hype words in the rendered body', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus',
      weekLabel: 'Apr 20–26',
      totalCount: 3,
      topReactions: [
        { reaction: '❤️', message: 'thanks.', parent_name: 'Sarah', created_at: '2026-04-21T09:00:00Z' },
      ],
      appUrl: APP_URL,
    });

    // Banned-words guard from AGENTS.md non-negotiable #7.
    const lc = html.toLowerCase();
    for (const word of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock']) {
      expect(lc).not.toContain(word);
    }
  });

  it('never references a player_name / players key (COPPA contract)', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus',
      weekLabel: 'Apr 20–26',
      totalCount: 2,
      topReactions: [
        { reaction: '❤️', message: 'thanks.', parent_name: 'Sarah', created_at: '2026-04-21T09:00:00Z' },
      ],
      appUrl: APP_URL,
    });

    expect(html).not.toMatch(/player_name|players\./i);
  });

  // ── Ticket 0056 — per-reaction openReply deep-link ──────────────────────────
  //
  // The Monday rollup email is the entry point to the new in-app thank-you
  // sheet. Each highlighted reaction now carries an `?openReply=<reaction_id>`
  // link the inbox page consumes to auto-open the sheet. The email body itself
  // does NOT contain an AI draft — only the link.
  it('renders one openReply deep-link per highlighted reaction when ids are provided', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus',
      weekLabel: 'Apr 20–26',
      totalCount: 3,
      topReactions: [
        { id: 'rxn-aaa', reaction: '❤️', message: 'thanks for sticking with Devon on his shooting.', parent_name: 'Sarah', created_at: '2026-04-21T09:00:00Z' },
        { id: 'rxn-bbb', reaction: '❤️', message: 'pumped after Saturday.', parent_name: 'James', created_at: '2026-04-24T12:00:00Z' },
        { id: 'rxn-ccc', reaction: '❤️', message: 'asked for the ball at school.', parent_name: 'Maria', created_at: '2026-04-23T15:00:00Z' },
      ],
      appUrl: APP_URL,
    });

    // Each reaction gets a "Thank <FirstName>" call-to-action with the
    // ?openReply=<id> param the inbox page consumes on first render.
    expect(html).toContain('?openReply=rxn-aaa');
    expect(html).toContain('?openReply=rxn-bbb');
    expect(html).toContain('?openReply=rxn-ccc');
    // The visible CTA names the parent's first name.
    expect(html).toMatch(/Thank Sarah/i);
    expect(html).toMatch(/Thank James/i);
    expect(html).toMatch(/Thank Maria/i);
  });

  it('omits openReply links cleanly when topReactions carry no ids (regression: byte-identical to 0041)', () => {
    const html = buildRollupHtml({
      coachName: 'Marcus',
      weekLabel: 'Apr 20–26',
      totalCount: 2,
      topReactions: [
        // No `id` field — the old 0041 shape.
        { reaction: '❤️', message: 'thanks.', parent_name: 'Sarah', created_at: '2026-04-21T09:00:00Z' },
      ],
      appUrl: APP_URL,
    });

    // The old per-reaction lines stay identical; no `?openReply=` substring at
    // all when the ids aren't there.
    expect(html).not.toContain('?openReply');
  });
});
