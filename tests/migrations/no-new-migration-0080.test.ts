/**
 * Ticket 0080 — pin the migration count after the new
 * parent_forward_signals_cross_team migration lands.
 *
 * This guard freezes the migration count at the value present after
 * 0080 ships so a future drift surfaces on the PR's `unit-tests` gate
 * rather than as a CI seed-step regression weeks later (cf.
 * LESSONS#0006: the seed step runs under `ON_ERROR_STOP=1` against
 * EVERY tracked migration, so a stray migration lands as a latent
 * fresh-CI fail).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('Ticket 0080 — no new migration files (regression)', () => {
  it('the supabase/migrations directory has exactly the count pinned at 0080', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    // Bumped 71 → 72 by ticket 0080 (the cross_team flag widening lands
    // at prefix 071 — the next free prefix after 070_coach_thank_messages.
    // Per LESSONS#0096 the ticket's `070` prose was reconciled to the
    // schema's actual next-free integer).
    //
    // Bumped 72 → 73 by ticket 0087 (the org_card_snoozes table backs
    // the new program-org-tier upgrade card's "Maybe later" button; the
    // migration lands at prefix 072 — the next free prefix after the
    // 0080 widening at 071).
    //
    // Bumped 73 → 74 by ticket 0088 (the coach_first_signal_celebrations
    // table backs the new first-cross-coach-signal activation card's
    // per-(coach, kind) dedup; the migration lands at prefix 073 — the
    // next free prefix after 072_org_card_snoozes).
    //
    // Bumped 74 → 75 by ticket 0089 (the paid_receipts_dedup_kind
    // migration widens the 0088 CHECK enum to add 'paid_receipts_d60'
    // AND adds organizations.paid_since_at with a one-time backfill
    // and a BEFORE UPDATE trigger; the migration lands at prefix 074
    // — the next free prefix after 073_coach_first_signal_celebrations).
    //
    // Bumped 75 → 76 by ticket 0090 (the program_drill_canon table
    // backs the new institutional drill-canon artifact a director
    // publishes once per program AND widens the 0088 CHECK enum to add
    // 'program_canon_inherited' for the /plans inheritance banner's
    // dedup; the migration lands at prefix 075 — the next free prefix
    // after 074_paid_receipts_dedup_kind).
    //
    // Bumped 76 → 77 by ticket 0091 (the organizations
    // opted_out_of_sport_pulse boolean backs the director's
    // program-scoped opt-out from the sport-wide convergence pulse's
    // named-program list AND widens the 0088 CHECK enum to add
    // 'sport_pulse_named' for the director-side celebration when their
    // program is named on the sport-wide pulse; the migration lands at
    // prefix 076 — the next free prefix after 075_program_drill_canon).
    //
    // Bumped 77 → 78 by ticket 0092 (the recurring_observer_dismissals
    // table is the per-(coach, helper_identifier, team) dedup primitive
    // for the /home real-co-coach card's "Not yet" button. A NEW small
    // table beats reusing the 0088 coach_first_signal_celebrations
    // widen because that table's UNIQUE (coach_id, kind) cannot encode
    // the helper-team composite key without breaking the 0088 dedup
    // contract; the migration lands at prefix 077 — the next free
    // prefix after 076_organizations_opt_out_sport_pulse).
    expect(files.length).toBe(78);
  });
});
