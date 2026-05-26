/**
 * Ticket 0040 — `plans_type_check` constraint extension migration.
 *
 * The new migration widens the `plans.type` CHECK constraint allow-list to
 * include 'pregame_brief'. It must:
 *   - reference `plans_type_check` and add EXACTLY the 'pregame_brief' value
 *   - touch no other table, column, or constraint
 *   - introduce NO new minor-data column (the brief is an existing-plan-shape
 *     write — no widening of what the product collects on minors).
 *
 * Per LESSONS#0088, scan the executable DDL only (strip `--` header comments)
 * so the migration's documentation prose does not falsely trip the COPPA scan.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /plans.?type.?pregame.?brief/i.test(f));
  if (!match) throw new Error('No plans_type_pregame_brief migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Executable DDL only (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('plans_type_pregame_brief migration (ticket 0040)', () => {
  it("extends plans_type_check to include 'pregame_brief'", () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).toContain('plans_type_check');
    expect(ddl).toContain("'pregame_brief'");
  });

  it('uses ALTER TABLE plans + drops-and-recreates the same constraint (matching 034)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).toMatch(/alter\s+table\s+plans/);
    expect(ddl).toMatch(/drop\s+constraint\s+(if\s+exists\s+)?plans_type_check/);
    expect(ddl).toMatch(/add\s+constraint\s+plans_type_check\s+check\s*\(\s*type\s+in\s*\(/);
  });

  it('touches NO table other than plans (no new column, no other constraint)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // No new CREATE TABLE, no ADD COLUMN, no new table reference.
    expect(ddl).not.toMatch(/create\s+table/);
    expect(ddl).not.toMatch(/add\s+column/);
    // No FK / index added for a sibling table.
    expect(ddl).not.toMatch(/references\s+(?!nothing)/);
  });

  it('preserves every previously allowed plan type (regression guard)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // Spot-check values 034_plans_type_check_align.sql introduced. Note that
    // 'opponent_profile' is NOT pinned here — it was never on 034's allow-list
    // (the hosted DB has tolerated it out-of-band), and the 0040 AC pins us to
    // adding ONLY 'pregame_brief'. Widening to include opponent_profile is a
    // separate ticket.
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
    ]) {
      expect(ddl).toContain(t);
    }
  });

  it('introduces NO descriptive minor field (COPPA — pregame_brief is an existing-shape write)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // The brief is persisted in the existing plans.content_structured column.
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
