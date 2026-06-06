/**
 * Ticket 0069 — migration 063_game_decompressions.sql.
 *
 * Asserts the structural shape of the new per-(session, coach) post-loss
 * decompression table:
 *  - column allow-list (no widening on a sacred table);
 *  - UNIQUE(session_id, coach_id) so a re-record REPLACES the row;
 *  - CHECK(duration_seconds BETWEEN 1 AND 60) — voice is short and bounded;
 *  - CHECK(length(transcript) BETWEEN 1 AND 1200) — bounded to a real drive-
 *    home note, never a transcript dump;
 *  - both indexes the route uses: (coach_id, created_at DESC) for the
 *    "carry into the next plan" lookup AND a partial (team_id, consumed_at)
 *    WHERE consumed_at IS NULL for the unconsumed-for-team hot read;
 *  - ON DELETE CASCADE on session/coach/team (a deleted session does not
 *    orphan a decompression); ON DELETE SET NULL on the optional
 *    consumed_plan_id (a deleted plan does not orphan the decompression);
 *  - NO new column on sessions / coaches / players / teams / observations /
 *    plans / parent_reactions — the migration only adds the new table.
 *
 * COPPA: scans the executable DDL (with `--` comment lines stripped per
 * LESSONS#0088) for any banned per-minor field name. The header comment
 * legitimately names the COPPA fields the migration deliberately does NOT
 * add (date_of_birth / medical_notes / parent_email / parent_phone /
 * jersey_number / photo_url); stripping the comment lines BEFORE the scan
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
  'supabase/migrations/063_game_decompressions.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip the `--` comment lines so the COPPA scan reads only
// executable DDL.
const ddl = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

describe('migration 063_game_decompressions.sql (ticket 0069)', () => {
  it('creates the game_decompressions table with the allow-listed columns only', () => {
    expect(ddl).toMatch(/create\s+table\s+if\s+not\s+exists\s+game_decompressions/i);

    const allowList = [
      /id\s+uuid/i,
      /session_id\s+uuid/i,
      /coach_id\s+uuid/i,
      /team_id\s+uuid/i,
      /transcript\s+text/i,
      /duration_seconds\s+int/i,
      /recommended_drill_name\s+text/i,
      /recommended_drill_setup\s+text\[\]/i,
      /recommended_drill_why\s+text/i,
      /consumed_at\s+timestamptz/i,
      /consumed_plan_id\s+uuid/i,
      /created_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddl).toMatch(re);
    }
  });

  it('enforces UNIQUE(session_id, coach_id) so a re-record REPLACES the row', () => {
    expect(ddl).toMatch(/unique\s*\(\s*session_id\s*,\s*coach_id\s*\)/i);
  });

  it('enforces CHECK(duration_seconds BETWEEN 1 AND 60)', () => {
    expect(ddl).toMatch(/check\s*\(\s*duration_seconds\s+between\s+1\s+and\s+60\s*\)/i);
  });

  it('enforces CHECK(length(transcript) BETWEEN 1 AND 1200)', () => {
    expect(ddl).toMatch(/check\s*\(\s*length\(\s*transcript\s*\)\s+between\s+1\s+and\s+1200\s*\)/i);
  });

  it('adds an index on (coach_id, created_at DESC) for the carry-into-next-plan lookup', () => {
    expect(ddl).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+game_decompressions\s*\(\s*coach_id\s*,\s*created_at\s+desc\s*\)/i,
    );
  });

  it('adds a partial index on (team_id, consumed_at) WHERE consumed_at IS NULL for the unconsumed-for-team read', () => {
    // The full partial-index declaration. Loose-whitespace match.
    expect(ddl).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+game_decompressions\s*\(\s*team_id\s*,\s*consumed_at\s*\)\s*where\s+consumed_at\s+is\s+null/i,
    );
  });

  it('references sessions / coaches / teams with ON DELETE CASCADE', () => {
    expect(ddl).toMatch(/session_id\s+uuid[^,]*references\s+sessions\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
    expect(ddl).toMatch(/coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
    expect(ddl).toMatch(/team_id\s+uuid[^,]*references\s+teams\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i);
  });

  it('references plans on consumed_plan_id with ON DELETE SET NULL', () => {
    // A consumed plan being deleted clears the link without orphaning the
    // decompression row (the transcript is still useful as history).
    expect(ddl).toMatch(
      /consumed_plan_id\s+uuid[^,]*references\s+plans\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/i,
    );
  });

  it('never adds a column to a sacred table (sessions / coaches / players / teams / observations / plans / parent_reactions)', () => {
    const sacred = ['sessions', 'coaches', 'players', 'teams', 'observations', 'plans', 'parent_reactions'];
    for (const table of sacred) {
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
    for (const word of banned) {
      expect(ddl.toLowerCase()).not.toContain(word);
    }
  });
});
