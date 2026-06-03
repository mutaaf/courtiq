/**
 * Ticket 0064 — drill_shares + drill_share_clones migration.
 *
 * Two tables in the same migration file:
 *   1) drill_shares — maps a public token to ONE drill the publishing coach
 *      loved (caption optional, voice-scanned at the route layer). Columns:
 *        id, coach_id, drill_id, share_token, caption, is_active,
 *        created_at, updated_at
 *      Indexes: a UNIQUE on (share_token) and a UNIQUE on (coach_id,
 *      drill_id) for idempotent re-publish, plus a (coach_id, created_at
 *      DESC) for the publisher list and a (coach_id, is_active, created_at
 *      DESC) for the follower-feed read path.
 *   2) drill_share_clones — one row per (drill_share, cloner_coach), UNIQUE
 *      so the clone route is idempotent. Columns:
 *        id, drill_share_id, cloner_coach_id, cloned_at
 *
 * COPPA: both tables reference coaches + (optionally) drills only. There is
 * NO player, parent, session, team, or minor reference on either. The
 * banned-token scan strips `--` comment lines per LESSONS#0088 so the
 * header comment can name what it deliberately does NOT add.
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020 / #38). Mirrors
 * tests/migrations/practice-plan-shares-coppa.test.ts byte-for-byte where
 * applicable; differs on (1) two tables instead of one, (2) drill_id is
 * UUID FK to drills(id), not a TEXT key.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /drill.?shares/i.test(f));
  if (!match) throw new Error('No drill_shares migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the COPPA banned-token scan only reads DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

/** Extract a CREATE TABLE body and return the set of top-level column identifiers. */
function columnsFor(sql: string, table: string): Set<string> {
  const lower = sql.toLowerCase();
  const re = new RegExp(
    `create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\s*\\(([\\s\\S]*?)\\)\\s*;`,
    'i',
  );
  const m = lower.match(re);
  if (!m) throw new Error(`No CREATE TABLE body for ${table}`);
  const body = m[1];

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

  const cols = new Set<string>();
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^(primary\s+key|constraint|unique|foreign\s+key|check)\b/i.test(line)) continue;
    const idMatch = line.match(/^([a-z_][a-z0-9_]*)\b/i);
    if (idMatch) cols.add(idMatch[1].toLowerCase());
  }
  return cols;
}

describe('drill_shares + drill_share_clones migration (ticket 0064)', () => {
  it('creates the drill_shares table with the named columns + FKs', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?drill_shares/);

    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\bcoach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bdrill_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bshare_token\b[^,]*text[^,]*not\s+null[^,]*unique/);
    expect(lower).toMatch(/\bcaption\b\s+text/);
    expect(lower).toMatch(/\bis_active\b[^,]*boolean[^,]*not\s+null[^,]*default\s+true/);
    expect(lower).toMatch(/\bcreated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);
    expect(lower).toMatch(/\bupdated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    // FKs with ON DELETE CASCADE on coaches AND drills.
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+drills\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);

    // The idempotency constraint — (coach_id, drill_id) UNIQUE.
    expect(lower).toMatch(/unique\s*\(\s*coach_id\s*,\s*drill_id\s*\)/);
  });

  it('drill_shares column allow-list is exactly the eight AC columns (keyset)', () => {
    const { sql } = findMigration();
    const cols = columnsFor(ddlOnly(sql), 'drill_shares');
    expect(Array.from(cols).sort()).toEqual([
      'caption',
      'coach_id',
      'created_at',
      'drill_id',
      'id',
      'is_active',
      'share_token',
      'updated_at',
    ]);
  });

  it('adds the per-coach + follower-feed indexes on drill_shares', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Publisher's "my published drills" list — most-recent first.
    expect(lower).toMatch(/create\s+index[\s\S]*drill_shares\s*\(\s*coach_id\s*,\s*created_at[^)]*\)/);

    // Follower-feed read path — filter by active flag + most-recent first.
    expect(lower).toMatch(
      /create\s+index[\s\S]*drill_shares\s*\(\s*coach_id\s*,\s*is_active\s*,\s*created_at[^)]*\)/,
    );
  });

  it('creates the drill_share_clones table with the named columns + FKs', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?drill_share_clones/);

    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\bdrill_share_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bcloner_coach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bcloned_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    expect(lower).toMatch(/references\s+drill_shares\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    // Cloner FK references coaches with ON DELETE CASCADE.
    expect(lower).toMatch(
      /cloner_coach_id[\s\S]*?references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/,
    );

    // Idempotency constraint on (drill_share_id, cloner_coach_id).
    expect(lower).toMatch(/unique\s*\(\s*drill_share_id\s*,\s*cloner_coach_id\s*\)/);
  });

  it('drill_share_clones column allow-list is exactly the four AC columns', () => {
    const { sql } = findMigration();
    const cols = columnsFor(ddlOnly(sql), 'drill_share_clones');
    expect(Array.from(cols).sort()).toEqual([
      'cloned_at',
      'cloner_coach_id',
      'drill_share_id',
      'id',
    ]);
  });

  it('adds NO column to coaches / plans / players / drills', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    // Only ALTER allowed by this migration is none — neither coaches, plans,
    // players, nor drills is touched. The migration adds only the two new
    // tables and their indexes.
    expect(lower).not.toMatch(/alter\s+table\s+coaches\b/);
    expect(lower).not.toMatch(/alter\s+table\s+plans\b/);
    expect(lower).not.toMatch(/alter\s+table\s+players\b/);
    expect(lower).not.toMatch(/alter\s+table\s+drills\b/);
  });

  it('contains NO banned descriptive-minor tokens in the executable DDL (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    for (const banned of ['player', 'parent', 'observation', 'medical', 'biometric', 'dob']) {
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
