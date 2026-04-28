import { describe, it, expect } from 'vitest';
import {
  getWeekStartSunday,
  isParentDigestEnabled,
  hasAlreadySentParentDigest,
  markParentDigestSent,
  enableParentDigest,
  disableParentDigest,
  hasEnoughDataForParentDigest,
  getRecentObsHighlight,
  buildShareUrl,
  buildParentDigestSubject,
  buildParentDigestHtml,
} from '../src/lib/parent-digest-utils';

// ── getWeekStartSunday ─────────────────────────────────────────────────────────

describe('getWeekStartSunday', () => {
  it('returns the same day for a Sunday', () => {
    const sunday = new Date('2024-04-28T12:00:00Z'); // Sunday
    expect(getWeekStartSunday(sunday)).toBe('2024-04-28');
  });

  it('returns the previous Sunday for a Monday', () => {
    const monday = new Date('2024-04-29T12:00:00Z'); // Monday
    expect(getWeekStartSunday(monday)).toBe('2024-04-28');
  });

  it('returns the previous Sunday for a Saturday', () => {
    const saturday = new Date('2024-05-04T12:00:00Z'); // Saturday
    expect(getWeekStartSunday(saturday)).toBe('2024-04-28');
  });

  it('returns the previous Sunday for a Wednesday', () => {
    const wednesday = new Date('2024-05-01T12:00:00Z'); // Wednesday
    expect(getWeekStartSunday(wednesday)).toBe('2024-04-28');
  });

  it('handles year boundaries', () => {
    const jan1 = new Date('2025-01-01T12:00:00Z'); // Wednesday
    expect(getWeekStartSunday(jan1)).toBe('2024-12-29');
  });
});

// ── isParentDigestEnabled ─────────────────────────────────────────────────────

describe('isParentDigestEnabled', () => {
  it('returns false for null prefs', () => {
    expect(isParentDigestEnabled(null)).toBe(false);
  });

  it('returns false for empty prefs', () => {
    expect(isParentDigestEnabled({})).toBe(false);
  });

  it('returns false when explicitly disabled', () => {
    expect(isParentDigestEnabled({ auto_parent_digest: { enabled: false } })).toBe(false);
  });

  it('returns true when enabled', () => {
    expect(isParentDigestEnabled({ auto_parent_digest: { enabled: true } })).toBe(true);
  });

  it('returns false when auto_parent_digest key is missing', () => {
    expect(isParentDigestEnabled({ disable_weekly_digest: true })).toBe(false);
  });
});

// ── hasAlreadySentParentDigest ────────────────────────────────────────────────

describe('hasAlreadySentParentDigest', () => {
  it('returns false when prefs is null', () => {
    expect(hasAlreadySentParentDigest(null, '2024-04-28')).toBe(false);
  });

  it('returns false when no entry for this week', () => {
    expect(hasAlreadySentParentDigest({}, '2024-04-28')).toBe(false);
  });

  it('returns true when entry exists for this week', () => {
    const prefs = { parent_digest_week_2024_04_28: true } as any;
    // Note: the key uses dashes in the date string
    expect(hasAlreadySentParentDigest({ 'parent_digest_week_2024-04-28': true }, '2024-04-28')).toBe(true);
  });

  it('returns false for a different week', () => {
    const prefs = { 'parent_digest_week_2024-04-21': true };
    expect(hasAlreadySentParentDigest(prefs, '2024-04-28')).toBe(false);
  });
});

// ── markParentDigestSent ──────────────────────────────────────────────────────

describe('markParentDigestSent', () => {
  it('adds the week key to empty prefs', () => {
    const result = markParentDigestSent({}, '2024-04-28');
    expect((result as any)['parent_digest_week_2024-04-28']).toBe(true);
  });

  it('preserves other preference keys', () => {
    const prefs = { auto_parent_digest: { enabled: true }, disable_weekly_digest: true };
    const result = markParentDigestSent(prefs, '2024-04-28') as any;
    expect(result.auto_parent_digest).toEqual({ enabled: true });
    expect(result.disable_weekly_digest).toBe(true);
    expect(result['parent_digest_week_2024-04-28']).toBe(true);
  });

  it('handles null prefs gracefully', () => {
    const result = markParentDigestSent(null, '2024-04-28') as any;
    expect(result['parent_digest_week_2024-04-28']).toBe(true);
  });
});

