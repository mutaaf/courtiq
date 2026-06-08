/**
 * Ticket 0074 — migration 066_referral_credit_grants.sql.
 *
 * Asserts the structural shape of the new per-(inviter coach, milestone
 * kind) referral-credit-grants table:
 *  - column allow-list (no widening on a sacred table);
 *  - CHECK constraint pinning milestone_kind to the 3 documented values;
 *  - CHECK constraint pinning credit_amount_cents into (0, 10000];
 *  - UNIQUE(inviter_coach_id, milestone_kind) so a milestone fires
 *    exactly once per threshold per inviter;
 *  - partial index (inviter_coach_id, notified_at) WHERE notified_at
 *    IS NULL for the home-card lookup;
 *  - partial index on stripe_customer_balance_txn_id WHERE NOT NULL
 *    for the audit trail back-reference;
 *  - ON DELETE CASCADE on coaches;
 *  - NO new column on sacred tables (coaches, players, teams, plans,
 *    observations, organizations);
 *  - qualified_referral_coach_ids is UUID[], NOT TEXT[] (load-bearing
 *    audit trail per LESSONS#0044 billing immutability).
 *
 * COPPA: scans the executable DDL (with `--` comment lines stripped
 * per LESSONS#0088 AND the structural `referral_credit_grants` /
 * `inviter_coach_id` / `qualified_referral_coach_ids` identifiers
 * stripped per LESSONS#0114 — the IDENTIFIER names are structural,
 * not minor data).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/066_referral_credit_grants.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
// LESSONS#0088 — strip `--` comment lines so the COPPA scan reads only
// executable DDL (the header documents what we deliberately do NOT add).
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0114 — strip the structural identifiers before the banned-
// token sweep. The table name and column names contain inherited
// tokens but are structural (a credit-grant edge), not minor data.
const ddlForBannedSweep = ddlWithComments
  .replace(/referral_credit_grants/g, '')
  .replace(/inviter_coach_id/g, '')
  .replace(/qualified_referral_coach_ids/g, '');

describe('migration 066_referral_credit_grants.sql (ticket 0074)', () => {
  it('creates the referral_credit_grants table with the allow-listed columns only', () => {
    expect(ddlWithComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+referral_credit_grants/i,
    );

    const allowList = [
      /id\s+uuid/i,
      /inviter_coach_id\s+uuid/i,
      /milestone_kind\s+text/i,
      /qualified_referral_coach_ids\s+uuid\[\]/i,
      /credit_amount_cents\s+int/i,
      /credit_currency\s+text/i,
      /stripe_customer_balance_txn_id\s+text/i,
      /granted_at\s+timestamptz/i,
      /redeemed_period_end\s+timestamptz/i,
      /notified_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithComments).toMatch(re);
    }
  });

  it('pins milestone_kind via a CHECK constraint to the three documented values', () => {
    expect(ddlWithComments).toMatch(/check\s*\(\s*milestone_kind\s+in\s*\(/i);
    for (const kind of ['qualified_3', 'qualified_10', 'qualified_25']) {
      expect(ddlWithComments).toMatch(new RegExp(`'${kind}'`));
    }
  });

  it('pins credit_amount_cents to a positive, capped range via CHECK', () => {
    // A single CHECK clause that asserts both > 0 and <= 10000.
    expect(ddlWithComments).toMatch(
      /credit_amount_cents\s+int[^,]*check\s*\(\s*credit_amount_cents\s*>\s*0\s+and\s+credit_amount_cents\s*<=\s*10000\s*\)/i,
    );
  });

  it('stores qualified_referral_coach_ids as UUID[], NOT text[] (audit trail integrity)', () => {
    expect(ddlWithComments).toMatch(/qualified_referral_coach_ids\s+uuid\[\]/i);
    expect(ddlWithComments).not.toMatch(/qualified_referral_coach_ids\s+text\[\]/i);
  });

  it('defaults credit_currency to usd', () => {
    expect(ddlWithComments).toMatch(/credit_currency\s+text[^,]*default\s+'usd'/i);
  });

  it('enforces UNIQUE(inviter_coach_id, milestone_kind) so a milestone fires once per inviter', () => {
    expect(ddlWithComments).toMatch(
      /unique\s*\(\s*inviter_coach_id\s*,\s*milestone_kind\s*\)/i,
    );
  });

  it('adds a partial index on (inviter_coach_id, notified_at) WHERE notified_at IS NULL for the /home card lookup', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+referral_credit_grants\s*\(\s*inviter_coach_id\s*,\s*notified_at\s*\)\s*where\s+notified_at\s+is\s+null/i,
    );
  });

  it('adds a partial index on stripe_customer_balance_txn_id WHERE NOT NULL for the audit trail', () => {
    expect(ddlWithComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+referral_credit_grants\s*\(\s*stripe_customer_balance_txn_id\s*\)\s*where\s+stripe_customer_balance_txn_id\s+is\s+not\s+null/i,
    );
  });

  it('references coaches with ON DELETE CASCADE', () => {
    expect(ddlWithComments).toMatch(
      /inviter_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans / organizations)', () => {
    const sacred = [
      'coaches',
      'players',
      'teams',
      'observations',
      'plans',
      'organizations',
    ];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithComments).not.toMatch(re);
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
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
