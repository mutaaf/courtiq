import { describe, it, expect } from 'vitest';
import {
  filterPlayersWithEmail,
  countPlayersWithEmail,
  hasAnyParentEmail,
  matchMessageToPlayer,
  buildEmailPayloads,
  countMatchedEmails,
  buildParentEmailSubject,
  buildParentEmailHtml,
  escapeHtml,
  type ParentEmailPlayer,
  type MessageEntry,
} from '@/lib/parent-email-utils';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mkPlayer = (overrides: Partial<ParentEmailPlayer> = {}): ParentEmailPlayer => ({
  id: 'p1',
  name: 'Marcus Johnson',
  nickname: null,
  name_variants: null,
  parent_email: 'parent@example.com',
  parent_name: 'Linda Johnson',
  ...overrides,
});

const roster: ParentEmailPlayer[] = [
  mkPlayer({ id: 'p1', name: 'Marcus Johnson', parent_email: 'linda@example.com', parent_name: 'Linda' }),
  mkPlayer({ id: 'p2', name: 'Sarah Williams', parent_email: 'sarah.w@example.com', parent_name: 'Tom' }),
  mkPlayer({ id: 'p3', name: 'Jake Brown', parent_email: null, parent_name: null }),
  mkPlayer({ id: 'p4', name: 'Emma Davis', nickname: 'Em', name_variants: ['Emma D'], parent_email: 'davis@example.com', parent_name: null }),
  mkPlayer({ id: 'p5', name: 'Liam Smith', parent_email: '  ', parent_name: null }),
];

// ─── filterPlayersWithEmail ───────────────────────────────────────────────────

describe('filterPlayersWithEmail', () => {
  it('returns only players with non-empty parent_email', () => {
    const result = filterPlayersWithEmail(roster);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.id)).toEqual(['p1', 'p2', 'p4']);
  });

  it('treats whitespace-only email as no email', () => {
    const players = [mkPlayer({ parent_email: '   ' })];
    expect(filterPlayersWithEmail(players)).toHaveLength(0);
  });

  it('treats null email as no email', () => {
    const players = [mkPlayer({ parent_email: null })];
    expect(filterPlayersWithEmail(players)).toHaveLength(0);
  });

  it('returns empty array when roster is empty', () => {
    expect(filterPlayersWithEmail([])).toEqual([]);
  });
});

// ─── countPlayersWithEmail ────────────────────────────────────────────────────

describe('countPlayersWithEmail', () => {
  it('counts players with valid emails', () => {
    expect(countPlayersWithEmail(roster)).toBe(3);
  });

  it('returns 0 for empty roster', () => {
    expect(countPlayersWithEmail([])).toBe(0);
  });
});

// ─── hasAnyParentEmail ────────────────────────────────────────────────────────

describe('hasAnyParentEmail', () => {
  it('returns true when at least one player has email', () => {
    expect(hasAnyParentEmail(roster)).toBe(true);
  });

  it('returns false when no players have email', () => {
    const noEmail = roster.map((p) => ({ ...p, parent_email: null }));
    expect(hasAnyParentEmail(noEmail)).toBe(false);
  });

  it('returns false for empty roster', () => {
    expect(hasAnyParentEmail([])).toBe(false);
  });
});

// ─── matchMessageToPlayer ─────────────────────────────────────────────────────

describe('matchMessageToPlayer', () => {
  it('matches on exact full name (case-insensitive)', () => {
    const result = matchMessageToPlayer('marcus johnson', roster);
    expect(result?.id).toBe('p1');
  });

  it('matches on nickname', () => {
    const result = matchMessageToPlayer('Em', roster);
    expect(result?.id).toBe('p4');
  });

  it('matches on name variant', () => {
    const result = matchMessageToPlayer('Emma D', roster);
    expect(result?.id).toBe('p4');
  });

  it('matches on unique first name', () => {
    const result = matchMessageToPlayer('Sarah', roster);
    expect(result?.id).toBe('p2');
  });

  it('matches case-insensitively on first name', () => {
    const result = matchMessageToPlayer('JAKE', roster);
    expect(result?.id).toBe('p3');
  });

  it('matches "Marcus J." via first name', () => {
    const result = matchMessageToPlayer('Marcus J.', roster);
    expect(result?.id).toBe('p1');
  });

  it('returns null when no match found', () => {
    const result = matchMessageToPlayer('Unknown Player', roster);
    expect(result).toBeNull();
  });

  it('returns null on empty roster', () => {
    expect(matchMessageToPlayer('Marcus', [])).toBeNull();
  });

  it('does not match when first name is ambiguous', () => {
    const ambiguous: ParentEmailPlayer[] = [
      mkPlayer({ id: 'a', name: 'Chris Adams', parent_email: 'a@x.com' }),
      mkPlayer({ id: 'b', name: 'Chris Baker', parent_email: 'b@x.com' }),
    ];
    // "Chris" is ambiguous — skip to substring which is also ambiguous → null
    const result = matchMessageToPlayer('Chris', ambiguous);
    expect(result).toBeNull();
  });
});

// ─── buildEmailPayloads ───────────────────────────────────────────────────────

