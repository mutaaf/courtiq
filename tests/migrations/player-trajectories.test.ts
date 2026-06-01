/**
 * Ticket 0061 — `player_trajectories` migration.
 *
 * The cache row the trajectory route writes once per
 * (player_id, observation_count_bucket). AC anchor: COLUMNS allow-listed
 * (id, player_id, observation_count_bucket, started, now, turning_points,
 * created_at). NO new column on `players`. NO descriptive minor field
 * (DOB / parent contact / medical) — those live on `players` only and
 * never ride on the cache row.
 *
 * LESSONS#0006 — version prefix must be unique. The ticket prose said 056
 * but 056 is already taken by `056_parent_initiated_invites.sql` (0060);
 * the next free integer is 057, which this migration uses.
 *
 * LESSONS#0088 — strip `--` comment lines before scanning for COPPA-banned
 * tokens; the migration legitimately names what the cache is deliberately
 * NOT collecting and the scan would trip on its own documentation.
 *
 * .test.ts NOT .spec.ts — LESSONS#0020 / #38.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PlayerTrajectory } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /player.?trajector/i.test(f));
  if (!match) throw new Error('No player_trajectories migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('player_trajectories migration (ticket 0061)', () => {
  it('creates a player_trajectories table with the AC-listed columns', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?player_trajectories/);

    expect(lower).toMatch(/\bid\s+uuid\b/);
    expect(lower).toMatch(/\bplayer_id\s+uuid\s+not\s+null\s+references\s+players\(id\)\s+on\s+delete\s+cascade\b/);
    expect(lower).toMatch(/\bobservation_count_bucket\s+(int|integer)\s+not\s+null\b/);
    expect(lower).toMatch(/\bstarted\s+jsonb\s+not\s+null\b/);
    // The "now" column is a reserved-ish identifier in some dialects; the
    // ticket explicitly names it `now`, and Postgres tolerates the bare ident
    // outside of `now()` function calls — confirm the column is present.
    expect(lower).toMatch(/\bnow\s+jsonb\s+not\s+null\b/);
    expect(lower).toMatch(/\bturning_points\s+jsonb\s+not\s+null\b/);
    expect(lower).toMatch(/\bcreated_at\s+timestamptz\s+not\s+null\s+default\s+now\(\)/);
  });

  it('declares the (player_id, observation_count_bucket) UNIQUE constraint', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    // The unique constraint is what makes the cache row keyed; without it
    // the route's idempotent upsert would silently mint duplicates.
    expect(lower).toMatch(/unique\s*\(\s*player_id\s*,\s*observation_count_bucket\s*\)/);
  });

  it('adds NO new column to the `players` table (COPPA — the players table is sacred)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    // The cache lives on a SEPARATE table referencing player_id; no widening
    // of the per-minor schema. A migration that touches `players` would
    // either alter or insert into it.
    expect(lower).not.toMatch(/alter\s+table\s+players\b/);
    expect(lower).not.toMatch(/insert\s+into\s+players\b/);
  });

  it('adds NO descriptive minor field, parent contact, or DOB column (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    for (const banned of [
      'parent_email',
      'parent_phone',
      'parent_name',
      'date_of_birth',
      'medical',
      'jersey_number',
      'similarity',
      'biometric',
      'photo_match',
    ]) {
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

  it('uses prefix 057 — the next free integer after 056_parent_initiated_invites', () => {
    const { file } = findMigration();
    expect(file.startsWith('057_')).toBe(true);
  });
});

describe('PlayerTrajectory type — exported from @/types/database', () => {
  it('declares the persisted shape (compile-time check)', () => {
    // tsc --noEmit fails this file if the type is missing or differently shaped.
    const row: PlayerTrajectory = {
      id: '00000000-0000-4000-a000-0000000000fb',
      player_id: '00000000-0000-4000-a000-000000000030',
      observation_count_bucket: 9,
      started: { headline: 'Hesitated on closeouts', sentence: 'Started the season tentative on closeouts.', observation_id: 'o1', observed_at: '2026-03-01T00:00:00Z' },
      now: { headline: 'Closes out and recovers', sentence: 'Now closes out and recovers without losing balance.', observation_id: 'o9', observed_at: '2026-05-20T00:00:00Z' },
      turning_points: [],
      created_at: '2026-06-01T00:00:00Z',
    };
    expect(row.observation_count_bucket).toBe(9);
  });
});
