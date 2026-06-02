/**
 * Ticket 0063 — coach_follows migration (named, persistent coach-to-coach edge).
 *
 * The migration adds ONE new table (`coach_follows`) — a coach-to-coach "I want
 * to see this publisher's next drops" persistent edge. No new column on
 * `coaches` or `plans` (the publisher-notification bookmark rides on the
 * existing `coaches.preferences` jsonb, mirroring 0049's clone-count seen
 * bookmark). The table includes:
 *
 *   id          uuid primary key default gen_random_uuid()
 *   follower_id uuid not null references coaches(id) on delete cascade
 *   followee_id uuid not null references coaches(id) on delete cascade
 *   created_at  timestamptz not null default now()
 *
 * Constraints:
 *   unique (follower_id, followee_id)             — idempotent follow
 *   check  (follower_id <> followee_id)           — no self-follow
 *
 * Indexes:
 *   (follower_id, created_at desc) — "who I follow" lookup
 *   (followee_id, created_at desc) — publisher's follower list + dedup
 *
 * COPPA: the table is COACH-TO-COACH only — no player, parent, or minor
 * reference. The banned-token scan strips `--` comment lines per LESSONS#0088.
 *
 * Migration prefix deviation: 056 and 057 are already taken at pickup; this
 * ships as `058_coach_follows.sql` (LESSONS#0006). The test asserts the
 * prefix is unique without pinning the literal number, so a future re-numbering
 * does not break the suite.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coach.?follows/i.test(f));
  if (!match) throw new Error('No coach_follows migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the banned-token scan only reads DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('coach_follows migration (ticket 0063)', () => {
  it('creates the coach_follows table with EXACTLY the four AC columns', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?coach_follows/);

    // Required columns by name + (loose) type. The full ALLOW-LIST is asserted
    // by the keyset test below — this just confirms each named column appears.
    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\bfollower_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bfollowee_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bcreated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    // FKs with ON DELETE CASCADE on coaches (both follower and followee).
    const cascadeMatches = lower.match(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/g);
    expect(cascadeMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('table column allow-list is exactly the four AC columns (keyset)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    const m = lower.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?coach_follows\s*\(([\s\S]*?)\)\s*;/);
    expect(m, 'CREATE TABLE body for coach_follows').toBeTruthy();
    const body = m![1];

    // Top-level column lines only: split on commas that are NOT inside parens.
    let depth = 0;
    const lines: string[] = [];
    let cur = '';
    for (const ch of body) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        lines.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) lines.push(cur.trim());

    const columns = new Set<string>();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Skip table-level constraints.
      if (/^(primary\s+key|constraint|unique|foreign\s+key|check)\b/i.test(trimmed)) continue;
      const idMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\b/i);
      if (idMatch) columns.add(idMatch[1].toLowerCase());
    }

    expect(Array.from(columns).sort()).toEqual([
      'created_at',
      'followee_id',
      'follower_id',
      'id',
    ]);
  });

  it('enforces UNIQUE(follower_id, followee_id) for idempotent follow', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Either a table-level UNIQUE (follower_id, followee_id) or a column-level
    // composite constraint. The minimum predicate is that both fields appear
    // together inside a unique constraint clause.
    expect(lower).toMatch(/unique\s*\(\s*follower_id\s*,\s*followee_id\s*\)/);
  });

  it('enforces CHECK(follower_id <> followee_id) to block self-follow', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/check\s*\([^)]*follower_id\s*<>\s*followee_id[^)]*\)/);
  });

  it('adds the follower-side and followee-side indexes (created_at desc)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+index[\s\S]*coach_follows\s*\(\s*follower_id\s*,\s*created_at[^)]*\)/);
    expect(lower).toMatch(/create\s+index[\s\S]*coach_follows\s*\(\s*followee_id\s*,\s*created_at[^)]*\)/);
  });

  it('does NOT add a new column on coaches or plans (COPPA / scope guard)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // The migration scope is the new table + its indexes ONLY.
    expect(lower).not.toMatch(/alter\s+table\s+coaches/);
    expect(lower).not.toMatch(/alter\s+table\s+plans/);
  });

  it('contains NO banned descriptive-minor tokens in the executable DDL (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    for (const banned of ['player', 'parent', 'observation', 'medical', 'dob', 'biometric']) {
      expect(lower).not.toContain(banned);
    }
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
