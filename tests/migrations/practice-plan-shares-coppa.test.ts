/**
 * Ticket 0049 — practice_plan_shares migration (publish + clone a practice plan).
 *
 * The migration adds ONE new table (`practice_plan_shares`) mapping a public
 * token to ONE practice plan and the publishing coach, plus a partial index on
 * `token` (active rows only) and a per-coach index for the publisher's "my
 * published plans" listing. It also adds ONE nullable column to `plans`
 * (`source_plan_id UUID NULL REFERENCES plans(id) ON DELETE SET NULL`) so a
 * cloned practice plan carries attribution back to the source plan.
 *
 * COPPA: this table NEVER references a player. The public read renders ONLY
 * team-level practice-plan content (drill name + duration + focus area), so
 * even a future plan type that embedded a minor name would not cross because
 * the route hard-pins `type = 'practice'`. The banned-token scan strips `--`
 * comment lines per LESSONS#0088 so the header comment can legitimately
 * document what the migration does NOT add (e.g. parent / observation /
 * medical) without tripping the test.
 *
 * .test.ts NOT .spec.ts — LESSONS#38. The migration test mirrors
 * tests/migrations/players-released-at.test.ts (ticket 0052) byte-for-byte
 * where applicable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /practice.?plan.?shares/i.test(f));
  if (!match) throw new Error('No practice_plan_shares migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the COPPA banned-token scan only reads DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('practice_plan_shares migration (ticket 0049)', () => {
  it('creates the practice_plan_shares table with EXACTLY the seven columns', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?practice_plan_shares/);

    // Required columns by name + (loose) type. The full ALLOW-LIST is asserted
    // by the keyset test below — this just confirms each named column appears.
    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\btoken\b[^,]*text[^,]*not\s+null[^,]*unique/);
    expect(lower).toMatch(/\bplan_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bcoach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bnote\b\s+text/);
    expect(lower).toMatch(/\bis_active\b[^,]*boolean[^,]*not\s+null[^,]*default\s+true/);
    expect(lower).toMatch(/\bcreated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    // FKs with ON DELETE CASCADE on both plans and coaches — mirrors 035.
    expect(lower).toMatch(/references\s+plans\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
  });

  it('table column allow-list is exactly the seven AC columns (keyset)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Extract the CREATE TABLE practice_plan_shares (...) body.
    const m = lower.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?practice_plan_shares\s*\(([\s\S]*?)\)\s*;/);
    expect(m, 'CREATE TABLE body for practice_plan_shares').toBeTruthy();
    const body = m![1];

    // Top-level column lines only: split on commas that are NOT inside parens.
    // Each column line starts with the column identifier as the first token.
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
      // Skip table-level constraints (PRIMARY KEY (...), CONSTRAINT …, UNIQUE (…), FOREIGN KEY …).
      if (/^(primary\s+key|constraint|unique|foreign\s+key|check)\b/i.test(trimmed)) continue;
      const idMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\b/i);
      if (idMatch) columns.add(idMatch[1].toLowerCase());
    }

    expect(Array.from(columns).sort()).toEqual([
      'coach_id',
      'created_at',
      'id',
      'is_active',
      'note',
      'plan_id',
      'token',
    ]);
  });

  it('adds the partial token index (hot path) and the per-coach index', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Partial token index — the public-page resolver's single hot lookup.
    expect(lower).toMatch(/create\s+index[\s\S]*practice_plan_shares\s*\(\s*token\s*\)[\s\S]*where\s+is_active/);

    // Per-coach listing index — ordered by created_at DESC.
    expect(lower).toMatch(/create\s+index[\s\S]*practice_plan_shares\s*\(\s*coach_id\s*,\s*created_at[^)]*\)/);
  });

  it('adds plans.source_plan_id as a nullable self-FK with ON DELETE SET NULL', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/alter\s+table\s+plans/);
    expect(lower).toMatch(/source_plan_id\s+uuid/);
    expect(lower).toMatch(/references\s+plans\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/);

    // Nullable: every existing plan keeps source_plan_id IS NULL after the
    // migration. A NOT NULL would break every existing plan row.
    expect(lower).not.toMatch(/source_plan_id\s+uuid\s+not\s+null/);
  });

  it('contains NO banned descriptive-minor tokens in the executable DDL (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    for (const banned of ['player', 'parent', 'observation', 'medical']) {
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
