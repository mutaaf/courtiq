/**
 * Ticket 0060 — `parent_initiated_invites` migration (056).
 *
 * The dedupe table the new POST /api/share/[token]/sibling-invite route
 * writes to. AC anchor: COLUMNS allow-listed (id, from_share_token,
 * from_player_id, to_coach_email, sibling_first_name, program_id, sent_at,
 * referral_code). NO `parent_email`, NO `parent_phone`, NO `date_of_birth`,
 * NO sibling LAST name column. `sibling_first_name` is parent-typed in the
 * invite sheet, so it must be nullable text (NOT NULL would force the
 * parent's typed string to be present at insert time even on a degraded
 * path).
 *
 * Per LESSONS#0088: explanatory `--` comments in the migration legitimately
 * name what the table is deliberately NOT collecting (parent_email,
 * date_of_birth, etc.) so the COPPA boundary is recorded in the migration
 * trail. The banned-token scan therefore runs over the executable DDL only,
 * with `--` comment lines stripped first.
 *
 * Per LESSONS#0006: the version prefix must be unique. 056 is the next free
 * integer after 055_player_handoffs.sql.
 *
 * .test.ts NOT .spec.ts — vitest excludes the Playwright spec glob
 * (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ParentInitiatedInvite } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /parent.?initiated.?invites/i.test(f));
  if (!match) throw new Error('No parent_initiated_invites migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Strip `--` comment lines before any executable-DDL scan. The migration's
 * explanatory header legitimately names what the table is deliberately NOT
 * collecting (parent_email, date_of_birth, parent_phone) to document the
 * COPPA boundary; scanning the raw file for those tokens would falsely trip
 * on that documentation (LESSONS#0088 / #0034).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('parent_initiated_invites migration (ticket 0060)', () => {
  it('creates a parent_initiated_invites table with the eight allow-listed columns', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?parent_initiated_invites/);

    // Each AC-listed column is present.
    expect(lower).toMatch(/\bid\s+uuid\b/);
    expect(lower).toMatch(/\bfrom_share_token\s+text\s+not\s+null\b/);
    expect(lower).toMatch(/\bfrom_player_id\s+uuid\b/);
    expect(lower).toMatch(/\bto_coach_email\s+text\s+not\s+null\b/);
    // sibling_first_name MUST be nullable text — the parent types it in the
    // sheet; a degraded path that does not send a name (defensive null) is
    // a 200 with no email rather than a hard insert failure.
    expect(lower).toMatch(/\bsibling_first_name\s+text\s*(?:null|,|\))/);
    expect(lower).not.toMatch(/\bsibling_first_name\s+text\s+not\s+null\b/);
    expect(lower).toMatch(/\bprogram_id\s+uuid\b/);
    expect(lower).toMatch(/\bsent_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/);
    expect(lower).toMatch(/\breferral_code\s+text\b/);
  });

  it('adds NO descriptive minor field, parent contact, or DOB column (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // The ticket's explicit banned-token list — none may appear in the DDL.
    // These describe minor data the dedupe row must NEVER carry.
    for (const banned of [
      'parent_email',
      'parent_phone',
      'date_of_birth',
      'medical',
      'sibling_last_name',
      'sibling_dob',
    ]) {
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

  it('uses prefix 056 — the next free integer after 055_player_handoffs', () => {
    const { file } = findMigration();
    expect(file.startsWith('056_')).toBe(true);
  });
});

describe('ParentInitiatedInvite type — exported from @/types/database', () => {
  it('declares the persisted shape (compile-time check)', () => {
    // tsc --noEmit fails this file if the type is missing or differently shaped.
    const row: ParentInitiatedInvite = {
      id: '00000000-0000-4000-a000-000000000099',
      from_share_token: 'test-share-token-e2e-001',
      from_player_id: '00000000-0000-4000-a000-000000000030',
      to_coach_email: 'other.coach@example.test',
      sibling_first_name: 'Sofia',
      program_id: '00000000-0000-4000-a000-000000000010',
      sent_at: '2026-06-01T00:00:00.000Z',
      referral_code: 'AAAAAA',
    };
    expect(row.from_share_token).toBe('test-share-token-e2e-001');
    // sibling_first_name is nullable on the type so the dedupe-row read
    // surfaces a null cleanly without a non-null-assertion at call sites.
    const noName: ParentInitiatedInvite = { ...row, sibling_first_name: null };
    expect(noName.sibling_first_name).toBeNull();
  });
});
