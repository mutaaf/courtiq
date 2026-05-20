import { describe, it, expect } from 'vitest';
import { buildParentShareMessage, getFirstName } from '@/lib/parent-share-utils';

describe('getFirstName', () => {
  it('returns first word of a full name', () => {
    expect(getFirstName('Marcus Johnson')).toBe('Marcus');
  });

  it('returns the whole string when there is no space', () => {
    expect(getFirstName('Marcus')).toBe('Marcus');
  });

  it('falls back to the original string when split yields empty string', () => {
    expect(getFirstName('')).toBe('');
  });
});

describe('buildParentShareMessage', () => {
  const shareUrl = 'https://sportsiq.app/share/abc123';

  it('includes coach + team when both are provided', () => {
    const msg = buildParentShareMessage({
      playerName: 'Marcus Johnson',
      teamName: 'YMCA Rockets',
      coachName: 'Sarah Williams',
      shareUrl,
    });
    expect(msg).toContain("Marcus's progress report is in!");
    expect(msg).toContain('Coach Sarah from YMCA Rockets just sent an update.');
    expect(msg).toContain(`See how Marcus is doing: ${shareUrl}`);
  });

  it('includes only team when coachName is null', () => {
    const msg = buildParentShareMessage({
      playerName: 'Marcus Johnson',
      teamName: 'YMCA Rockets',
      coachName: null,
      shareUrl,
    });
    expect(msg).toContain('YMCA Rockets sent a coaching update.');
    expect(msg).not.toContain('Coach');
  });

  it('omits team/coach line when both are null', () => {
    const msg = buildParentShareMessage({
      playerName: 'Marcus Johnson',
      teamName: null,
      coachName: null,
      shareUrl,
    });
    expect(msg).toContain("Marcus's progress report is in!");
    expect(msg).toContain(`See how Marcus is doing: ${shareUrl}`);
    expect(msg).not.toContain('Coach');
    expect(msg).not.toContain('sent a coaching update');
  });

  it('uses first name only from a full player name', () => {
    const msg = buildParentShareMessage({
      playerName: 'Marcus Johnson',
      teamName: null,
      coachName: null,
      shareUrl,
    });
    expect(msg).toContain("Marcus's progress");
    expect(msg).not.toContain('Johnson');
  });

  it('uses full name as first name when no space present', () => {
    const msg = buildParentShareMessage({
      playerName: 'Zara',
      teamName: null,
      coachName: null,
      shareUrl,
    });
    expect(msg).toContain("Zara's progress report is in!");
  });

  it('uses first name of coach only', () => {
    const msg = buildParentShareMessage({
      playerName: 'Marcus',
      teamName: 'Rockets',
      coachName: 'Sarah Williams',
      shareUrl,
    });
    expect(msg).toContain('Coach Sarah from Rockets');
    expect(msg).not.toContain('Williams');
  });
});
