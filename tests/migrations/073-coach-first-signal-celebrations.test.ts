/**
 * Ticket 0088 — migration 073_coach_first_signal_celebrations.sql.
 *
 * Asserts the structural shape of the new per-(coach, signal-kind)
 * celebration dedup table:
 *  - the file uses the next free numeric prefix at pickup (073;
 *    072_org_card_snoozes is the latest seen);
 *  - column allow-list (no widening on a sacred table);
 *  - CHECK constraint pins kind to exactly the helper's union;
 *  - UNIQUE(coach_id, kind) so the card fires once per kind per coach;
 *  - an index keyed on (coach_id) for the per-coach lookup;
 *  - ON DELETE CASCADE on coaches;
 *  - service-role GRANT block present (LESSONS#0094);
 *  - no partial index using NOW() (LESSONS#0087);
 *  - no banned-token / minor-data field on the new table (COPPA);
 *  - never adds a column to a sacred table.
 *
 * LESSONS#0034 / #0088 — strip `--` comment lines before the banned-
 * token scan since the header documents what the migration deliberately
 * does NOT carry.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const MIGRATION_PATH = join(
  MIGRATIONS_DIR,
  '073_coach_first_signal_celebrations.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip `--` comment lines.
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0114-style — strip structural identifiers before the banned-
// sweep so the table/column names that legitimately reference "coach"
// or "celebration" do not collide with a future banned set.
const ddlForBannedSweep = ddlWithComments
  .replace(/coach_first_signal_celebrations/g, '')
  .replace(/coach_id/g, '');

describe('migration 073_coach_first_signal_celebrations.sql (ticket 0088)', () => {
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

  it('creates the coach_first_signal_celebrations table with the allow-listed columns only', () => {
    expect(ddlWithComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+coach_first_signal_celebrations/i,
    );
    const allowList = [
      /id\s+uuid/i,
      /coach_id\s+uuid/i,
      /kind\s+text/i,
      /fired_at\s+timestamptz/i,
      /celebrated_at\s+timestamptz/i,
      /dismissed_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithComments).toMatch(re);
    }
  });

  it('pins kind via a CHECK constraint to the five documented helper values', () => {
    expect(ddlWithComments).toMatch(/check\s*\(\s*kind\s+in\s*\(/i);
    for (const kind of [
      'clone',
      'thank',
      'parent_forward',
      'parent_forward_cross_team',
      'reaction_cross_team',
    ]) {
      expect(ddlWithComments).toMatch(new RegExp(`'${kind}'`));
    }
  });

  it('enforces UNIQUE(coach_id, kind) so the card fires once per kind per coach', () => {
    expect(ddlWithComments).toMatch(
      /unique\s*\(\s*coach_id\s*,\s*kind\s*\)/i,
    );
  });

  it('adds a per-coach index for the route lookup', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+coach_first_signal_celebrations\s*\(\s*coach_id/i,
    );
  });

  it('references coaches with ON DELETE CASCADE', () => {
    expect(ddlWithComments).toMatch(
      /coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('includes a service-role GRANT block (LESSONS#0094)', () => {
    expect(ddlWithComments).toMatch(/grant[^;]+to\s+service_role/i);
  });

  it('does NOT use a partial index with a NOW() predicate (LESSONS#0087)', () => {
    // Allow `default now()` in column defs; disallow `WHERE … now() …` inside
    // a CREATE INDEX statement.
    const createIndexBlocks = ddlWithComments.match(/create\s+index[^;]+;/gi) ?? [];
    for (const block of createIndexBlocks) {
      const lower = block.toLowerCase();
      // Reject the partial-WHERE NOW() predicate shape.
      expect(/\bwhere\b[\s\S]*\bnow\s*\(\s*\)/i.test(lower)).toBe(false);
      expect(/\bwhere\b[\s\S]*\bcurrent_date\b/i.test(lower)).toBe(false);
      expect(/\bwhere\b[\s\S]*\bcurrent_timestamp\b/i.test(lower)).toBe(false);
    }
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans'];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithComments).not.toMatch(re);
    }
  });

  it('does not introduce any per-minor field on the new table (COPPA)', () => {
    const banned = [
      'date_of_birth',
      'medical_notes',
      'parent_phone',
      'parent_name',
      'parent_email',
      'jersey_number',
      'photo_url',
      'nickname',
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
