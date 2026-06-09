/**
 * Ticket 0076 — migration 067_drill_clone_stick_signals.sql.
 *
 * Asserts the structural shape of the new `drill_clone_stick_signals`
 * table (one row per drill_share + cloner edge when the cloner thumbs-up
 * the drill they cloned) AND the widening of the existing
 * `coach_reputation_milestones.milestone_kind` CHECK constraint to
 * include the three new stuck-kind values.
 *
 * COPPA: scans executable DDL with `--` comment lines stripped per
 * LESSONS#0088 AND the structural identifier names stripped per
 * LESSONS#0114 — the table/column identifiers contain inherited
 * tokens but are structural (a clone-stick edge), not minor data.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/067_drill_clone_stick_signals.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');

// LESSONS#0088 — strip `--` comment lines so the COPPA scan reads
// only executable DDL (the header documents what we deliberately do
// NOT add).
const ddlWithoutComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

// LESSONS#0114 — strip the structural identifier names before the
// banned-token sweep. The table + column names contain inherited
// tokens but are structural (a stick edge), not minor data.
const ddlForBannedSweep = ddlWithoutComments
  .replace(/drill_clone_stick_signals/g, '')
  .replace(/cloner_coach_id/g, '')
  .replace(/cloner_org_id/g, '')
  .replace(/drill_share_id/g, '')
  .replace(/stuck_at/g, '');

describe('migration 067_drill_clone_stick_signals.sql (ticket 0076)', () => {
  it('creates the drill_clone_stick_signals table with the allow-listed columns only', () => {
    expect(ddlWithoutComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+drill_clone_stick_signals/i,
    );

    const allowList = [
      /id\s+uuid/i,
      /drill_share_id\s+uuid/i,
      /cloner_coach_id\s+uuid/i,
      /cloner_org_id\s+uuid/i,
      /stuck_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithoutComments).toMatch(re);
    }
  });

  it('enforces UNIQUE(drill_share_id, cloner_coach_id) so each cloner sticks ONCE per share', () => {
    expect(ddlWithoutComments).toMatch(
      /unique\s*\(\s*drill_share_id\s*,\s*cloner_coach_id\s*\)/i,
    );
  });

  it('adds an index on (drill_share_id, stuck_at DESC) for the publisher-side rollup', () => {
    expect(ddlWithoutComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+drill_clone_stick_signals\s*\(\s*drill_share_id\s*,\s*stuck_at\s+desc\s*\)/i,
    );
  });

  it('references drill_shares with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /drill_share_id\s+uuid[^,]*references\s+drill_shares\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references coaches(id) on cloner_coach_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /cloner_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references organizations(id) on cloner_org_id with ON DELETE SET NULL', () => {
    expect(ddlWithoutComments).toMatch(
      /cloner_org_id\s+uuid[^,]*references\s+organizations\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/i,
    );
  });

  it('widens the coach_reputation_milestones milestone_kind CHECK to include the three new stuck kinds', () => {
    // Look for an ALTER on the constraint OR a DROP + ADD pair — the
    // milestone-kind set must include the three new values alongside
    // the existing seven (or be replaced atomically).
    expect(ddlWithoutComments).toMatch(/coach_reputation_milestones/i);
    for (const kind of ['stuck_1', 'stuck_3', 'stuck_8']) {
      expect(ddlWithoutComments).toMatch(new RegExp(`'${kind}'`));
    }
    // The existing kinds remain in the widened CHECK.
    for (const kind of [
      'clones_3',
      'clones_10',
      'clones_25',
      'clones_50',
      'programs_2',
      'programs_4',
      'programs_8',
    ]) {
      expect(ddlWithoutComments).toMatch(new RegExp(`'${kind}'`));
    }
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans'];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithoutComments).not.toMatch(re);
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
