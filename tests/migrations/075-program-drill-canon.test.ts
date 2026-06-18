/**
 * Ticket 0090 — migration 075_program_drill_canon.sql.
 *
 * Asserts the structural shape of the new program drill canon table:
 *  - the file uses the next free numeric prefix at pickup (075;
 *    074_paid_receipts_dedup_kind is the latest seen);
 *  - column allow-list (no widening on a sacred table);
 *  - foreign keys: org_id -> organizations(id) ON DELETE CASCADE;
 *    published_by_coach_id -> coaches(id) ON DELETE SET NULL;
 *  - drill_ids JSONB shape;
 *  - the regular composite index (org_id, superseded_at) for the
 *    "most recent active canon for this org" lookup — NO partial
 *    WHERE NOW() predicate (LESSONS#0087);
 *  - service-role GRANT block present (LESSONS#0094);
 *  - the coach_first_signal_celebrations CHECK enum widen for
 *    'program_canon_inherited' (LESSONS#0009 / #0054);
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
const MIGRATION_PATH = join(MIGRATIONS_DIR, '075_program_drill_canon.sql');
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip `--` comment lines.
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0114-style — strip structural identifiers before the banned-
// sweep so identifiers that legitimately reference "coach" / "canon" /
// "program" do not collide with a future banned set.
const ddlForBannedSweep = ddlWithComments
  .replace(/program_drill_canon/g, '')
  .replace(/coach_first_signal_celebrations/g, '')
  .replace(/published_by_coach_id/g, '')
  .replace(/drill_ids/g, '');

describe('migration 075_program_drill_canon.sql (ticket 0090)', () => {
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

  it('creates the program_drill_canon table with the allow-listed columns only', () => {
    expect(ddlWithComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+program_drill_canon/i,
    );
    const allowList = [
      /id\s+uuid/i,
      /org_id\s+uuid/i,
      /published_by_coach_id\s+uuid/i,
      /drill_ids\s+jsonb/i,
      /published_at\s+timestamptz/i,
      /superseded_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithComments).toMatch(re);
    }
  });

  it('references organizations with ON DELETE CASCADE on org_id', () => {
    expect(ddlWithComments).toMatch(
      /org_id\s+uuid[^,]*references\s+organizations\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references coaches with ON DELETE SET NULL on published_by_coach_id', () => {
    expect(ddlWithComments).toMatch(
      /published_by_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/i,
    );
  });

  it('adds the (org_id, superseded_at) composite index for the active-canon lookup', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+program_drill_canon\s*\(\s*org_id\s*,\s*superseded_at\s*\)/i,
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

  it('widens the coach_first_signal_celebrations CHECK enum to include program_canon_inherited', () => {
    // DROP + ADD pattern (LESSONS#0009 / #0054).
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+coach_first_signal_celebrations[\s\S]*drop\s+constraint\s+if\s+exists\s+coach_first_signal_celebrations_kind_check/i,
    );
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+coach_first_signal_celebrations[\s\S]*add\s+constraint\s+coach_first_signal_celebrations_kind_check[\s\S]*check\s*\(\s*kind\s+in\s*\(/i,
    );
    // Preserves all 6 prior values + adds the new one.
    for (const kind of [
      'clone',
      'thank',
      'parent_forward',
      'parent_forward_cross_team',
      'reaction_cross_team',
      'paid_receipts_d60',
      'program_canon_inherited',
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
      'player_id',
      'session_id',
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
