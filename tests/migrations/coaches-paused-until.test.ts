/**
 * Ticket 0042 — `coaches.paused_until` (+ `last_active_at`) migration.
 *
 * AC1: a new migration ALTER TABLE-adds two nullable timestamptz columns to
 * `coaches`:
 *   - paused_until    timestamptz null   (no default, no not-null)
 *   - last_active_at  timestamptz null   (no default, no not-null)
 *
 * COPPA: the executable DDL adds NO descriptive minor field, NO observation
 * text, NO parent contact. Like LESSONS#0088, the explanatory `--` header
 * legitimately NAMES the things this primitive does NOT do (no per-minor field,
 * no widening of `players`), so the banned-token scan strips comment lines
 * before checking.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coaches.?paused.?until/i.test(f));
  if (!match) throw new Error('No coaches_paused_until migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — comment lines stripped. The migration's header
 * legitimately documents what it is NOT adding (no minor-scoped column, no
 * widening of `players`); the COPPA banned-token scan therefore runs over
 * non-comment lines so the documentation isn't flagged (LESSONS#0088).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('coaches.paused_until migration (ticket 0042)', () => {
  it('adds paused_until (timestamptz null) and last_active_at (timestamptz null) to coaches', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Both columns appear, both on coaches.
    expect(lower).toMatch(/alter\s+table\s+coaches/);
    // paused_until — nullable, no NOT NULL, no DEFAULT.
    expect(lower).toMatch(/paused_until\s+timestamptz/);
    expect(lower).toMatch(/last_active_at\s+timestamptz/);

    // Neither column is NOT NULL — the migration must keep them nullable so
    // existing rows aren't broken.
    expect(lower).not.toMatch(/paused_until\s+timestamptz\s+not\s+null/);
    expect(lower).not.toMatch(/last_active_at\s+timestamptz\s+not\s+null/);

    // No default value on paused_until (a default would silently pre-pause
    // every existing coach, defeating the rollout posture).
    expect(lower).not.toMatch(/paused_until\s+timestamptz\s+default/);
  });

  it('adds NO descriptive minor field, observation text, or parent contact (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    for (const banned of ['player', 'dob', 'parent', 'observation', 'medical', 'photo']) {
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
