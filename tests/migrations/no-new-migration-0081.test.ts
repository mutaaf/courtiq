/**
 * Ticket 0081 — pin the migration count after the new
 * coach_thank_messages migration lands.
 *
 * This guard freezes the migration count at the value present after
 * 0081 ships so a future drift surfaces on the PR's `unit-tests` gate
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

describe('Ticket 0081 — no new migration files (regression)', () => {
  it('the supabase/migrations directory has exactly the count pinned at 0081', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    // Bumped 70 → 71 by ticket 0081 (coach_thank_messages landed at
    // prefix 070 — the next free prefix after 069_parent_forward_signals).
    expect(files.length).toBe(71);
  });
});
