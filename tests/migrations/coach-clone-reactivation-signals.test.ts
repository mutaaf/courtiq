/**
 * Ticket 0078 — `coach_clone_reactivation_signals` migration.
 *
 * The migration adds ONE new table (no widening of `players` or any
 * other sacred entity) recording each dispatched dormant-publisher
 * reactivation email. The cron uses this table to enforce the
 * 60-day cooldown contract per coach.
 *
 * COPPA: the executable DDL adds NO descriptive minor field, NO
 * observation text, NO parent contact. Like LESSONS#0088 / #0114,
 * the explanatory `--` header legitimately NAMES the things this
 * primitive does NOT do (no per-minor field, no widening of
 * `players`), and the table's structural identifiers contain words
 * like `coach` / `milestone` / `reactivation` that the simple
 * banned-token sweep would over-match. The scan therefore strips
 * BOTH comment lines AND the table's structural identifiers before
 * checking for banned tokens (LESSONS#0114).
 *
 * .test.ts NOT .spec.ts — LESSONS#0020 / #38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coach.?clone.?reactivation.?signals/i.test(f));
  if (!match) {
    throw new Error(
      'No coach_clone_reactivation_signals migration found in supabase/migrations',
    );
  }
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the COPPA scan reads only executable
 *  DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** Additionally strip the table's structural identifiers — the column
 *  / table names themselves contain words like `coach`, `clone`,
 *  `milestone`, `published`, `dispatched` that would otherwise
 *  collide with the bare-token sweep (LESSONS#0114). */
function ddlWithoutStructuralIdentifiers(sql: string): string {
  return ddlOnly(sql)
    .replace(/coach_clone_reactivation_signals/g, 'TABLE_NAME')
    .replace(/published_coach_id/g, 'COL_PUBLISHED')
    .replace(/milestone_id/g, 'COL_MILESTONE')
    .replace(/dispatched_at/g, 'COL_DISPATCHED')
    .replace(/coach_reputation_milestones/g, 'FK_MILESTONES')
    .replace(/coaches/g, 'FK_COACHES');
}

describe('coach_clone_reactivation_signals migration (ticket 0078)', () => {
  it('creates the table with the four expected columns + UNIQUE constraint', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).toMatch(/create\s+table\s+if\s+not\s+exists\s+coach_clone_reactivation_signals/);

    // id, published_coach_id, milestone_id, dispatched_at — exactly
    // these four columns.
    expect(lower).toMatch(/id\s+uuid\s+primary\s+key\s+default\s+gen_random_uuid\(\)/);
    expect(lower).toMatch(/published_coach_id\s+uuid\s+not\s+null\s+references\s+coaches\(id\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(
      /milestone_id\s+uuid\s+not\s+null\s+references\s+coach_reputation_milestones\(id\)\s+on\s+delete\s+cascade/,
    );
    expect(lower).toMatch(/dispatched_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/);

    // The UNIQUE (published_coach_id, milestone_id) constraint is
    // load-bearing for idempotency across re-runs of the same cron.
    expect(lower).toMatch(/unique\s*\(\s*published_coach_id\s*,\s*milestone_id\s*\)/);
  });

  it('adds an index on (published_coach_id, dispatched_at desc) for the cooldown lookup', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w*coach_clone_reactivation_signals\w*\s+on\s+coach_clone_reactivation_signals\s*\(\s*published_coach_id\s*,\s*dispatched_at\s+desc\s*\)/,
    );
  });

  it('adds NO descriptive minor field, observation text, or parent contact (COPPA, structural-id-stripped)', () => {
    const { sql } = findMigration();
    const lower = ddlWithoutStructuralIdentifiers(sql).toLowerCase();
    for (const banned of [
      'player',
      'dob',
      'parent',
      'observation',
      'medical',
      'photo',
      'jersey',
      'nickname',
      'biometric',
      'date_of_birth',
    ]) {
      expect(lower, `banned token "${banned}" leaked into executable DDL`).not.toContain(banned);
    }
  });

  it('does NOT widen any sacred table (no ALTER TABLE players / coaches / teams / observations / plans)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).not.toMatch(/alter\s+table\s+(players|teams|observations|plans|sessions)\b/);
    // The migration MAY alter coaches only if it adds a non-sensitive
    // column — but this ticket's contract is explicitly NO widening.
    expect(lower).not.toMatch(/alter\s+table\s+coaches\b/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });

  it('lands at prefix 068 (the next free integer after 067)', () => {
    const { file } = findMigration();
    expect(file.startsWith('068_')).toBe(true);
  });
});
