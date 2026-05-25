/**
 * Ticket 0029 — buildObserverConversionMessage is the pure copy helper behind
 * the observer page's conversion footer, so the footer wording (which names the
 * helper's saved-count + the host coach's first name) is unit-testable without
 * rendering the client page.
 *
 * COPPA: the message carries ONLY the helper's own saved-count and the host
 * coach FIRST name — never a player name, jersey, or observation text.
 */
import { describe, it, expect } from 'vitest';
import { buildObserverConversionMessage } from '@/lib/observer-utils';

describe('buildObserverConversionMessage', () => {
  it('names the saved count and the coach first name (singular)', () => {
    const msg = buildObserverConversionMessage({ savedCount: 1, coachFirstName: 'Maria' });
    expect(msg).toContain('1 observation');
    expect(msg).toContain('Maria');
  });

  it('pluralizes the count for 2+', () => {
    const msg = buildObserverConversionMessage({ savedCount: 7, coachFirstName: 'Maria' });
    expect(msg).toContain('7 observations');
    expect(msg).toContain('Maria');
  });

  it('falls back gracefully when the coach first name is empty', () => {
    const msg = buildObserverConversionMessage({ savedCount: 3, coachFirstName: '' });
    expect(msg).toContain('3 observations');
    // No dangling "for " when there is no coach name to attribute to.
    expect(msg).not.toMatch(/for\s*$/);
  });

  it('uses no banned marketing words', () => {
    const msg = buildObserverConversionMessage({ savedCount: 5, coachFirstName: 'Maria' });
    const banned = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];
    for (const w of banned) expect(msg.toLowerCase()).not.toContain(w);
  });
});
