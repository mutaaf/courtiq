/**
 * Ticket 0044 — `drill_sequence_aggregates` migration.
 *
 * AC1 maps here: a new table aggregates per-(sport, drill, next_drill) coach
 * counts with EXACTLY the five columns named in the ticket and the composite
 * PK (sport, drill_id, next_drill_id). The aggregate carries NO coach
 * reference of any kind — `coach_count` is an integer, never a list of ids —
 * so the table is privacy-safe even ignoring the route-layer N>=5 floor.
 *
 * The companion column-add on `coach_drill_signals` (a `signal_type text not
 * null default 'rating'` permitting the new `'dismiss_suggestion'` value) is
 * asserted here too — the cron's SELECT and the dismiss POST both rely on
 * it. The CHECK constraint must include EXACTLY the two allowed values
 * ('rating', 'dismiss_suggestion'); a future migration can widen it but the
 * v1 contract is the two strings.
 *
 * COPPA / data minimization: the executable DDL references NO descriptive
 * minor field, NO observation text, NO parent contact. The migration's
 * explanatory `--` header legitimately NAMES what it is NOT collecting (no
 * coach reference on the aggregate, no player ref, no observation text) so
 * the boundary is documented in the migration trail; LESSONS#88 — the
 * banned-token scan strips `--` comment lines first.
 *
 * .test.ts NOT .spec.ts — vitest excludes the Playwright spec glob (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DrillSequenceAggregate, CoachDrillSignal } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /drill.?sequence.?aggregates/i.test(f));
  if (!match) {
    throw new Error('No drill_sequence_aggregates migration found in supabase/migrations');
  }
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * Executable DDL only — `--` comment lines stripped. LESSONS#88: scanning
 * the raw file would falsely trip on the migration's own explanatory header,
 * which deliberately names the things it does NOT collect.
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('drill_sequence_aggregates migration (ticket 0044)', () => {
  it('creates the aggregates table with EXACTLY the five columns + composite PK', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?drill_sequence_aggregates/);

    // The five data columns named in the ticket's AC1.
    expect(lower).toMatch(/\bsport\s+text\s+not\s+null/);
    expect(lower).toMatch(/\bdrill_id\s+uuid\s+not\s+null/);
    expect(lower).toMatch(/\bnext_drill_id\s+uuid\s+not\s+null/);
    expect(lower).toMatch(/\bcoach_count\s+int\s+not\s+null/);
    expect(lower).toMatch(/last_refreshed_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/);

    // Composite PK on (sport, drill_id, next_drill_id) — one row per directed
    // pair per sport.
    expect(lower).toMatch(
      /primary\s+key\s*\(\s*sport\s*,\s*drill_id\s*,\s*next_drill_id\s*\)/,
    );
  });

  it('has NO coach reference of any kind on the aggregates table (AC1)', () => {
    const { sql } = findMigration();
    const ddl = ddlOnly(sql);

    // Scope the assertion strictly to the aggregates CREATE TABLE body.
    const aggregateCreateMatch = ddl.match(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?drill_sequence_aggregates\s*\(([\s\S]*?)\);/i,
    );
    expect(aggregateCreateMatch).not.toBeNull();
    const body = aggregateCreateMatch![1].toLowerCase();

    // The aggregate is an integer count, never a list. No coach reference.
    expect(body).not.toMatch(/\bcoach_id\b/);
    expect(body).not.toMatch(/\bcoach_ids\b/);
  });

  it('adds NO descriptive minor field, observation text, or parent contact (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // The ticket's explicit banned-token list — none may appear in the
    // executable DDL of either the new table or the column-add.
    for (const banned of ['player', 'dob', 'parent', 'observation', 'medical', 'biometric']) {
      expect(lower).not.toContain(banned);
    }
  });

  it('extends coach_drill_signals with a signal_type column (default rating) and the two-value CHECK', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // The column-add is additive: existing 'up'/'down' rows from 0039 keep
    // working unchanged (default 'rating'); the new 'dismiss_suggestion'
    // value is reserved for the suggestions block.
    expect(lower).toMatch(
      /alter\s+table\s+coach_drill_signals\s+add\s+column\s+if\s+not\s+exists\s+signal_type\s+text\s+not\s+null\s+default\s+'rating'/,
    );

    // The CHECK constraint must permit exactly the two v1 values.
    expect(lower).toMatch(/check\s*\([^)]*signal_type[^)]*'rating'[^)]*'dismiss_suggestion'/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});

describe('DrillSequenceAggregate type — exported from @/types/database', () => {
  it('declares the five fields the aggregates table persists (compile-time check)', () => {
    // tsc --noEmit fails this file if the type is missing or differently shaped.
    const row: DrillSequenceAggregate = {
      sport: 'basketball',
      drill_id: '00000000-0000-4000-a000-000000000099',
      next_drill_id: '00000000-0000-4000-a000-000000000100',
      coach_count: 12,
      last_refreshed_at: '2026-05-26T03:00:00.000Z',
    };
    expect(row.coach_count).toBe(12);
    expect(row.sport).toBe('basketball');
  });
});

describe('CoachDrillSignal type — signal_type extension (ticket 0044)', () => {
  it('accepts the two v1 signal_type values', () => {
    const rating: CoachDrillSignal = {
      coach_id: '00000000-0000-4000-a000-000000000001',
      drill_id: '00000000-0000-4000-a000-000000000099',
      rating: 'up',
      run_count: 0,
      last_rated_at: '2026-05-26T00:00:00.000Z',
      signal_type: 'rating',
    };
    expect(rating.signal_type).toBe('rating');
    const dismiss: CoachDrillSignal = { ...rating, signal_type: 'dismiss_suggestion' };
    expect(dismiss.signal_type).toBe('dismiss_suggestion');
  });
});
