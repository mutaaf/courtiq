/**
 * Ticket 0045 — `plans.completed_drill_ids` migration.
 *
 * AC1: a new migration ALTER TABLE-adds exactly one column to `plans`:
 *   - completed_drill_ids  jsonb NOT NULL DEFAULT '[]'::jsonb
 *
 * COPPA: the executable DDL adds NO descriptive minor field, NO observation
 * text, NO parent contact, NO new player column. The migration documents what
 * it deliberately does NOT add (no observation_id link, no per-minor stamp),
 * and per LESSONS#0088 the banned-token scan strips `--` comment lines so the
 * documentation isn't mis-flagged.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /plans.?completed.?drill/i.test(f));
  if (!match) {
    throw new Error('No plans_completed_drills migration found in supabase/migrations');
  }
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — comment lines stripped. The migration's header
 * legitimately documents what it is NOT adding (no observation link, no per-
 * minor stamp); the COPPA banned-token scan therefore runs over non-comment
 * lines so the documentation isn't flagged (LESSONS#0088).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('plans.completed_drill_ids migration (ticket 0045)', () => {
  it('adds completed_drill_ids (jsonb NOT NULL DEFAULT [] ) to plans', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/alter\s+table\s+plans/);
    // Column is jsonb, NOT NULL, default empty jsonb array.
    expect(lower).toMatch(/completed_drill_ids\s+jsonb/);
    expect(lower).toMatch(/completed_drill_ids\s+jsonb[^,]*not\s+null/);
    expect(lower).toMatch(/completed_drill_ids[\s\S]*default\s*'\[\]'::jsonb/);
  });

  it('adds NO descriptive minor field, observation link, parent contact, or medical field (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    for (const banned of ['player', 'parent', 'observation', 'medical', 'photo', 'dob']) {
      expect(lower).not.toContain(banned);
    }
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
