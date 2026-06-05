/**
 * Ticket 0066 — assert NO new migration ships with the thin-week safety net.
 *
 * The ticket explicitly forbids a new migration: the route reuses the existing
 * `parent_reports` (`plans` rows with `type = 'parent_report'`) and
 * `observations` shapes; no new column, no new table. This guard freezes the
 * migration count at the value present when 0066 landed so a future drift
 * surfaces on the PR's `unit-tests` gate rather than as a CI seed-step
 * regression weeks later (cf. LESSONS#0006: the seed step runs under
 * `ON_ERROR_STOP=1` against EVERY tracked migration, so a stray migration
 * lands as a latent fresh-CI fail).
 *
 * `.test.ts` (NOT `.spec.ts`) per LESSONS#0020 / #38.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

describe('Ticket 0066 — no new migration files (regression)', () => {
  it('the supabase/migrations directory has exactly the count pinned at 0066', () => {
    const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    // Pinned at the count present when 0066 was implemented. If a sibling
    // ticket legitimately adds a migration in the same window, bump this
    // constant and call out the deviation in the bumping ticket's
    // Implementation log. Bumped 61 → 62 by ticket 0067 (sub_handoffs
    // landed at prefix 061 — 059/060 already taken by drill_shares and
    // coach_director_contacts). Bumped 62 → 63 by ticket 0068
    // (season_opener_shares landed at prefix 062).
    expect(files.length).toBe(63);
  });
});
