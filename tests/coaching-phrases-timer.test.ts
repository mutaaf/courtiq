/**
 * Integration tests that mirror how timer/page.tsx constructs QueueItems and
 * calls getPhraseByIndex. Verifies that phrases are non-empty when the timer
 * uses a sport slug (not a UUID) and that structural items (warmup/scrimmage/
 * cooldown) and cue-less custom drills all resolve to a usable phrase.
 */
import { describe, it, expect } from 'vitest';
import { getPhraseByIndex } from '../src/lib/coaching-phrases';

// Represents the QueueItem shape in timer/page.tsx
interface QueueItem {
  id: string;
  name: string;
  durationSecs: number;
  cues: string[];
  category?: string;
  description: string;
}

const SLUG = 'basketball';
const UUID = '3f7a2c1d-0000-4000-a000-000000000001'; // a realistic sport_id UUID

describe('coaching-phrases timer integration', () => {
  it('returns a phrase for warmup item using slug', () => {
    const item: QueueItem = {
      id: 'warmup-1',
      name: 'Dynamic Warmup',
      durationSecs: 300,
      cues: [],
      category: 'warmup',
      description: '',
    };
    const phrase = getPhraseByIndex(item.category, SLUG, 0);
    expect(phrase).toBeTruthy();
    expect(phrase.length).toBeGreaterThan(0);
  });

  it('returns a phrase for scrimmage item using slug', () => {
    const item: QueueItem = {
      id: 'scrimmage-1',
      name: 'Scrimmage',
      durationSecs: 600,
      cues: [],
      category: 'scrimmage',
      description: '',
    };
    const phrase = getPhraseByIndex(item.category, SLUG, 0);
    expect(phrase).toBeTruthy();
  });

  it('returns a phrase for cooldown item using slug', () => {
    const item: QueueItem = {
      id: 'cooldown-1',
      name: 'Cool Down',
      durationSecs: 300,
      cues: [],
      category: 'cooldown',
      description: '',
    };
    const phrase = getPhraseByIndex(item.category, SLUG, 0);
    expect(phrase).toBeTruthy();
  });

  it('returns a phrase for custom drill (no category) using hustle fallback', () => {
    // Custom drills have no category — timer uses 'hustle' as fallback at call site
    const item: QueueItem = {
      id: 'custom-1',
      name: 'Freestyle Drill',
      durationSecs: 600,
      cues: [],
      description: '',
    };
    const fallbackCategory = item.category || 'hustle';
    const phrase = getPhraseByIndex(fallbackCategory, SLUG, 0);
    expect(phrase).toBeTruthy();
  });

  it('prefers explicit cue over fallback phrase', () => {
    const item: QueueItem = {
      id: 'drill-1',
      name: 'Layup Lines',
      durationSecs: 600,
      cues: ['Explode off the dribble!'],
      category: 'finishing',
      description: '',
    };
    // Timer: drill.cues[0] || getPhraseByIndex(...)
    const cue = item.cues[0] || getPhraseByIndex(item.category, SLUG, 0);
    expect(cue).toBe('Explode off the dribble!');
  });

  it('returns empty string when given a UUID sport_id instead of a slug', () => {
    // Demonstrates the Bug 2 regression: UUID → no sport-specific match,
    // but generic phrases still fire if category is valid
    const phrase = getPhraseByIndex('warmup', UUID, 0);
    // No sport-specific match; generic 'warmup' exists so still non-empty
    expect(phrase).toBeTruthy();
  });

  it('returns empty string when category is undefined and no hustle fallback', () => {
    // Before fix: undefined category → normaliseCategory('') → [] → ''
    const phrase = getPhraseByIndex(undefined, SLUG, 0);
    expect(phrase).toBe('');
  });

  it('cycles through multiple phrase indices without error', () => {
    for (let i = 0; i < 6; i++) {
      const phrase = getPhraseByIndex('hustle', SLUG, i);
      expect(typeof phrase).toBe('string');
    }
  });
});
