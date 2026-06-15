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
    expect(files.length).toBe(72);
  });
});
