/**
 * Ticket 0050 — `program_referrals` table migration.
 *
 * The DDL adds a new flat table for the parent-to-program-director referral
 * audit row. The COPPA guard scans the EXECUTABLE DDL only (strip `--`
 * comment lines per LESSONS#0088): the explanatory header legitimately NAMES
 * the player / observation / minor concepts this table is deliberately NOT
 * adding, so a whole-file scan would false-positive on the documentation.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /program.?referrals/i.test(f));
  if (!match) {
    throw new Error('No program_referrals migration found in supabase/migrations');
  }
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — comment lines stripped. The migration's header
 * legitimately documents what it is NOT adding (no player_id, no observation
 * excerpt, no widening of `players`); the banned-token scan therefore runs
 * over non-comment lines so the documentation isn't flagged (LESSONS#0088).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('program_referrals migration (ticket 0050)', () => {
  it('creates the program_referrals table with exactly the AC column set', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?program_referrals/);

    // Every column from the AC must appear in the DDL.
    const requiredColumns = [
      'id',
      'share_token',
      'parent_first_name',
      'parent_email',
      'director_first_name',
      'director_email',
      'director_email_hash',
      'note',
      'signed_director_id',
      'sent_at',
      'claimed_at',
      'claimed_org_id',
    ];
    for (const col of requiredColumns) {
      // Each column name appears as its own token in the table body.
      expect(lower).toMatch(new RegExp(`\\b${col}\\b`));
    }

    // No COPPA-sensitive column slipped in. The minor-data surface is
    // explicitly absent: this table never references players/observations.
    const bannedColumnTokens = [
      'player_id',
      'player_name',
      'observation_text',
      'observation_id',
      'date_of_birth',
      'dob',
      'medical',
      'photo_url',
      'biometric',
    ];
    for (const banned of bannedColumnTokens) {
      expect(lower).not.toContain(banned);
    }

    // No FK to players / observations / parent_shares row (the source coach
    // is resolved at read time via parent_shares -> teams -> coaches; never
    // copied here). The migration ONLY references `organizations` (for the
    // claim attribution).
    expect(lower).not.toMatch(/references\s+players/);
    expect(lower).not.toMatch(/references\s+observations/);
    expect(lower).not.toMatch(/references\s+parent_shares/);
    expect(lower).toMatch(/references\s+organizations/);
  });

  it('keeps claimed_at and claimed_org_id nullable (the row is born unclaimed)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // null is the default; the test rejects an accidental NOT NULL on either.
    expect(lower).not.toMatch(/claimed_at\s+timestamptz\s+not\s+null/);
    expect(lower).not.toMatch(/claimed_org_id\s+uuid\s+not\s+null/);
  });

  it('indexes (share_token, director_email_hash, sent_at) for the dedup query', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+index/);
    // The dedup composite index must include all three columns the dedup
    // query reads (share_token + director_email_hash + sent_at).
    expect(lower).toMatch(/share_token/);
    expect(lower).toMatch(/director_email_hash/);
    expect(lower).toMatch(/sent_at/);
  });

  it('uses a unique version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
