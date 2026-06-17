/**
 * Ticket 0087 — migration 072_org_card_snoozes.sql.
 *
 * A new `org_card_snoozes` table backs the "Maybe later" button on the
 * new `<ProgramOrgTierCard />`. One row per (org_id, card_kind) edge with
 * a `snoozed_until` timestamp; the program-pulse route reads the row and
 * keeps the card silent until the snooze expires.
 *
 * The CHECK enum on `card_kind` is intentionally small — only the one kind
 * this ticket needs. Future card-kinds widen the CHECK in a separate
 * migration.
 *
 * COPPA: the table references organizations + coaches only — no minor data.
 * The header documents what it deliberately does NOT add; LESSONS#0088
 * strips `--` comment lines before the banned-token sweep.
 *
 * Migration prefix uniqueness (LESSONS#0006): at pickup `ls
 * supabase/migrations/` shows 071 is the latest, so 072 is the next free
 * prefix. Documented in the ticket's Implementation log.
 *
 * Service-role grants (LESSONS#0094): explicit GRANT block at the end of
 * the migration so the e2e gate's service_role keeps INSERT/SELECT on the
 * new table after the supabase CLI auto-grant skip.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/072_org_card_snoozes.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');

// LESSONS#0088 — strip `--` comment lines so the COPPA scan reads only
// executable DDL (the header documents what we deliberately do NOT add).
const ddlWithoutComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

// LESSONS#0114 — strip the structural identifier names before the
// banned-token sweep. The table name contains the inherited `card` token
// but is structural (a snooze flag), not minor data.
const ddlForBannedSweep = ddlWithoutComments
  .replace(/org_card_snoozes/g, '')
  .replace(/card_kind/g, '');

describe('migration 072_org_card_snoozes.sql (ticket 0087)', () => {
  it('creates the org_card_snoozes table with the documented column set', () => {
    expect(ddlWithoutComments).toMatch(/create\s+table\s+if\s+not\s+exists\s+org_card_snoozes/i);
    // The required columns the ticket spec names.
    expect(ddlWithoutComments).toMatch(/\bid\s+uuid\b/i);
    expect(ddlWithoutComments).toMatch(/\borg_id\s+uuid\b/i);
    expect(ddlWithoutComments).toMatch(/\bcard_kind\s+text\b/i);
    expect(ddlWithoutComments).toMatch(/\bsnoozed_until\s+timestamptz\b/i);
    expect(ddlWithoutComments).toMatch(/\bsnoozed_by_coach_id\s+uuid\b/i);
    expect(ddlWithoutComments).toMatch(/\bsnoozed_at\s+timestamptz\b/i);
  });

  it('foreign-keys org_id to organizations and snoozed_by_coach_id to coaches with cascade delete', () => {
    expect(ddlWithoutComments).toMatch(/org_id[\s\S]*?references\s+organizations\(id\)[\s\S]*?on\s+delete\s+cascade/i);
    expect(ddlWithoutComments).toMatch(/snoozed_by_coach_id[\s\S]*?references\s+coaches\(id\)[\s\S]*?on\s+delete\s+cascade/i);
  });

  it('locks card_kind to the closed allow-list (program_org_tier only for v1)', () => {
    // The CHECK constraint pins the v1 kind. A future card-kind widens it
    // explicitly in a separate migration.
    expect(ddlWithoutComments).toMatch(/check\s*\(\s*card_kind\s+in\s*\(\s*'program_org_tier'\s*\)\s*\)/i);
  });

  it('enforces UNIQUE (org_id, card_kind) — one snooze row per org-card edge', () => {
    expect(ddlWithoutComments).toMatch(/unique\s*\(\s*org_id\s*,\s*card_kind\s*\)/i);
  });

  it('adds a partial index on (org_id, card_kind) WHERE snoozed_until > NOW() for fast active lookups', () => {
    expect(ddlWithoutComments).toMatch(/create\s+index[\s\S]*?on\s+org_card_snoozes[\s\S]*?\(org_id[\s\S]*?card_kind[\s\S]*?\)[\s\S]*?where\s+snoozed_until\s*>\s*now\s*\(\s*\)/i);
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans / organizations)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans', 'organizations'];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithoutComments).not.toMatch(re);
    }
  });

  it('does not introduce any per-minor field on the new table (COPPA)', () => {
    const banned = [
      'date_of_birth',
      'medical_notes',
      'parent_phone',
      'parent_name',
      'parent_email',
      'jersey_number',
      'photo_url',
      'nickname',
      'subject',
      'first_name',
      'last_name',
      'player_id',
      'biometric',
      'dob_match',
      'similarity',
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });

  it('includes the service-role GRANT block at the end (LESSONS#0094)', () => {
    expect(ddlWithoutComments).toMatch(/grant\s+all\s+privileges\s+on\s+all\s+tables\s+in\s+schema\s+public\s+to\s+service_role/i);
  });
});
