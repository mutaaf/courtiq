/**
 * Ticket 0080 — migration 071_parent_forward_signals_cross_team.sql.
 *
 * The cross-team-same-program forward (0080) widens the existing
 * `parent_forward_signals` table (shipped by 0079, migration 069) with
 * a single boolean flag: `cross_team BOOLEAN NOT NULL DEFAULT FALSE`.
 * Per LESSONS#0103 — OPTIONAL widening on a shared edge-row keeps
 * every 0079 caller byte-identical (in-team forwards inherit the
 * default `false`).
 *
 * Schema-wins-over-prose deviation (LESSONS#0096): the ticket prose
 * named the migration prefix `070`, but at pickup `ls
 * supabase/migrations/` shows 070 is already taken by
 * `070_coach_thank_messages.sql` (ticket 0081, shipped 2026-06-14) —
 * so the next free prefix is `071`. Documented in the ticket's
 * Implementation log.
 *
 * COPPA: scans executable DDL with `--` comment lines stripped per
 * LESSONS#0088 AND the structural identifier names stripped per
 * LESSONS#0114 — the column identifier contains the inherited
 * `cross_team` token but is structural (a forward-edge flag), not
 * minor data.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/071_parent_forward_signals_cross_team.sql',
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
// banned-token sweep. The table + column name contain inherited
// tokens but are structural (a cross-team-forward edge flag), not
// minor data.
const ddlForBannedSweep = ddlWithoutComments
  .replace(/parent_forward_signals/g, '')
  .replace(/cross_team/g, '');

describe('migration 071_parent_forward_signals_cross_team.sql (ticket 0080)', () => {
  it('adds ONLY the cross_team boolean column to parent_forward_signals (LESSONS#0103 widening)', () => {
    expect(ddlWithoutComments).toMatch(
      /alter\s+table\s+parent_forward_signals\s+add\s+column\s+if\s+not\s+exists\s+cross_team\s+boolean\s+not\s+null\s+default\s+false/i,
    );
  });

  it('does NOT add any other column to parent_forward_signals', () => {
    // A second ADD COLUMN would widen our minor-adjacent edge table;
    // pin to ONE ADD COLUMN clause total.
    const addColumnMatches = ddlWithoutComments.match(/add\s+column/gi) ?? [];
    expect(addColumnMatches.length).toBe(1);
  });

  it('does NOT modify the existing 0079 UNIQUE constraint', () => {
    // The 0079 UNIQUE (sender_player_id, recipient_player_id) is the
    // load-bearing idempotency gate — preserve it byte-identical.
    expect(ddlWithoutComments).not.toMatch(/drop\s+constraint/i);
    expect(ddlWithoutComments).not.toMatch(/unique\s*\(/i);
  });

  it('does NOT modify the existing 0079 team-scoped index', () => {
    // The 0079 (team_id, dispatched_at DESC) rollup index stays.
    expect(ddlWithoutComments).not.toMatch(/drop\s+index/i);
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans'];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithoutComments).not.toMatch(re);
    }
  });

  it('does not introduce any per-minor field on the widened table (COPPA)', () => {
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
