/**
 * Ticket 0052 — `players.released_at` migration (next-season roster turnover).
 *
 * The migration adds ONE nullable timestamptz column (`released_at`) to
 * `players` plus a partial index on the active-roster predicate. This is the
 * soft-state marker the new-season flow flips for kids who aged up or left
 * the program — released ≠ deleted, so cross-season observation history
 * stays attached to the same player_id and the AI prompts keep their memory.
 *
 * COPPA: the executable DDL adds NO new descriptive minor field — only a
 * status timestamp on a row the coach already created. The header comment
 * legitimately NAMES the things it does NOT do (no name-similarity, no
 * biometric, no dob-match), so the banned-token scan strips comment lines
 * before checking (LESSONS#0088 — same pattern as 0042's migration test).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  // Tolerate both singular (`player_released_at`) and plural (`players_released_at`)
  // filenames; the executable DDL is what's load-bearing, not the filename.
  const match = files.find((f) => /players?.?released.?at/i.test(f));
  if (!match) throw new Error('No player_released_at migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — comment lines stripped. The migration's header
 * legitimately documents what it is NOT adding (no minor PII, no
 * biometric); the COPPA banned-token scan therefore runs over non-comment
 * lines so the documentation itself doesn't trip the test (LESSONS#0088).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('players.released_at migration (ticket 0052)', () => {
  it('adds released_at as a nullable timestamptz on players', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/alter\s+table\s+players/);
    expect(lower).toMatch(/released_at\s+timestamptz/);

    // Nullable: every existing player MUST default to NULL (= active) after
    // the migration runs. A NOT NULL or a default would silently release the
    // whole user base.
    expect(lower).not.toMatch(/released_at\s+timestamptz\s+not\s+null/);
    expect(lower).not.toMatch(/released_at\s+timestamptz\s+default/);
  });

  it('adds a partial index for the active-roster read path', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // A partial index on (team_id, ...) WHERE is_active = true AND released_at IS NULL
    // keeps the active-roster query path fast as the released_at backlog grows.
    expect(lower).toMatch(/create\s+index/);
    expect(lower).toMatch(/released_at\s+is\s+null/);
  });

  it('adds NO new descriptive minor field (COPPA — only the status timestamp)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Banned descriptive fields about the minor — the migration legitimately
    // touches the `players` keyword (it's the table name), so check
    // descriptive concepts only.
    for (const banned of ['dob_match', 'biometric', 'name_similarity', 'photo_match', 'medical', 'parent_email', 'parent_phone']) {
      expect(lower).not.toContain(banned);
    }
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6 — dup 031_ broke schema_migrations)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
