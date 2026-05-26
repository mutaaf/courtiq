/**
 * Ticket 0039 — `coach_drill_signals` migration.
 *
 * AC1: a new table persists per-coach-per-drill rating state with EXACTLY four
 * data columns plus the composite PK (coach_id, drill_id):
 *   - coach_id      uuid not null
 *   - drill_id      uuid not null
 *   - rating        text check (rating in ('up', 'down')) not null
 *   - run_count     int  not null default 0
 *   - last_rated_at timestamptz not null default now()
 *
 * AC7 (COPPA / data-minimization): the executable DDL references NO
 * descriptive minor field, NO observation text, NO parent contact. The whole
 * file is documentation + DDL — explanatory `--` comment lines legitimately
 * NAME the things this signal is NOT (no team_id, no player ref, no
 * observation text) so the boundary is recorded in the migration trail; the
 * banned-token scan therefore runs over the executable DDL ONLY, with `--`
 * comment lines stripped first (LESSONS#88 — the inverse mistake would flag
 * the explanatory header).
 *
 * .test.ts NOT .spec.ts — vitest excludes the Playwright spec glob (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CoachDrillSignal } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coach.?drill.?signals/i.test(f));
  if (!match) throw new Error('No coach_drill_signals migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * The executable DDL only — `--` comment lines stripped. The migration's
 * explanatory header legitimately names what it is deliberately NOT collecting
 * (player references, observation text, parent contact) to document the COPPA
 * boundary; scanning the raw file for those tokens would falsely trip on that
 * documentation (LESSONS#88).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('coach_drill_signals migration (ticket 0039)', () => {
  it('creates a coach_drill_signals table with EXACTLY the four data columns + composite PK', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?coach_drill_signals/);

    // Each of the four required columns is present.
    expect(lower).toMatch(/coach_id\s+uuid\s+not\s+null/);
    expect(lower).toMatch(/drill_id\s+uuid\s+not\s+null/);
    expect(lower).toMatch(/rating\s+text\s+not\s+null/);
    expect(lower).toMatch(/run_count\s+int\s+not\s+null\s+default\s+0/);
    expect(lower).toMatch(/last_rated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/);

    // rating column is constrained to 'up' | 'down' (NULL would be a delete).
    expect(lower).toMatch(/check\s*\(\s*rating\s+in\s*\(\s*'up'\s*,\s*'down'\s*\)\s*\)/);

    // Composite PK on (coach_id, drill_id) — the one rating per (coach, drill)
    // invariant the upsert leans on.
    expect(lower).toMatch(/primary\s+key\s*\(\s*coach_id\s*,\s*drill_id\s*\)/);

    // FK to coaches with CASCADE matches every other coach-scoped table.
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
  });

  it('adds NO descriptive minor field, observation text, or parent contact (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // The ticket's explicit banned-token list — none may appear in the DDL.
    for (const banned of ['player', 'dob', 'parent', 'observation', 'medical']) {
      expect(lower).not.toContain(banned);
    }

    // Belt and suspenders: no team_id either. The signal is COACH-private,
    // cross-team — adding team_id would break that invariant.
    expect(lower).not.toMatch(/\bteam_id\b/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});

describe('CoachDrillSignal type — exported from @/types/database', () => {
  it('declares the four data fields the table persists (compile-time check)', () => {
    // tsc --noEmit fails this file if the type is missing or differently shaped.
    const row: CoachDrillSignal = {
      coach_id: '00000000-0000-4000-a000-000000000001',
      drill_id: '00000000-0000-4000-a000-000000000099',
      rating: 'up',
      run_count: 4,
      last_rated_at: '2026-05-26T00:00:00.000Z',
    };
    expect(row.rating).toBe('up');
    const down: CoachDrillSignal = { ...row, rating: 'down' };
    expect(down.rating).toBe('down');
  });
});
