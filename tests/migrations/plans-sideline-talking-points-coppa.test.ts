/**
 * Ticket 0046 — `plans_type_check` constraint extension migration.
 *
 * The new migration widens the `plans.type` CHECK constraint allow-list to
 * include 'sideline_talking_points'. It must:
 *   - reference `plans_type_check` and add EXACTLY the
 *     'sideline_talking_points' value
 *   - touch no other table, column, or constraint
 *   - introduce NO new minor-data column (the sheet is an existing-plan-shape
 *     write — no widening of what the product collects on minors).
 *
 * Per LESSONS#0088, scan the executable DDL only (strip `--` header comments)
 * so the migration's documentation prose does not falsely trip the COPPA scan.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020/#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /plans.?type.?sideline.?talking.?points/i.test(f));
  if (!match) throw new Error('No plans_type_sideline_talking_points migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Executable DDL only (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('plans_type_sideline_talking_points migration (ticket 0046)', () => {
  it("extends plans_type_check to include 'sideline_talking_points'", () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).toContain('plans_type_check');
    expect(ddl).toContain("'sideline_talking_points'");
  });

  it('uses ALTER TABLE plans + drops-and-recreates the same constraint (matching 034 / 041)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).toMatch(/alter\s+table\s+plans/);
    expect(ddl).toMatch(/drop\s+constraint\s+(if\s+exists\s+)?plans_type_check/);
    expect(ddl).toMatch(/add\s+constraint\s+plans_type_check\s+check\s*\(\s*type\s+in\s*\(/);
  });

  it('touches NO table other than plans (no new column, no other constraint)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).not.toMatch(/create\s+table/);
    expect(ddl).not.toMatch(/add\s+column/);
    expect(ddl).not.toMatch(/references\s+(?!nothing)/);
  });

  it('preserves every previously allowed plan type (regression guard)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // Spot-check values 034 + 041 introduced. Every existing plan type must
    // still be on the allow-list — the migration is purely additive.
    for (const t of [
      "'practice'",
      "'gameday'",
      "'parent_report'",
      "'weekly_star'",
      "'player_of_match'",
      "'game_recap'",
      "'huddle_script'",
      "'practice_arc'",
      "'coach_reflection'",
      "'pregame_brief'",
    ]) {
      expect(ddl).toContain(t);
    }
  });

  it('introduces NO descriptive minor field (COPPA — sideline_talking_points is an existing-shape write)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // The sheet is persisted in the existing plans.content_structured column.
    // The migration must NOT add a column with any of these names.
    for (const banned of ['date_of_birth', 'dob', 'medical', 'parent_email', 'parent_phone', 'photo_url']) {
      expect(ddl).not.toContain(banned);
    }
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#0006)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
