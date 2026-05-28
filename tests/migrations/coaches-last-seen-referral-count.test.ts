/**
 * Ticket 0047 — `coaches.last_seen_referral_count` migration.
 *
 * AC: ALTER TABLE coaches ADD COLUMN last_seen_referral_count INT NOT NULL
 *     DEFAULT 0. Nothing else. The column is a per-coach UI bookmark for the
 *     referral-conversion celebration card; it carries NO new minor data.
 *
 * COPPA: the executable DDL adds NO descriptive minor field, no observation
 * text, no parent contact. Like LESSONS#0088, the explanatory `--` header
 * legitimately NAMES what this primitive is NOT (no widening of `players`,
 * no minor-scoped column), so the banned-token scan strips comment lines
 * before checking.
 *
 * Unique version prefix per LESSONS#6.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coaches.?last.?seen.?referral.?count/i.test(f));
  if (!match)
    throw new Error('No coaches_last_seen_referral_count migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — comment lines stripped. The migration's header
 * legitimately documents what it is NOT adding; the COPPA banned-token scan
 * therefore runs over non-comment lines so the documentation isn't flagged
 * (LESSONS#0088).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('coaches.last_seen_referral_count migration (ticket 0047)', () => {
  it('adds last_seen_referral_count INT NOT NULL DEFAULT 0 to coaches', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/alter\s+table\s+coaches/);
    expect(lower).toMatch(/last_seen_referral_count\s+int(?:eger)?\s+not\s+null\s+default\s+0/);
  });

  it('adds NO descriptive minor field, observation text, or parent contact (COPPA)', () => {
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
