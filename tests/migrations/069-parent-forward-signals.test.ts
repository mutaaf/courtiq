/**
 * Ticket 0079 — migration 069_parent_forward_signals.sql.
 *
 * Asserts the structural shape of the new `parent_forward_signals`
 * table (one row per (sender_player, recipient_player) edge written
 * when a parent forwards this week's report to another parent on the
 * SAME team).
 *
 * COPPA: scans executable DDL with `--` comment lines stripped per
 * LESSONS#0088 AND the structural identifier names stripped per
 * LESSONS#0114 — the table/column identifiers contain inherited
 * tokens ("parent_forward", "sender_player_id", "recipient_player_id")
 * but are structural (a forwarding edge), not minor data.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/069_parent_forward_signals.sql',
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
// tokens but are structural (a forward edge), not minor data.
const ddlForBannedSweep = ddlWithoutComments
  .replace(/parent_forward_signals/g, '')
  .replace(/sender_player_id/g, '')
  .replace(/recipient_player_id/g, '')
  .replace(/team_id/g, '')
  .replace(/dispatched_at/g, '')
  .replace(/opened_at/g, '');

describe('migration 069_parent_forward_signals.sql (ticket 0079)', () => {
  it('creates the parent_forward_signals table with the allow-listed columns only', () => {
    expect(ddlWithoutComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+parent_forward_signals/i,
    );

    const allowList = [
      /id\s+uuid/i,
      /sender_player_id\s+uuid/i,
      /recipient_player_id\s+uuid/i,
      /team_id\s+uuid/i,
      /dispatched_at\s+timestamptz/i,
      /opened_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithoutComments).toMatch(re);
    }
  });

  it('enforces UNIQUE(sender_player_id, recipient_player_id) so a re-tap does not double-fire', () => {
    expect(ddlWithoutComments).toMatch(
      /unique\s*\(\s*sender_player_id\s*,\s*recipient_player_id\s*\)/i,
    );
  });

  it('adds a (team_id, dispatched_at DESC) index for the team-scoped rollup', () => {
    expect(ddlWithoutComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+parent_forward_signals\s*\(\s*team_id\s*,\s*dispatched_at\s+desc\s*\)/i,
    );
  });

  it('references players(id) on sender_player_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /sender_player_id\s+uuid[^,]*references\s+players\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references players(id) on recipient_player_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /recipient_player_id\s+uuid[^,]*references\s+players\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references teams(id) on team_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /team_id\s+uuid[^,]*references\s+teams\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
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
      'note',
      'subject',
      'first_name',
      'last_name',
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
