/**
 * Ticket 0091 — migration 076_organizations_opt_out_sport_pulse.sql.
 *
 * Asserts the structural shape of the additive opt-out switch on
 * `organizations` and the widened CHECK enum on
 * `coach_first_signal_celebrations`:
 *  - file uses the next free numeric prefix at pickup (076; 075 is
 *    program_drill_canon, ticket 0090);
 *  - ALTER TABLE organizations adds opted_out_of_sport_pulse BOOLEAN
 *    NOT NULL DEFAULT FALSE — exactly one new column;
 *  - the column is NOT a partial index with a NOW() predicate
 *    (LESSONS#0087);
 *  - service-role GRANT block present (LESSONS#0094);
 *  - the coach_first_signal_celebrations CHECK enum widen via DROP +
 *    ADD includes `'sport_pulse_named'` AND preserves every prior
 *    kind (LESSONS#0009 / #0054);
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
  '076_organizations_opt_out_sport_pulse.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip `--` comment lines.
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0067-style — strip structural identifiers before the banned-
// sweep so identifiers that legitimately reference "coach" / "program"
// do not collide with the structural-allow set.
const ddlForBannedSweep = ddlWithComments
  .replace(/coach_first_signal_celebrations/g, '')
  .replace(/opted_out_of_sport_pulse/g, '')
  .replace(/program_canon_inherited/g, '')
  .replace(/sport_pulse_named/g, '')
  .replace(/parent_forward/g, '')
  .replace(/parent_forward_cross_team/g, '');

describe('migration 076_organizations_opt_out_sport_pulse.sql (ticket 0091)', () => {
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

  it('adds opted_out_of_sport_pulse BOOLEAN NOT NULL DEFAULT FALSE on organizations', () => {
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+organizations\s+add\s+column\s+if\s+not\s+exists\s+opted_out_of_sport_pulse\s+boolean\s+not\s+null\s+default\s+false/i,
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

  it('widens the coach_first_signal_celebrations CHECK enum to include sport_pulse_named (LESSONS#0009/#0054)', () => {
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+coach_first_signal_celebrations[\s\S]*drop\s+constraint\s+if\s+exists\s+coach_first_signal_celebrations_kind_check/i,
    );
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+coach_first_signal_celebrations[\s\S]*add\s+constraint\s+coach_first_signal_celebrations_kind_check[\s\S]*check\s*\(\s*kind\s+in\s*\(/i,
    );
    // Preserves all 7 prior values + adds the new one.
    for (const kind of [
      'clone',
      'thank',
      'parent_forward',
      'parent_forward_cross_team',
      'reaction_cross_team',
      'paid_receipts_d60',
      'program_canon_inherited',
      'sport_pulse_named',
    ]) {
      expect(ddlWithComments).toMatch(new RegExp(`'${kind}'`));
    }
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
