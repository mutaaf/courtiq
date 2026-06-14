/**
 * Ticket 0081 — migration 070_coach_thank_messages.sql.
 *
 * Asserts the structural shape of the new `coach_thank_messages`
 * table — the first IN-PRODUCT DM primitive shipped by the
 * publish-clone-stick loop. ONE message per (sender, recipient,
 * share) pair FOREVER (the UNIQUE constraint is the load-bearing
 * anti-spam contract — there is no thread, no reply).
 *
 * COPPA: scans executable DDL with `--` comment lines stripped per
 * LESSONS#0088 AND the structural identifier names stripped per
 * LESSONS#0114 — the table/column identifiers contain inherited
 * tokens but are structural (a coach-to-coach thank-you edge), not
 * minor data.
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/070_coach_thank_messages.sql',
);
const raw = readFileSync(MIGRATION_PATH, 'utf-8');

// LESSONS#0088 — strip `--` comment lines so the COPPA scan reads
// only executable DDL (the header documents what we deliberately
// do NOT add).
const ddlWithoutComments = raw
  .split('\n')
  .filter((l) => !l.trim().startsWith('--'))
  .join('\n');

// LESSONS#0114 — strip the structural identifier names before the
// banned-token sweep. The table + column names contain inherited
// tokens but are structural (a thank-you edge), not minor data.
const ddlForBannedSweep = ddlWithoutComments
  .replace(/coach_thank_messages/g, '')
  .replace(/sender_coach_id/g, '')
  .replace(/recipient_coach_id/g, '')
  .replace(/drill_share_id/g, '')
  .replace(/plan_share_id/g, '')
  .replace(/milestone_id/g, '')
  .replace(/sent_at/g, '')
  .replace(/read_at/g, '');

describe('migration 070_coach_thank_messages.sql (ticket 0081)', () => {
  it('creates the coach_thank_messages table with the allow-listed columns only', () => {
    expect(ddlWithoutComments).toMatch(
      /create\s+table\s+if\s+not\s+exists\s+coach_thank_messages/i,
    );

    const allowList = [
      /id\s+uuid/i,
      /sender_coach_id\s+uuid/i,
      /recipient_coach_id\s+uuid/i,
      /drill_share_id\s+uuid/i,
      /plan_share_id\s+uuid/i,
      /milestone_id\s+uuid/i,
      /body\s+text/i,
      /sent_at\s+timestamptz/i,
      /read_at\s+timestamptz/i,
    ];
    for (const re of allowList) {
      expect(ddlWithoutComments).toMatch(re);
    }
  });

  it('enforces UNIQUE(sender_coach_id, recipient_coach_id, drill_share_id) so each drill thank is one-shot per edge FOREVER', () => {
    expect(ddlWithoutComments).toMatch(
      /unique\s*\(\s*sender_coach_id\s*,\s*recipient_coach_id\s*,\s*drill_share_id\s*\)/i,
    );
  });

  it('enforces UNIQUE(sender_coach_id, recipient_coach_id, plan_share_id) so each plan thank is one-shot per edge FOREVER', () => {
    expect(ddlWithoutComments).toMatch(
      /unique\s*\(\s*sender_coach_id\s*,\s*recipient_coach_id\s*,\s*plan_share_id\s*\)/i,
    );
  });

  it('enforces a CHECK requiring at least one of drill_share_id / plan_share_id', () => {
    expect(ddlWithoutComments).toMatch(
      /check\s*\(\s*\(\s*drill_share_id\s+is\s+not\s+null\s*\)\s+or\s+\(\s*plan_share_id\s+is\s+not\s+null\s*\)\s*\)/i,
    );
  });

  it('adds an index on (recipient_coach_id, read_at NULLS FIRST, sent_at DESC) for the inbox fetch', () => {
    expect(ddlWithoutComments).toMatch(
      /create\s+index\s+if\s+not\s+exists\s+\w+\s+on\s+coach_thank_messages\s*\(\s*recipient_coach_id\s*,\s*read_at\s+nulls\s+first\s*,\s*sent_at\s+desc\s*\)/i,
    );
  });

  it('references coaches(id) on sender_coach_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /sender_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references coaches(id) on recipient_coach_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /recipient_coach_id\s+uuid[^,]*references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references drill_shares(id) on drill_share_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /drill_share_id\s+uuid[^,]*references\s+drill_shares\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references practice_plan_shares(id) on plan_share_id with ON DELETE CASCADE', () => {
    expect(ddlWithoutComments).toMatch(
      /plan_share_id\s+uuid[^,]*references\s+practice_plan_shares\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i,
    );
  });

  it('references coach_reputation_milestones(id) on milestone_id with ON DELETE SET NULL', () => {
    expect(ddlWithoutComments).toMatch(
      /milestone_id\s+uuid[^,]*references\s+coach_reputation_milestones\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/i,
    );
  });

  it('never adds a column to a sacred table (coaches / players / teams / observations / plans)', () => {
    const sacred = ['coaches', 'players', 'teams', 'observations', 'plans'];
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
    ];
    for (const word of banned) {
      expect(ddlForBannedSweep.toLowerCase()).not.toContain(word);
    }
  });
});
