/**
 * Ticket 0034 — the `players.prior_player_id` cross-season link column.
 *
 * AC1: a `players` row gains EXACTLY one new nullable self-referential field
 * `prior_player_id` (FK to `players.id`, nullable, default null). No other field
 * is added, and the column collects NO new information ABOUT the minor — it is a
 * pointer between two coach-created rows. An existing player with
 * `prior_player_id = null` behaves exactly as today.
 *
 * Migration content is asserted from the SQL file (the fresh-CI-DB applies it via
 * `supabase start` under ON_ERROR_STOP=1; the unit test here proves the column
 * shape + that no descriptive minor field was smuggled in). The `Player` type
 * gaining `prior_player_id: string | null` is asserted with a compile-time check.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the spec glob. See docs/LESSONS.md.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Player } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /prior.?player|cross.?season/i.test(f));
  if (!match) throw new Error('No prior_player_id migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * The executable DDL only — `--` comment lines stripped. The migration's
 * explanatory header legitimately NAMES the things it does NOT add (no
 * name-similarity, no dob-match, etc.) to document the COPPA boundary; scanning
 * the raw file for those tokens would falsely trip on that documentation. We
 * assert against what actually runs.
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('players.prior_player_id migration (ticket 0034)', () => {
  it('adds a nullable self-referential prior_player_id FK to players(id)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).toContain('alter table');
    expect(lower).toContain('players');
    expect(lower).toContain('prior_player_id');
    // self-referential FK to players(id)
    expect(lower).toMatch(/references\s+public\.players\s*\(\s*id\s*\)|references\s+players\s*\(\s*id\s*\)/);
    // nullable: the new column must be declared NULL, never NOT NULL.
    expect(lower).toContain('prior_player_id uuid null');
    expect(lower).not.toMatch(/prior_player_id\s+uuid\s+not\s+null/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS.md 2026-05-20: the 031 collisions)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });

  it('adds NO new descriptive field about the minor — only the pointer (COPPA, AC1/AC9)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    // The migration must not widen what we collect ON a player: no match score,
    // name-similarity, DOB-match, biometric, or photo-match column.
    for (const banned of [
      'similarity',
      'match_score',
      'dob_match',
      'name_match',
      'biometric',
      'photo_match',
      'confidence',
    ]) {
      expect(lower).not.toContain(banned);
    }
    // Exactly one ADD COLUMN — only prior_player_id.
    const addColumnCount = (lower.match(/add column/g) || []).length;
    expect(addColumnCount).toBe(1);
  });
});

describe('Player type — prior_player_id (ticket 0034)', () => {
  it('exposes prior_player_id as a nullable string on the Player interface', () => {
    // Compile-time proof: a Player with prior_player_id: null and a string are
    // both assignable; this file fails `tsc --noEmit` if the field is missing.
    const linked: Pick<Player, 'prior_player_id'> = { prior_player_id: 'player-prior' };
    const unlinked: Pick<Player, 'prior_player_id'> = { prior_player_id: null };
    expect(linked.prior_player_id).toBe('player-prior');
    expect(unlinked.prior_player_id).toBeNull();
  });
});
