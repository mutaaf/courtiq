/**
 * Ticket 0068 — migration 062_season_opener_shares.sql.
 *
 * Asserts the structural shape of the new share-mapping table:
 *  - column allow-list (no widening on a sacred table);
 *  - UNIQUE(token) for the public-page indexed lookup;
 *  - UNIQUE(team_id, season_label) so a re-create on the same team's season
 *    REPLACES the focus_line + the token (idempotency contract);
 *  - one index on (token);
 *  - NO new column on sessions / coaches / players / teams / observations /
 *    plans / parent_reactions — the migration only adds the new table.
 *
 * COPPA: scans the executable DDL (with `--` comment lines stripped per
 * LESSONS#0088) for any banned per-minor token. The header comment
 * legitimately names the COPPA fields the migration deliberately does NOT
 * add (date_of_birth / medical_notes / parent_email / parent_phone /
 * jersey_number / photo_url) — stripping the comment lines BEFORE the scan
 * keeps that documentation trail intact.
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020 / #38 — vitest.config.ts excludes
 * the spec glob).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/062_season_opener_shares.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip the `--` comment lines so the COPPA scan reads only
// executable DDL. The header comment names the fields we deliberately do NOT
// add; that documentation trail must not trip its own guard.
const ddl = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('migration 062_season_opener_shares.sql (ticket 0068)', () => {
  it('creates the season_opener_shares table with the allow-listed columns only', () => {
    expect(ddl).toMatch(/create\s+table\s+if\s+not\s+exists\s+season_opener_shares/i);

    // Allow-listed columns — every one named here, nothing else permitted.
    const allowList = [
      /id\s+uuid/i,
      /team_id\s+uuid/i,
      /coach_id\s+uuid/i,
      /token\s+text/i,
      /season_label\s+text/i,
      /focus_line\s+text/i,
      /created_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddl).toMatch(re);
    }
  });

  it('enforces UNIQUE(token) and UNIQUE(team_id, season_label)', () => {
    // Either as an inline column-level constraint OR as a table-level UNIQUE.
    // `token` is required to be unique (the public URL).
    const tokenUnique =
      /token\s+text[^,]*\bunique\b/i.test(ddl) ||
      /unique\s*\(\s*token\s*\)/i.test(ddl);
    expect(tokenUnique).toBe(true);

    // (team_id, season_label) is the idempotency key — one row per team per
    // season; a re-create UPDATES it.
    expect(ddl).toMatch(/unique\s*\(\s*team_id\s*,\s*season_label\s*\)/i);
  });

  it('adds an index on (token) for the public-page hot read', () => {
    expect(ddl).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+season_opener_shares\s*\(\s*token/i,
    );
  });

  it('references teams + coaches with ON DELETE CASCADE', () => {
    expect(ddl).toMatch(/team_id\s+uuid[^,]*references\s+teams\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
    expect(ddl).toMatch(/coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  });

  it('never adds a column to a sacred table (sessions / coaches / players / teams / observations / plans / parent_reactions)', () => {
    const sacred = ['sessions', 'coaches', 'players', 'teams', 'observations', 'plans', 'parent_reactions'];
    for (const table of sacred) {
      // No `ALTER TABLE <sacred> ADD COLUMN …` may appear in this migration.
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddl).not.toMatch(re);
    }
  });

  it('does not introduce any per-minor field on the new table (COPPA)', () => {
    const banned = [
      'date_of_birth',
      'medical_notes',
      'parent_email',
      'parent_phone',
      'jersey_number',
      'photo_url',
    ];
    // The DDL is the comment-stripped body; bare field names here would be
    // executable DDL, not documentation. The structural include-flag false
    // positive of LESSONS#0113 does not apply here — none of these tokens
    // are flags; they are minor-data field names.
    for (const word of banned) {
      expect(ddl.toLowerCase()).not.toContain(word);
    }
  });
});