// ── enableParentDigest / disableParentDigest ──────────────────────────────────

describe('enableParentDigest', () => {
  it('sets auto_parent_digest.enabled to true', () => {
    const result = enableParentDigest({}) as any;
    expect(result.auto_parent_digest.enabled).toBe(true);
  });

  it('preserves other preference keys', () => {
    const prefs = { some_key: 'value' };
    const result = enableParentDigest(prefs) as any;
    expect(result.some_key).toBe('value');
    expect(result.auto_parent_digest.enabled).toBe(true);
  });

  it('handles null prefs', () => {
    const result = enableParentDigest(null) as any;
    expect(result.auto_parent_digest.enabled).toBe(true);
  });
});

describe('disableParentDigest', () => {
  it('removes auto_parent_digest key', () => {
    const prefs = { auto_parent_digest: { enabled: true }, other: 'x' };
    const result = disableParentDigest(prefs) as any;
    expect(result.auto_parent_digest).toBeUndefined();
  });

  it('preserves other preference keys', () => {
    const prefs = { auto_parent_digest: { enabled: true }, other_pref: 123 };
    const result = disableParentDigest(prefs) as any;
    expect(result.other_pref).toBe(123);
  });

  it('handles already-disabled gracefully', () => {
    const result = disableParentDigest({}) as any;
    expect(result.auto_parent_digest).toBeUndefined();
  });
});

// ── hasEnoughDataForParentDigest ──────────────────────────────────────────────

describe('hasEnoughDataForParentDigest', () => {
  it('returns false for 0 observations', () => {
    expect(hasEnoughDataForParentDigest(0)).toBe(false);
  });

  it('returns false for 2 observations', () => {
    expect(hasEnoughDataForParentDigest(2)).toBe(false);
  });

  it('returns true for exactly 3 observations', () => {
    expect(hasEnoughDataForParentDigest(3)).toBe(true);
  });

  it('returns true for many observations', () => {
    expect(hasEnoughDataForParentDigest(50)).toBe(true);
  });
});

// ── getRecentObsHighlight ─────────────────────────────────────────────────────

describe('getRecentObsHighlight', () => {
  it('returns null when observations array is empty', () => {
    expect(getRecentObsHighlight([])).toBeNull();
  });

  it('returns null when no positive observations', () => {
    const obs = [
      { sentiment: 'negative', text: 'Needs work on defense', created_at: '2024-04-28T10:00:00Z' },
      { sentiment: 'neutral', text: 'OK effort today', created_at: '2024-04-28T11:00:00Z' },
    ];
    expect(getRecentObsHighlight(obs)).toBeNull();
  });

  it('returns text of most recent positive observation', () => {
    const obs = [
      { sentiment: 'positive', text: 'Great passing', created_at: '2024-04-27T10:00:00Z' },
      { sentiment: 'positive', text: 'Outstanding defense today', created_at: '2024-04-28T10:00:00Z' },
    ];
    expect(getRecentObsHighlight(obs)).toBe('Outstanding defense today');
  });

  it('truncates text over 120 characters with ellipsis', () => {
    const longText = 'A'.repeat(130);
    const obs = [{ sentiment: 'positive', text: longText, created_at: '2024-04-28T10:00:00Z' }];
    const result = getRecentObsHighlight(obs);
    expect(result).not.toBeNull();
    expect(result!.length).toBeLessThanOrEqual(120);
    expect(result!.endsWith('…')).toBe(true);
  });

  it('does not truncate text at exactly 120 characters', () => {
    const text = 'B'.repeat(120);
    const obs = [{ sentiment: 'positive', text, created_at: '2024-04-28T10:00:00Z' }];
    expect(getRecentObsHighlight(obs)).toBe(text);
  });

  it('ignores observations with empty text', () => {
    const obs = [
      { sentiment: 'positive', text: '', created_at: '2024-04-28T10:00:00Z' },
      { sentiment: 'positive', text: '   ', created_at: '2024-04-27T10:00:00Z' },
    ];
    expect(getRecentObsHighlight(obs)).toBeNull();
  });
});

