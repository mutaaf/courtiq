/**
 * Ticket 0089 — migration 074_paid_receipts_dedup_kind.sql.
 *
 * Asserts the structural shape of the migration that:
 *  - widens the CHECK enum on coach_first_signal_celebrations to
 *    include 'paid_receipts_d60' (strict SUPERSET of 0088's set);
 *  - adds organizations.paid_since_at (TIMESTAMPTZ);
 *  - installs a BEFORE UPDATE trigger that stamps paid_since_at on
 *    the first transition into a paid-grace status, so the Stripe
 *    webhook handler stays byte-identical;
 *  - re-grants service_role privileges (LESSONS#0094);
 *  - never adds a column to a sacred table (coaches / players /
 *    teams / observations / plans);
 *  - never references a per-minor field (COPPA).
 *
 * LESSONS#0088 — strip `--` comment lines before the banned-token scan
 * since the header documents what the migration deliberately does NOT
 * carry. LESSONS#0067 — strip structural identifiers that contain a
 * banned token (`paid_receipts_d60` is a billing enum literal, not a
 * minor-data field).
 *
 * LESSONS#0006 — migration prefix uniqueness is reasserted here so the
 * fresh-CI seed step never trips on a duplicate `<NN>_` prefix.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #0038).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations');
const MIGRATION_PATH = join(MIGRATIONS_DIR, '074_paid_receipts_dedup_kind.sql');
const raw = readFileSync(MIGRATION_PATH, 'utf-8');
const ddlWithComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');
// LESSONS#0067 — strip structural identifiers whose names contain a
// billing/retention token before the banned-token sweep.
const ddlForBannedSweep = ddlWithComments
  .replace(/paid_receipts_d60/g, '')
  .replace(/coach_first_signal_celebrations/g, '')
  .replace(/paid_since_at/g, '')
  .replace(/set_organizations_paid_since_at/g, '')
  .replace(/trg_organizations_set_paid_since_at/g, '');

describe('migration 074_paid_receipts_dedup_kind.sql (ticket 0089)', () => {
  it('uses a unique numeric prefix (no two migrations share a leading version token)', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const prefixes = files
      .map((f) => f.match(/^(\d+)_/)?.[1])
      .filter((p): p is string => Boolean(p));
    const counts = new Map<string, number>();
    for (const p of prefixes) counts.set(p, (counts.get(p) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1);
    expect(dupes).toEqual([]);
  });

  it('drops and re-adds the kind CHECK constraint on coach_first_signal_celebrations', () => {
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+coach_first_signal_celebrations\s+drop\s+constraint\s+if\s+exists\s+coach_first_signal_celebrations_kind_check/i,
    );
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+coach_first_signal_celebrations\s+add\s+constraint\s+coach_first_signal_celebrations_kind_check\s+check\s*\(\s*kind\s+in\s*\(/i,
    );
  });

  it('widens the CHECK enum to the strict SUPERSET of the 0088 set + paid_receipts_d60', () => {
    for (const kind of [
      'clone',
      'thank',
      'parent_forward',
      'parent_forward_cross_team',
      'reaction_cross_team',
      'paid_receipts_d60',
    ]) {
      expect(ddlWithComments).toMatch(new RegExp(`'${kind}'`));
    }
  });

  it('adds organizations.paid_since_at as an additive TIMESTAMPTZ column (no required default)', () => {
    expect(ddlWithComments).toMatch(
      /alter\s+table\s+organizations\s+add\s+column\s+if\s+not\s+exists\s+paid_since_at\s+timestamptz/i,
    );
  });

  it('installs a BEFORE UPDATE trigger on organizations so the webhook stays byte-identical', () => {
    expect(ddlWithComments).toMatch(
      /create\s+(or\s+replace\s+)?function\s+set_organizations_paid_since_at/i,
    );
    expect(ddlWithComments).toMatch(
      /create\s+trigger\s+\w+\s+before\s+update\s+of\s+subscription_status\s+on\s+organizations/i,
    );
  });

  it('backfills paid_since_at for existing paid-grace orgs (no per-row mutation lost)', () => {
    expect(ddlWithComments).toMatch(
      /update\s+organizations[\s\S]+set\s+paid_since_at\s*=\s*coalesce[\s\S]+where[\s\S]+subscription_status\s+in\s*\(\s*'active'/i,
    );
  });

  it('includes a service-role GRANT block (LESSONS#0094)', () => {
    expect(ddlWithComments).toMatch(/grant[^;]+to\s+service_role/i);
  });

  it('does NOT use a partial index with a NOW() predicate (LESSONS#0087)', () => {
    const createIndexBlocks = ddlWithComments.match(/create\s+index[^;]+;/gi) ?? [];
    for (const block of createIndexBlocks) {
      const lower = block.toLowerCase();
      expect(/\bwhere\b[\s\S]*\bnow\s*\(\s*\)/i.test(lower)).toBe(false);
      expect(/\bwhere\b[\s\S]*\bcurrent_date\b/i.test(lower)).toBe(false);
      expect(/\bwhere\b[\s\S]*\bcurrent_timestamp\b/i.test(lower)).toBe(false);
    }
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans'];
    for (const table of sacred) {
      const re = new RegExp(`alter\\s+table\\s+${table}\\s+add\\s+column`, 'i');
      expect(ddlWithComments).not.toMatch(re);
    }
  });

  it('does not introduce any per-minor field (COPPA)', () => {
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

  it('Stripe webhook handler is not touched by this migration (no reference to the webhook code path)', () => {
    // The migration must not name the webhook handler file or any
    // src/* path — it's a pure data-shape change.
    expect(ddlWithComments).not.toMatch(/src\/app\/api\/stripe/i);
  });
});
