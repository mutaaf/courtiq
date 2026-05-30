/**
 * Ticket 0057 — weekly_pulse_shares migration.
 *
 * Mirrors tests/migrations/practice-plan-shares-coppa.test.ts byte-for-byte
 * where applicable. The migration adds ONE new table that maps a public token
 * to:
 *   - the publishing coach (FK coaches.id ON DELETE CASCADE)
 *   - the team whose week is being summarized (FK teams.id ON DELETE CASCADE)
 *   - the ISO week (e.g. '2026-W22')
 *   - an optional caption
 * plus a partial token index (active rows only) and a per-coach (coach_id,
 * created_at DESC) index.
 *
 * COPPA: the table NEVER references a player and NEVER stores a parent
 * contact. The public render path is team-level aggregates only (no minor
 * names, no observation text, no parent contact). The banned-token scan
 * strips `--` comment lines per LESSONS#0088 so the header comment can
 * legitimately document what the table does NOT add (e.g. parent /
 * observation / medical / dob) without tripping the test.
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /weekly.?pulse.?shares/i.test(f));
  if (!match) throw new Error('No weekly_pulse_shares migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the COPPA banned-token scan only reads DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('weekly_pulse_shares migration (ticket 0057)', () => {
  it('creates the weekly_pulse_shares table with EXACTLY the eight columns', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?weekly_pulse_shares/);

    // Required columns by name + (loose) type. The full ALLOW-LIST is asserted
    // by the keyset test below — this just confirms each named column appears.
    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\btoken\b[^,]*text[^,]*not\s+null[^,]*unique/);
    expect(lower).toMatch(/\bcoach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bteam_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\biso_week\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bcaption\b\s+text/);
    expect(lower).toMatch(/\bis_active\b[^,]*boolean[^,]*not\s+null[^,]*default\s+true/);
    expect(lower).toMatch(/\bcreated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    // FKs with ON DELETE CASCADE on both coaches and teams.
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+teams\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
  });

  it('declares the (coach_id, team_id, iso_week) idempotency UNIQUE constraint', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    // The constraint guarantees a coach who taps Publish twice in the same
    // week ends up with ONE row, not two — the create route's idempotent
    // reuse is the happy-path; this is the defense-in-depth guard.
    expect(lower).toMatch(/unique\s*\(\s*coach_id\s*,\s*team_id\s*,\s*iso_week\s*\)/);
  });

  it('table column allow-list is exactly the eight AC columns (keyset)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Extract the CREATE TABLE weekly_pulse_shares (...) body.
    const m = lower.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?weekly_pulse_shares\s*\(([\s\S]*?)\)\s*;/);
    expect(m, 'CREATE TABLE body for weekly_pulse_shares').toBeTruthy();
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
      'caption',
      'coach_id',
      'created_at',
      'id',
      'is_active',
      'iso_week',
      'team_id',
      'token',
    ]);
  });

  it('adds the partial token index (hot path) and the per-coach index', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Partial token index — the public-page resolver's single hot lookup.
    expect(lower).toMatch(/create\s+index[\s\S]*weekly_pulse_shares\s*\(\s*token\s*\)[\s\S]*where\s+is_active/);

    // Per-coach listing index — ordered by created_at DESC.
    expect(lower).toMatch(/create\s+index[\s\S]*weekly_pulse_shares\s*\(\s*coach_id\s*,\s*created_at[^)]*\)/);
  });

  it('contains NO banned descriptive-minor tokens in the executable DDL (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // No player_id, no parent contact, no observation text, no medical field,
    // no dob — and no `name` column (the coach + team name are joined live by
    // the public route from the existing tables; the share row carries none).
    for (const banned of ['player', 'parent', 'observation', 'medical', 'dob']) {
      expect(lower).not.toContain(banned);
    }
    // The `name` token is delicate: the DDL legitimately contains 'name' as a
    // substring in column names like is_active / coach_id / team_id, so we
    // must check that no top-level column actually equals `name` or `*_name`.
    expect(lower).not.toMatch(/\b(name|full_name|first_name|last_name|player_name|parent_name)\s+(text|varchar)/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
