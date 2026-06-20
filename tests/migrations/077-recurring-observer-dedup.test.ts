/**
 * Ticket 0092 — migration 077_recurring_observer_dedup.sql.
 *
 * Asserts the structural shape of the new per-(coach, helper, team)
 * dedup table for the /home real-co-coach card's "Not yet" button:
 *  - file uses the next free numeric prefix at pickup (077; 076 is
 *    organizations_opt_out_sport_pulse, ticket 0091);
 *  - CREATE TABLE recurring_observer_dismissals carries the four
 *    structural columns (id, coach_id, helper_identifier, team_id)
 *    plus dismissed_at with a UNIQUE composite key;
 *  - foreign keys ON DELETE CASCADE to coaches + teams (so a
 *    deleted coach / team doesn't leave orphan dedup rows);
 *  - service-role GRANT block present (LESSONS#0094);
 *  - no partial index with a NOW() predicate (LESSONS#0087);
 *  - no banned-token / minor-data field anywhere in the migration
 *    (COPPA);
 *  - never adds a column to a sacred table (coaches / players /
 *    teams / observations / plans).
 *
 * LESSONS#0034 / #0088 — strip `--` comment lines before the banned-
 * token scan since the header documents what the migration
 * deliberately does NOT carry.
 *
 * .test.ts NOT .spec.ts (LESSONS#0038).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const MIGRATION_PATH = join(
  MIGRATIONS_DIR,
  '077_recurring_observer_dedup.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip `--` comment lines.
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0067-style — strip structural identifiers before the banned-
// sweep so the table name (which legitimately references "observer")
// does not collide with the structural-allow set.
const ddlForBannedSweep = ddlWithComments
  .replace(/recurring_observer_dismissals/g, '')
  .replace(/helper_identifier/g, '')
  .replace(/idx_recurring_observer_dismissals_coach/g, '');

describe('migration 077_recurring_observer_dedup.sql (ticket 0092)', () => {
  it('uses a unique numeric prefix (no two migrations share a leading version token)', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const prefixes = files
      .map((f) => f.match(/^(\d+)_/)?.[1])
      .filter((p): p is string => Boolean(p));
    const counts = new Map<string, number>();
    for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1);
    expect(dupes).toEqual([]);
  });

  it('creates the recurring_observer_dismissals table with the four required columns', () => {
    expect(ddlWithComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+recurring_observer_dismissals/i,
    );
    expect(ddlWithComments).toMatch(/coach_id\s+uuid\s+not\s+null/i);
    expect(ddlWithComments).toMatch(/helper_identifier\s+text\s+not\s+null/i);
    expect(ddlWithComments).toMatch(/team_id\s+uuid\s+not\s+null/i);
    expect(ddlWithComments).toMatch(
      /dismissed_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i,
    );
  });

  it('enforces UNIQUE (coach_id, helper_identifier, team_id)', () => {
    expect(ddlWithComments).toMatch(
      /unique\s*\(\s*coach_id\s*,\s*helper_identifier\s*,\s*team_id\s*\)/i,
    );
  });

  it('cascades FK deletes from coaches and teams', () => {
    expect(ddlWithComments).toMatch(
      /coach_id[\s\S]*references\s+coaches\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(ddlWithComments).toMatch(
      /team_id[\s\S]*references\s+teams\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('does NOT use a partial index with a NOW() predicate (LESSONS#0087)', () => {
    const createIndexBlocks = ddlWithComments.match(/create\s+index[^;]+;/gi) ?? [];
    for (const block of createIndexBlocks) {
      const lower = block.toLowerCase();
      expect(/\bwhere\b[\s\S]*\bnow\s*\(\s*\)/i.test(lower)).toBe(false);
      expect(/\bwhere\b[\s\S]*\bcurrent_date\b/i.test(lower)).toBe(false);
      expect(/\bwhere\b[\s\S]*\bcurrent_timestamp\b/i.test(lower)).toBe(false);
    }
  });

  it('includes a service-role GRANT block (LESSONS#0094)', () => {
    expect(ddlWithComments).toMatch(/grant[^;]+to\s+service_role/i);
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans'];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithComments).not.toMatch(re);
    }
  });

  it('does not introduce any per-minor field anywhere in the migration (COPPA)', () => {
    const banned = [
      'date_of_birth',
      'medical_notes',
      'parent_phone',
      'parent_name',
      'parent_email',
      'jersey_number',
      'photo_url',
      'nickname',
      'player_id',
      'session_id',
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
