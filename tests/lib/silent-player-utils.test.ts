/**
 * Ticket 0062 — pure utilities for the mid-week silent-player nudge cron.
 *
 * Two surfaces tested:
 *   (1) `selectSilentPlayer(team, observations, today)` — picks the SINGLE
 *       player on a team whose gap since their last observation (or, for a
 *       zero-observation player, since they were added) is the LONGEST and
 *       is at least 8 days. Returns null when no player qualifies.
 *   (2) `buildSilentPlayerNudgeEmail({ playerFirstName, gapDays, teamName,
 *       lastObservationText, lastObservationDate, deepLinkUrl, referralCode,
 *       unsubscribeUrl })` — { subject, html, text } shell, no AGENTS.md
 *       banned word in any output, alternate second line when there is no
 *       prior observation.
 *
 * `.test.ts` per LESSONS#0020 / #0038. Voice contract per LESSONS#0023:
 * the scan is over the literal banned-token list, never reflected back in
 * the template body.
 */
import { describe, it, expect } from 'vitest';
import {
  selectSilentPlayer,
  buildSilentPlayerNudgeEmail,
  type SilentPlayerCandidate,
  type SilentPlayerObservation,
} from '@/lib/silent-player-utils';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

// A fixed "today" so daysSince math is deterministic regardless of CI clock.
const TODAY = new Date('2026-06-01T19:00:00Z');