// ── buildShareUrl ─────────────────────────────────────────────────────────────

describe('buildShareUrl', () => {
  it('builds correct URL', () => {
    expect(buildShareUrl('abc123', 'https://app.example.com')).toBe('https://app.example.com/share/abc123');
  });

  it('works with trailing slash in appUrl', () => {
    expect(buildShareUrl('tok', 'https://app.example.com/')).toBe('https://app.example.com//share/tok');
  });
});

// ── buildParentDigestSubject ──────────────────────────────────────────────────

describe('buildParentDigestSubject', () => {
  it('uses first name of player', () => {
    const subject = buildParentDigestSubject('Marcus Johnson', 'Jane Smith');
    expect(subject).toContain('Marcus');
    expect(subject).not.toContain('Johnson');
  });

  it('includes coach name', () => {
    const subject = buildParentDigestSubject('Alex', 'Mike Turner');
    expect(subject).toContain('Mike Turner');
  });

  it('includes progress/update wording', () => {
    const subject = buildParentDigestSubject('Sam', 'Coach');
    expect(subject.toLowerCase()).toContain('progress');
  });
});

// ── buildParentDigestHtml ─────────────────────────────────────────────────────

describe('buildParentDigestHtml', () => {
  const baseParams = {
    playerName: 'Marcus Johnson',
    parentName: 'Sarah Johnson',
    coachName: 'Mike Turner',
    teamName: 'YMCA Rockets U12',
    shareUrl: 'https://app.example.com/share/abc123',
    obsCount: 5,
    sessionCount: 2,
    highlight: null,
    appUrl: 'https://app.example.com',
  };

  it('includes player first name prominently', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html).toContain('Marcus');
  });

  it('includes coach name', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html).toContain('Mike Turner');
  });

  it('includes the share URL as a link', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html).toContain('href="https://app.example.com/share/abc123"');
  });

  it('includes team name', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html).toContain('YMCA Rockets U12');
  });

  it('greets parent by first name when parent name is provided', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html).toContain('Hi Sarah');
  });

  it('uses generic greeting when parent name is null', () => {
    const html = buildParentDigestHtml({ ...baseParams, parentName: null });
    expect(html).toContain('Hi there');
  });

  it('shows observation and session counts', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html).toContain('5');
    expect(html).toContain('2 session');
  });

  it('renders highlight block when highlight is provided', () => {
    const html = buildParentDigestHtml({ ...baseParams, highlight: 'Great defensive positioning!' });
    expect(html).toContain('Great defensive positioning!');
  });

  it('omits highlight block when highlight is null', () => {
    const html = buildParentDigestHtml({ ...baseParams, highlight: null });
    expect(html).not.toContain('border-left:3px solid #22c55e');
  });

  it('escapes HTML special characters in player name', () => {
    const html = buildParentDigestHtml({ ...baseParams, playerName: 'O\'Brien <Test>' });
    expect(html).not.toContain('<Test>');
  });

  it('escapes HTML in highlight text', () => {
    const html = buildParentDigestHtml({
      ...baseParams,
      highlight: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('returns valid HTML with DOCTYPE', () => {
    const html = buildParentDigestHtml(baseParams);
    expect(html.trim()).toMatch(/^<!DOCTYPE html>/i);
  });

  it('works when session count is 0', () => {
    const html = buildParentDigestHtml({ ...baseParams, sessionCount: 0 });
    expect(html).not.toContain('0 session');
    expect(html).toContain('5 coaching observation');
  });

  it('uses singular observation when count is 1', () => {
    const html = buildParentDigestHtml({ ...baseParams, obsCount: 1, sessionCount: 0 });
    expect(html).toContain('1 coaching observation</strong> this week.');
  });
});
