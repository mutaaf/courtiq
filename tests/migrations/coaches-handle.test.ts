/**
 * Ticket 0054 — `coaches.handle` vanity-URL migration.
 *
 * AC: ALTER TABLE coaches ADD COLUMN handle TEXT NULL UNIQUE, with a CHECK
 *     enforcing the handle's character class (2–32 chars, lowercase
 *     alphanumeric + hyphens, no leading/trailing hyphen). The column carries
 *     NO new minor data; the handle is the coach's own opt-in choice.
 *
 * COPPA: the executable DDL adds nothing to `players` or any minor-scoped
 * table, and contains no observation / parent / medical / photo / dob token.
 * Like LESSONS#0088, the explanatory `--` header legitimately documents what
 * the column is NOT (no widening of `players`, no new minor data), so the
 * banned-token scan strips comment lines before checking.
 *
 * The CHECK regex character class is the SAME shape `isValidHandleShape`
 * enforces in the helper (a second assertion below). Migration prefix is
 * unique (LESSONS#0006).
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coaches.?handle/i.test(f));
  if (!match)
    throw new Error('No coaches_handle migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — comment lines stripped. The migration's header
 * legitimately documents what it is NOT adding; the COPPA banned-token scan
 * runs over non-comment lines so the documentation isn't flagged
 * (LESSONS#0088 / LESSONS#0034).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('coaches.handle migration (ticket 0054)', () => {
  it('adds a NULLable UNIQUE handle TEXT column to coaches', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/alter\s+table\s+coaches/);
    // The column is nullable (no NOT NULL on the add) and UNIQUE.
    expect(lower).toMatch(/handle\s+text/);
    expect(lower).not.toMatch(/handle\s+text\s+not\s+null/);
    expect(lower).toMatch(/unique/);
  });

  it('attaches a CHECK constraint matching the handle character class', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Some form of CHECK with the regex character class for the handle.
    expect(lower).toMatch(/check\s*\(/);
    // The CHECK references the handle column.
    expect(lower).toContain('handle');
    // The handle character class — lowercase alphanumeric + hyphen.
    expect(lower).toMatch(/a-z0-9/);
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

  it('the CHECK regex matches the helper isValidHandleShape character class', async () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql);
    // Pull out the regex literal from the CHECK clause (look for a quoted
    // POSIX regex). Migrations use `handle ~ '<regex>'` shape.
    const m = ddl.match(/'(\^[^']+\$)'/);
    expect(m).not.toBeNull();
    const ddlRegex = new RegExp(m![1]);

    const { isValidHandleShape } = await import('@/lib/coach-handle-utils');

    // Sample handles that MUST pass both gates (DDL CHECK and helper).
    const valid = ['sarah-rodriguez', 'sr', 'sarah-rodriguez-2', 'a-b-c', 'coach2026'];
    for (const h of valid) {
      expect(ddlRegex.test(h)).toBe(true);
      expect(isValidHandleShape(h)).toBe(true);
    }

    // Samples that MUST be rejected by both gates.
    const invalid = [
      '-leading',
      'trailing-',
      'a',                          // too short
      'A-uppercase',
      'spaces here',
      'has_underscore',
      'has.dot',
      'a'.repeat(33),               // too long
    ];
    for (const h of invalid) {
      expect(ddlRegex.test(h)).toBe(false);
      expect(isValidHandleShape(h)).toBe(false);
    }
  });
});
