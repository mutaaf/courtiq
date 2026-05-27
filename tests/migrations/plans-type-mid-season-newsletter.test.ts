/**
 * Ticket 0043 — `plans_type_check` constraint extension + `team_card_shares.type`
 * column-add migration.
 *
 * The new migration:
 *   - widens the `plans.type` CHECK constraint allow-list to include
 *     'mid_season_team_newsletter' (drop+recreate, mirroring
 *     034_plans_type_check_align.sql and 041_plans_type_pregame_brief.sql);
 *   - adds a nullable `type TEXT NULL DEFAULT 'team_card'` column to the
 *     existing `team_card_shares` table so the newsletter share can ride on it
 *     instead of needing a brand-new shares table (engineering note).
 *   - touches NOTHING else — no new shares table, no per-minor column, no FK
 *     onto a player row.
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
  const match = files.find((f) => /plans.?type.?mid.?season.?(team.?)?newsletter/i.test(f));
  if (!match) {
    throw new Error('No plans_type_mid_season_team_newsletter migration found in supabase/migrations');
  }
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Executable DDL only (LESSONS#0088 — strip `--` comments). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('plans_type_mid_season_team_newsletter migration (ticket 0043)', () => {
  it("extends plans_type_check to include 'mid_season_team_newsletter'", () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).toContain('plans_type_check');
    expect(ddl).toContain("'mid_season_team_newsletter'");
  });

  it('uses ALTER TABLE plans + drops-and-recreates the same constraint (matching 034 / 041)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    expect(ddl).toMatch(/alter\s+table\s+plans/);
    expect(ddl).toMatch(/drop\s+constraint\s+(if\s+exists\s+)?plans_type_check/);
    expect(ddl).toMatch(/add\s+constraint\s+plans_type_check\s+check\s*\(\s*type\s+in\s*\(/);
  });

  it("adds a nullable `type` column to team_card_shares with default 'team_card' (so existing rows keep their meaning)", () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // Column-add references the existing table.
    expect(ddl).toMatch(/alter\s+table\s+team_card_shares/);
    expect(ddl).toMatch(/add\s+column\s+(if\s+not\s+exists\s+)?type/);
    // Default is 'team_card' (single-quoted in SQL) — guarantees existing rows
    // keep their meaning as a coach-card share. The newsletter share is the
    // new value 'mid_season_team_newsletter' (the route writes this on insert).
    expect(ddl).toMatch(/default\s+'team_card'/);
  });

  it('touches NO other table (no new shares table, no per-minor column)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // No new CREATE TABLE.
    expect(ddl).not.toMatch(/create\s+table/);
    // No new FK references onto players / parent_shares (the migration is
    // strictly additive in two scopes: the plans CHECK and the team_card_shares
    // column).
    expect(ddl).not.toMatch(/references\s+players/);
    expect(ddl).not.toMatch(/references\s+parent_shares/);
  });

  it('preserves every previously allowed plan type (regression guard)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
    // Spot-check values 034 + 041 introduced; the existing 'parent_report'
    // type is the load-bearing sibling for the parent-sharing surface.
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

  it('introduces NO descriptive minor field (COPPA — newsletter is team-level by construction)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql).toLowerCase();
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