describe('buildEmailPayloads', () => {
  const messages: MessageEntry[] = [
    { player_name: 'Marcus', message: 'Great effort!', highlight: 'Fast break', next_focus: 'Free throws' },
    { player_name: 'Sarah', message: 'Strong defense.', highlight: 'Key steal', next_focus: 'Court vision' },
    { player_name: 'Jake', message: 'Solid work.', highlight: 'Hard drives', next_focus: 'Shooting' },
    { player_name: 'Nobody', message: 'Hmm.', highlight: 'N/A', next_focus: 'N/A' },
  ];

  it('returns payloads only for players with email', () => {
    const payloads = buildEmailPayloads(messages, roster);
    expect(payloads).toHaveLength(2); // Marcus + Sarah; Jake has no email; Nobody unmatched
    expect(payloads.map((p) => p.playerName)).toContain('Marcus Johnson');
    expect(payloads.map((p) => p.playerName)).toContain('Sarah Williams');
  });

  it('uses roster player name (not AI-generated name)', () => {
    const payloads = buildEmailPayloads(messages, roster);
    const marcus = payloads.find((p) => p.playerName === 'Marcus Johnson');
    expect(marcus?.to).toBe('linda@example.com');
    expect(marcus?.message).toBe('Great effort!');
    expect(marcus?.highlight).toBe('Fast break');
    expect(marcus?.nextFocus).toBe('Free throws');
  });

  it('preserves parentName', () => {
    const payloads = buildEmailPayloads(messages, roster);
    const marcus = payloads.find((p) => p.playerName === 'Marcus Johnson');
    expect(marcus?.parentName).toBe('Linda');
  });

  it('deduplicates when two messages match the same email address', () => {
    const dupe: MessageEntry[] = [
      { player_name: 'Marcus', message: 'A', highlight: 'B', next_focus: 'C' },
      { player_name: 'Marcus Johnson', message: 'D', highlight: 'E', next_focus: 'F' },
    ];
    const payloads = buildEmailPayloads(dupe, roster);
    expect(payloads).toHaveLength(1);
  });

  it('returns empty array when no players have emails', () => {
    const noEmail = roster.map((p) => ({ ...p, parent_email: null }));
    const payloads = buildEmailPayloads(messages, noEmail);
    expect(payloads).toHaveLength(0);
  });

  it('returns empty array when messages list is empty', () => {
    expect(buildEmailPayloads([], roster)).toHaveLength(0);
  });
});

// ─── countMatchedEmails ───────────────────────────────────────────────────────

describe('countMatchedEmails', () => {
  it('counts messages that can be emailed', () => {
    const messages: MessageEntry[] = [
      { player_name: 'Marcus', message: '', highlight: '', next_focus: '' },
      { player_name: 'Sarah', message: '', highlight: '', next_focus: '' },
      { player_name: 'Jake', message: '', highlight: '', next_focus: '' },
    ];
    expect(countMatchedEmails(messages, roster)).toBe(2);
  });
});

// ─── buildParentEmailSubject ──────────────────────────────────────────────────

describe('buildParentEmailSubject', () => {
  it('uses first name of player', () => {
    expect(buildParentEmailSubject('Marcus Johnson', 'YMCA Rockets')).toBe(
      'Update on Marcus from YMCA Rockets',
    );
  });

  it('handles single-word player name', () => {
    expect(buildParentEmailSubject('Marcus', 'Team A')).toBe('Update on Marcus from Team A');
  });
});

// ─── buildParentEmailHtml ─────────────────────────────────────────────────────

describe('buildParentEmailHtml', () => {
  const baseOpts = {
    parentName: 'Linda',
    playerName: 'Marcus Johnson',
    coachName: 'Coach Smith',
    teamName: 'YMCA Rockets',
    message: 'Marcus showed great effort today.',
    highlight: 'Excellent defensive positioning.',
    nextFocus: 'Work on free throws.',
    sessionLabel: "Tuesday's Practice",
  };

  it('returns a string containing DOCTYPE', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('<!DOCTYPE html>');
  });

  it('includes parent greeting', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('Hi Linda,');
  });

  it('falls back to "Hi there," when no parent name', () => {
    const html = buildParentEmailHtml({ ...baseOpts, parentName: null });
    expect(html).toContain('Hi there,');
  });

  it('includes the message text', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('Marcus showed great effort today.');
  });

  it('includes the highlight', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('Excellent defensive positioning.');
  });

  it('includes the next focus', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('Work on free throws.');
  });

  it('includes session label when provided', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain("Tuesday&#39;s Practice");
  });

  it('omits session label line when not provided', () => {
    const html = buildParentEmailHtml({ ...baseOpts, sessionLabel: undefined });
    expect(html).not.toContain('Tuesday');
  });

  it('includes team name in header', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('YMCA Rockets');
  });

  it('includes coach sign-off', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('Coach Smith');
  });

  it('uses first name of player in next-focus section', () => {
    const html = buildParentEmailHtml(baseOpts);
    expect(html).toContain('Next Focus for Marcus');
  });

  it('escapes special characters in user content', () => {
    const html = buildParentEmailHtml({ ...baseOpts, message: '<script>alert("xss")</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than', () => {
    expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe("it&#39;s");
  });

  it('leaves normal text unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });
});