function daysAgoIso(n: number): string {
  const d = new Date(TODAY.getTime() - n * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

function player(
  id: string,
  createdDaysAgo: number,
): SilentPlayerCandidate {
  return {
    id,
    name: `${id} Walker`,
    created_at: daysAgoIso(createdDaysAgo),
  };
}

function obs(
  playerId: string,
  daysAgo: number,
  text: string = `note about ${playerId}`,
): SilentPlayerObservation {
  return {
    player_id: playerId,
    text,
    created_at: daysAgoIso(daysAgo),
  };
}

describe('selectSilentPlayer', () => {
  it('picks the longest-silent player (single team, gaps [11d, 5d, 12d])', () => {
    const candidates = [player('p1', 90), player('p2', 90), player('p3', 90)];
    const observations = [
      obs('p1', 11),
      obs('p2', 5),
      obs('p3', 12),
      obs('p2', 2), // not the latest for p2 — but p2's max gap is 5d
    ];
    const result = selectSilentPlayer(candidates, observations, TODAY);
    expect(result).not.toBeNull();
    expect(result!.playerId).toBe('p3');
    expect(result!.gapDays).toBe(12);
    expect(result!.lastObservationText).toBe('note about p3');
  });

  it('returns null when the longest gap is < 8 days', () => {
    const candidates = [player('p1', 90), player('p2', 90)];
    const observations = [obs('p1', 5), obs('p2', 3)];
    const result = selectSilentPlayer(candidates, observations, TODAY);
    expect(result).toBeNull();
  });

  it('zero-observation player counts as gap = days since created_at; qualifies if >= 8', () => {
    const candidates = [player('p1', 10)]; // added 10 days ago, never observed
    const result = selectSilentPlayer(candidates, [], TODAY);
    expect(result).not.toBeNull();
    expect(result!.playerId).toBe('p1');
    expect(result!.gapDays).toBe(10);
    expect(result!.lastObservationText).toBeNull();
    expect(result!.lastObservationDate).toBeNull();
  });

  it('zero-observation player with created_at < 8 days does NOT qualify', () => {
    const candidates = [player('p1', 5)];
    const result = selectSilentPlayer(candidates, [], TODAY);
    expect(result).toBeNull();
  });

  it('ignores observations for players not on the team list', () => {
    const candidates = [player('p1', 90)];
    const observations = [
      obs('p1', 9),
      obs('ghost', 1), // not on this team — must not pollute
    ];
    const result = selectSilentPlayer(candidates, observations, TODAY);
    expect(result).not.toBeNull();
    expect(result!.playerId).toBe('p1');
    expect(result!.gapDays).toBe(9);
  });

  it('ties broken deterministically by the longest gap; equal gaps tie-break by id ascending', () => {
    const candidates = [player('p1', 90), player('p2', 90)];
    const observations = [obs('p1', 10), obs('p2', 10)];
    const result = selectSilentPlayer(candidates, observations, TODAY);
    expect(result).not.toBeNull();
    // gapDays equal — order by id ascending. p1 < p2.
    expect(result!.playerId).toBe('p1');
  });

  it('returns the most recent prior observation TEXT for the picked player (not an older one)', () => {
    const candidates = [player('p1', 90)];
    const observations = [
      obs('p1', 30, 'old note'),
      obs('p1', 9, 'recent note'),
    ];
    const result = selectSilentPlayer(candidates, observations, TODAY);
    expect(result).not.toBeNull();
    expect(result!.gapDays).toBe(9);
    expect(result!.lastObservationText).toBe('recent note');
  });
});

describe('buildSilentPlayerNudgeEmail', () => {
  function build(overrides: Partial<Parameters<typeof buildSilentPlayerNudgeEmail>[0]> = {}) {
    return buildSilentPlayerNudgeEmail({
      playerFirstName: 'Maya',
      gapDays: 8,
      teamName: 'Hawks',
      lastObservationText: 'hesitated on closeouts',
      lastObservationDate: '2026-05-23T14:00:00Z',
      deepLinkUrl: 'https://example.test/capture?playerId=p1&via=silent-player-nudge',
      referralCode: 'ABCDEF',
      unsubscribeUrl: 'https://example.test/settings/profile',
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

  it('the subject names the player first name and the gap (gapDays=8)', () => {
    const out = build({ gapDays: 8 });
    expect(out.subject).toBe("You haven't said anything about Maya in 8 days.");
  });

  it('the subject reflects a larger gap (gapDays=20)', () => {
    const out = build({ gapDays: 20 });
    expect(out.subject).toBe("You haven't said anything about Maya in 20 days.");
  });

  it('html contains the player-and-team header, the prior observation, the CTA, and the footer with referral code', () => {
    const out = build();
    expect(out.html).toContain('Maya');
    expect(out.html).toContain('Hawks');
    expect(out.html).toContain('hesitated on closeouts');
    expect(out.html).toContain('Capture about Maya');
    expect(out.html).toContain('ABCDEF');
    expect(out.html).toContain('https://example.test/settings/profile');
  });

  it('the CTA href deep-links to the provided URL (carrying playerId + via param)', () => {
    const out = build();
    expect(out.html).toContain(
      'href="https://example.test/capture?playerId=p1&via=silent-player-nudge"',
    );
  });

  it('truncates a long prior observation text to 120 chars with an ellipsis', () => {
    const long = 'a'.repeat(200);
    const out = build({ lastObservationText: long });
    // The truncated segment appears with an ellipsis.
    expect(out.html).toContain(`${'a'.repeat(120)}…`);
    expect(out.html).not.toContain('a'.repeat(121));
  });

  it('renders the alternate second line when there is NO prior observation', () => {
    const out = build({ lastObservationText: null, lastObservationDate: null });
    // The alternate line names the player and the same nudge phrasing.
    expect(out.html).toContain('First note about Maya');
    // The "Last note about" header is absent on the no-history path.
    expect(out.html).not.toContain('Last note about');
    // No hollow placeholder.
    expect(out.html).not.toContain('(no prior observation)');
  });

  it('CTA, subject, body, alternate-second-line all skip every AGENTS.md banned hype word', () => {
    const fixtures = [
      build({ gapDays: 8 }),
      build({ gapDays: 20 }),
      build({ lastObservationText: null, lastObservationDate: null }),
    ];
    for (const out of fixtures) {
      const lowerSubject = out.subject.toLowerCase();
      const lowerHtml = out.html.toLowerCase();
      const lowerText = out.text.toLowerCase();
      for (const banned of BANNED) {
        expect(lowerSubject).not.toContain(banned);
        expect(lowerHtml).not.toContain(banned);
        expect(lowerText).not.toContain(banned);
      }
    }
  });

  it('plain-text fallback contains the CTA URL and the player first name', () => {
    const out = build();
    expect(out.text).toContain('Maya');
    expect(out.text).toContain('https://example.test/capture?playerId=p1&via=silent-player-nudge');
  });
});
