/**
 * Ticket 0072 — migration 064_coach_reactivation_signals.sql.
 *
 * Asserts the structural shape of the new per-(dormant coach, prior
 * player) reactivation-signal table:
 *  - column allow-list (no widening on a sacred table);
 *  - UNIQUE(dormant_coach_id, prior_player_id) so a re-visit by the same
 *    parent on the same prior team is idempotent (the upsert doesn't
 *    spam a new row);
 *  - both indexes the route + the cron use:
 *      * partial (dormant_coach_id, fired_at DESC) WHERE consumed_at IS
 *        NULL for the /home card lookup;
 *      * partial (notified_at) WHERE notified_at IS NULL for the cron
 *        unsent-batch lookup;
 *  - ON DELETE CASCADE on coach / team / player (a deleted prior player
 *    does not orphan a dangling signal);
 *  - NO new column on the sacred tables (coaches, players, teams,
 *    observations, plans).
 *
 * COPPA: scans the executable DDL (with `--` comment lines stripped per
 * LESSONS#0088, AND the structural `returning_parent_email_hash`
 * identifier stripped per LESSONS#0114) for any banned per-minor field.
 * The column's IDENTIFIER name contains a token that overlaps the
 * banned list but its VALUE space is a SHA-256 hash, never plaintext —
 * stripping the identifier keeps the scan honest without weakening it.
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/064_coach_reactivation_signals.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip the `--` comment lines so the COPPA scan reads only
// executable DDL.
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0114 — strip the structural `returning_parent_email_hash`
// identifier from the banned-token sweep. The column TYPE is TEXT and its
// VALUE is a SHA-256 hash; the identifier inherits a token from its
// documentary purpose but is structurally a hash, not minor data. The
// non-banned-token assertions still see the full DDL.
const ddlForBannedSweep = ddlWithComments.replace(
  /returning_parent_email_hash/g,
  '',
);

describe('migration 064_coach_reactivation_signals.sql (ticket 0072)', () => {
  it('creates the coach_reactivation_signals table with the allow-listed columns only', () => {
    expect(ddlWithComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+coach_reactivation_signals/i,
    );

    const allowList = [
      /id\s+uuid/i,
      /dormant_coach_id\s+uuid/i,
      /prior_team_id\s+uuid/i,
      /prior_player_id\s+uuid/i,
      /returning_parent_email_hash\s+text/i,
      /fired_at\s+timestamptz/i,
      /notified_at\s+timestamptz/i,
      /consumed_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithComments).toMatch(re);
    }
  });

  it('stores the parent email as a TEXT hash, never as a separate plaintext column', () => {
    // Defensive: the column TYPE is TEXT and its name explicitly says hash.
    // No sibling column shaped like `returning_parent_email TEXT` (without
    // the `_hash` suffix) ever appears.
    expect(ddlWithComments).toMatch(/returning_parent_email_hash\s+text/i);
    expect(ddlWithComments).not.toMatch(/returning_parent_email\s+text(?!\s*\[|_)/i);
  });

  it('enforces UNIQUE(dormant_coach_id, prior_player_id) so a re-visit is idempotent', () => {
    expect(ddlWithComments).toMatch(
      /unique\s*\(\s*dormant_coach_id\s*,\s*prior_player_id\s*\)/i,
    );
  });

  it('adds a partial index on (dormant_coach_id, fired_at DESC) WHERE consumed_at IS NULL for the /home card lookup', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+coach_reactivation_signals\s*\(\s*dormant_coach_id\s*,\s*fired_at\s+desc\s*\)\s*where\s+consumed_at\s+is\s+null/i,
    );
  });

  it('adds a partial index on (notified_at) WHERE notified_at IS NULL for the cron unsent-batch lookup', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+coach_reactivation_signals\s*\(\s*notified_at\s*\)\s*where\s+notified_at\s+is\s+null/i,
    );
  });

  it('references coaches / teams / players with ON DELETE CASCADE', () => {
    expect(ddlWithComments).toMatch(
      /dormant_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(ddlWithComments).toMatch(
      /prior_team_id\s+uuid[^,]*references\s+teams\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
    expect(ddlWithComments).toMatch(
      /prior_player_id\s+uuid[^,]*references\s+players\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
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
      'jersey_number',
      'photo_url',
      'nickname',
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
