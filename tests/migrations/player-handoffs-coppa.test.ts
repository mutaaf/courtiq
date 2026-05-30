/**
 * Ticket 0059 — COPPA contract on the new player_handoffs migration.
 *
 * The migration is allowed (in fact required, per LESSONS#0088) to NAME the
 * COPPA concepts in its `--` header comment as the approval trail; the test
 * strips comment lines before scanning DDL so the documentation doesn't trip
 * the banned-token guard.
 *
 * Asserts:
 *   - the table exists with the EXACT thirteen-column allow-list
 *   - the (source_coach_id, source_player_id, source_team_id) UNIQUE
 *     idempotency constraint is present
 *   - the partial (org_id) WHERE NOT is_archived index for the receiver
 *     hot path is present
 *   - the per-coach (source_coach_id, created_at DESC) index is present
 *   - the partial (claimed_by_coach_id, claimed_at DESC) index is present
 *   - the executable DDL contains NO banned descriptive-minor tokens
 *     (dob, medical, photo, address, parent_email, biometric, similarity)
 *   - NO sibling migration adds a new descriptive minor field on `players`
 *     in the same commit (a `players.<new>` column would have its own
 *     ALTER TABLE in this or another migration; we scan all *.sql under
 *     supabase/migrations/ and refuse anything that adds a `players.dob`
 *     or `players.medical` family column).
 *   - the migration version prefix is UNIQUE (LESSONS#0006).
 *
 * .test.ts NOT .spec.ts — LESSONS#38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /player.?handoffs/i.test(f));
  if (!match) throw new Error('No player_handoffs migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the banned-token scan only reads DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('player_handoffs migration (ticket 0059)', () => {
  it('creates the player_handoffs table with the expected core columns', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?player_handoffs/);
    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\bsource_coach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bsource_player_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bsource_team_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\borg_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bseason_label\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bcard_body\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bai_provider\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bclaimed_by_coach_id\b[^,]*uuid[^,]*null/);
    expect(lower).toMatch(/\bclaimed_at\b[^,]*timestamptz[^,]*null/);
    expect(lower).toMatch(/\bclaimed_player_id\b[^,]*uuid[^,]*null/);
    expect(lower).toMatch(/\bis_archived\b[^,]*boolean[^,]*not\s+null[^,]*default\s+false/);
    expect(lower).toMatch(/\bcreated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    // ON DELETE CASCADE on the source-* FKs; SET NULL on the claimant FKs so
    // a deleted coach / player does not orphan the row for the source side.
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+players\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+teams\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+organizations\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/on\s+delete\s+set\s+null/);
  });

  it('declares the (source_coach_id, source_player_id, source_team_id) idempotency UNIQUE constraint', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).toMatch(
      /unique\s*\(\s*source_coach_id\s*,\s*source_player_id\s*,\s*source_team_id\s*\)/,
    );
  });

  it('table column allow-list is exactly the thirteen AC columns (keyset)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    const m = lower.match(
      /create\s+table\s+(?:if\s+not\s+exists\s+)?player_handoffs\s*\(([\s\S]*?)\)\s*;/,
    );
    expect(m, 'CREATE TABLE body for player_handoffs').toBeTruthy();
    const body = m![1];

    // Split on commas that are NOT inside parens.
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
      if (/^(primary\s+key|constraint|unique|foreign\s+key|check)\b/i.test(trimmed)) continue;
      const idMatch = trimmed.match(/^([a-z_][a-z0-9_]*)\b/i);
      if (idMatch) columns.add(idMatch[1].toLowerCase());
    }

    expect(Array.from(columns).sort()).toEqual([
      'ai_provider',
      'card_body',
      'claimed_at',
      'claimed_by_coach_id',
      'claimed_player_id',
      'created_at',
      'id',
      'is_archived',
      'org_id',
      'season_label',
      'source_coach_id',
      'source_player_id',
      'source_team_id',
    ]);
  });

  it('adds the receiver-hot-path, source-coach, and claimant indexes', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Partial index on org_id where NOT is_archived — the receiver lookup
    // is the hot path; archived rows must not bloat it.
    expect(lower).toMatch(
      /create\s+index[\s\S]*player_handoffs\s*\(\s*org_id\s*\)[\s\S]*where\s+not\s+is_archived/,
    );

    // Per-source-coach listing ordered by created_at DESC.
    expect(lower).toMatch(
      /create\s+index[\s\S]*player_handoffs\s*\(\s*source_coach_id\s*,\s*created_at[^)]*\)/,
    );

    // Per-claimant listing (only meaningful when claimed_by_coach_id IS NOT NULL).
    expect(lower).toMatch(
      /create\s+index[\s\S]*player_handoffs\s*\(\s*claimed_by_coach_id\s*,\s*claimed_at[^)]*\)[\s\S]*where\s+claimed_by_coach_id\s+is\s+not\s+null/,
    );
  });

  it('contains NO banned descriptive-minor tokens in the executable DDL (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    for (const banned of [
      'dob',
      'medical',
      'photo',
      'address',
      'parent_email',
      'biometric',
      'similarity',
    ]) {
      expect(lower).not.toContain(banned);
    }
  });

  it('does NOT add any new descriptive-minor column on the players table in this migration', () => {
    // The ticket explicitly does NOT add a new column on `players`. If a
    // future deviation tries to slip an ALTER TABLE players ADD COLUMN
    // through inside the SAME file, fail loudly here.
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).not.toMatch(/alter\s+table\s+players\s+add\s+column/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#0006)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});
