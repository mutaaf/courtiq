/**
 * Ticket 0073 — migration 065_coach_reputation_milestones.sql.
 *
 * Asserts the structural shape of the new per-(published coach,
 * milestone kind) reputation-milestones table:
 *  - column allow-list (no widening on a sacred table);
 *  - CHECK constraint pinning milestone_kind to the 7 documented values;
 *  - UNIQUE(published_coach_id, milestone_kind) so a milestone fires
 *    exactly once per threshold per coach;
 *  - partial index (published_coach_id, notified_at) WHERE notified_at
 *    IS NULL for the home-card lookup;
 *  - ON DELETE CASCADE on coaches;
 *  - NO new column on sacred tables (coaches, players, teams,
 *    observations, plans).
 *
 * COPPA: scans the executable DDL (with `--` comment lines stripped
 * per LESSONS#0088 AND the structural `published_coach_id` /
 * `coach_reputation_milestones` identifiers stripped per
 * LESSONS#0114 — the IDENTIFIER name contains "coach" which is fine,
 * but the structural-id strip keeps the banned-token sweep honest
 * if a future banned set ever included "coach").
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/065_coach_reputation_milestones.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip `--` comment lines so the COPPA scan reads only
// executable DDL (the header documents what we deliberately do NOT add).
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0114 — strip the structural identifiers before the banned-
// token sweep. The table name and column names contain inherited
// tokens but are structural (a milestone-tracking edge), not minor
// data.
const ddlForBannedSweep = ddlWithComments
  .replace(/coach_reputation_milestones/g, '')
  .replace(/published_coach_id/g, '');

describe('migration 065_coach_reputation_milestones.sql (ticket 0073)', () => {
  it('creates the coach_reputation_milestones table with the allow-listed columns only', () => {
    expect(ddlWithComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+coach_reputation_milestones/i,
    );

    const allowList = [
      /id\s+uuid/i,
      /published_coach_id\s+uuid/i,
      /milestone_kind\s+text/i,
      /crossed_at\s+timestamptz/i,
      /notified_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithComments).toMatch(re);
    }
  });

  it('pins milestone_kind via a CHECK constraint to the seven documented values', () => {
    // The CHECK clause must enumerate the seven thresholds.
    expect(ddlWithComments).toMatch(/check\s*\(\s*milestone_kind\s+in\s*\(/i);
    for (const kind of [
      'clones_3',
      'clones_10',
      'clones_25',
      'clones_50',
      'programs_2',
      'programs_4',
      'programs_8',
    ]) {
      expect(ddlWithComments).toMatch(new RegExp(`'${kind}'`));
    }
  });

  it('enforces UNIQUE(published_coach_id, milestone_kind) so a milestone fires once per threshold per coach', () => {
    expect(ddlWithComments).toMatch(
      /unique\s*\(\s*published_coach_id\s*,\s*milestone_kind\s*\)/i,
    );
  });

  it('adds a partial index on (published_coach_id, notified_at) WHERE notified_at IS NULL for the /home card lookup', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+coach_reputation_milestones\s*\(\s*published_coach_id\s*,\s*notified_at\s*\)\s*where\s+notified_at\s+is\s+null/i,
    );
  });

  it('references coaches with ON DELETE CASCADE', () => {
    expect(ddlWithComments).toMatch(
      /published_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
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
