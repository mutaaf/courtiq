/**
 * Ticket 0065 — coach_director_contacts migration.
 *
 * One table that maps a coach to the program director(s) they have invited
 * via the new "Send to my director" surface on the 0057 weekly-pulse share
 * sheet. Columns: id, coach_id, director_first_name, director_email,
 * director_email_hash, last_invited_at, invite_count.
 *
 * COPPA: the table references coaches only — never a player, parent,
 * session, observation, or any minor-side concept. The banned-token scan
 * strips `--` comment lines per LESSONS#0088 so the header comment can
 * legitimately name what it deliberately does NOT add.
 *
 * Migration prefix: 060 (LESSONS#0006 — 059 is already taken by
 * `059_drill_shares.sql`, so this ticket lands at the next free integer).
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020 / #38). Mirrors
 * tests/migrations/059-drill-shares.test.ts byte-for-byte where applicable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /coach.?director.?contacts/i.test(f));
  if (!match) throw new Error('No coach_director_contacts migration found in supabase/migrations');
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

describe('coach_director_contacts migration (ticket 0065)', () => {
  it('creates the coach_director_contacts table with the named columns + FK', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?coach_director_contacts/);

    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\bcoach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bdirector_first_name\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bdirector_email\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bdirector_email_hash\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\blast_invited_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);
    expect(lower).toMatch(/\binvite_count\b[^,]*int[^,]*not\s+null[^,]*default\s+1/);

    // FK ON DELETE CASCADE to coaches(id).
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);

    // The dedup constraint — UNIQUE (coach_id, director_email_hash) so a
    // re-invite of the same director by the same coach increments the
    // existing row rather than minting a second one.
    expect(lower).toMatch(/unique\s*\(\s*coach_id\s*,\s*director_email_hash\s*\)/);
  });

  it('coach_director_contacts column allow-list is exactly the seven AC columns (keyset)', () => {
    const { sql } = findMigration();
    const cols = columnsFor(ddlOnly(sql), 'coach_director_contacts');
    expect(Array.from(cols).sort()).toEqual([
      'coach_id',
      'director_email',
      'director_email_hash',
      'director_first_name',
      'id',
      'invite_count',
      'last_invited_at',
    ]);
  });

  it('adds the per-coach pre-fill lookup index (coach_id, last_invited_at DESC)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(
      /create\s+index[\s\S]*coach_director_contacts\s*\(\s*coach_id\s*,\s*last_invited_at[^)]*\)/,
    );
  });

  it('adds NO column to coaches / teams / players / plans / weekly_pulse_shares', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).not.toMatch(/alter\s+table\s+coaches\b/);
    expect(lower).not.toMatch(/alter\s+table\s+teams\b/);
    expect(lower).not.toMatch(/alter\s+table\s+players\b/);
    expect(lower).not.toMatch(/alter\s+table\s+plans\b/);
    expect(lower).not.toMatch(/alter\s+table\s+weekly_pulse_shares\b/);
    expect(lower).not.toMatch(/alter\s+table\s+program_referrals\b/);
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
