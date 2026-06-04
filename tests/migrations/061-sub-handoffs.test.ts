/**
 * Ticket 0067 — sub_handoffs migration.
 *
 * The substitute-coach handoff table. Mints an observer token (24h) for the
 * regular coach to forward to a parent volunteer running practice for one
 * session, plus the include-flag triple, plus the optional sub-note the sub
 * leaves at the end of practice.
 *
 *   sub_handoffs
 *     id, session_id, coach_id, observer_token, sub_first_name,
 *     include_queued_drills, include_weekly_focus, include_eyes_on_players,
 *     sub_note_text, sub_note_at, sub_note_seen_at, created_at
 *
 *   UNIQUE(session_id, coach_id)
 *
 *   Two indexes:
 *     - (observer_token) for the public token resolution path.
 *     - (coach_id, sub_note_at DESC) WHERE sub_note_at IS NOT NULL for the
 *       /home unread-sub-note card.
 *
 * COPPA: the table references session_id + coach_id; never a player, parent,
 * or minor identifier. The banned-token scan strips `--` comment lines per
 * LESSONS#0088 so the header comment can name what it deliberately does NOT
 * add ("never a player, parent, observation, dob, medical, biometric").
 *
 * `.test.ts` NOT `.spec.ts` (LESSONS#0020 / #38). Mirrors
 * tests/migrations/059-drill-shares.test.ts byte-for-byte where applicable.
 * Migration prefix uniqueness (LESSONS#0006) — at pickup 059 and 060 were
 * already taken, so this lands at 061.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /sub.?handoffs/i.test(f));
  if (!match) throw new Error('No sub_handoffs migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/** Strip `--` comment lines so the COPPA banned-token scan only reads DDL (LESSONS#0088). */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

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

describe('sub_handoffs migration (ticket 0067)', () => {
  it('creates the sub_handoffs table with the named columns + FKs', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/create\s+table\s+(?:if\s+not\s+exists\s+)?sub_handoffs/);

    expect(lower).toMatch(/\bid\b[^,]*uuid[^,]*primary\s+key/);
    expect(lower).toMatch(/\bsession_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bcoach_id\b[^,]*uuid[^,]*not\s+null/);
    expect(lower).toMatch(/\bobserver_token\b[^,]*text[^,]*not\s+null/);
    expect(lower).toMatch(/\bsub_first_name\b\s+text/);
    expect(lower).toMatch(
      /\binclude_queued_drills\b[^,]*boolean[^,]*not\s+null[^,]*default\s+true/,
    );
    expect(lower).toMatch(
      /\binclude_weekly_focus\b[^,]*boolean[^,]*not\s+null[^,]*default\s+true/,
    );
    expect(lower).toMatch(
      /\binclude_eyes_on_players\b[^,]*boolean[^,]*not\s+null[^,]*default\s+true/,
    );
    expect(lower).toMatch(/\bsub_note_text\b\s+text/);
    expect(lower).toMatch(/\bsub_note_at\b\s+timestamptz/);
    expect(lower).toMatch(/\bsub_note_seen_at\b\s+timestamptz/);
    expect(lower).toMatch(/\bcreated_at\b[^,]*timestamptz[^,]*not\s+null[^,]*default\s+now/);

    // FKs CASCADE on sessions + coaches (per AC).
    expect(lower).toMatch(/references\s+sessions\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);
    expect(lower).toMatch(/references\s+coaches\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/);

    // Idempotency constraint — (session_id, coach_id) UNIQUE so a coach
    // re-invoking create on the same session UPDATES the row instead of
    // accumulating a second token.
    expect(lower).toMatch(/unique\s*\(\s*session_id\s*,\s*coach_id\s*\)/);
  });

  it('sub_handoffs column allow-list is exactly the AC columns (keyset)', () => {
    const { sql } = findMigration();
    const cols = columnsFor(ddlOnly(sql), 'sub_handoffs');
    expect(Array.from(cols).sort()).toEqual([
      'coach_id',
      'created_at',
      'id',
      'include_eyes_on_players',
      'include_queued_drills',
      'include_weekly_focus',
      'observer_token',
      'session_id',
      'sub_first_name',
      'sub_note_at',
      'sub_note_seen_at',
      'sub_note_text',
    ]);
  });

  it('adds both required indexes (token lookup + home unread-sub-note read)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // Public token resolution is the hot path for the sub page.
    expect(lower).toMatch(/create\s+index[\s\S]*sub_handoffs\s*\(\s*observer_token\s*\)/);

    // /home unread-sub-note card — partial index keeps it tiny.
    expect(lower).toMatch(
      /create\s+index[\s\S]*sub_handoffs\s*\(\s*coach_id\s*,\s*sub_note_at[^)]*\)\s+where\s+sub_note_at\s+is\s+not\s+null/,
    );
  });

  it('adds NO column to sessions / coaches / players / teams / observations (sacred)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();
    expect(lower).not.toMatch(/alter\s+table\s+sessions\b/);
    expect(lower).not.toMatch(/alter\s+table\s+coaches\b/);
    expect(lower).not.toMatch(/alter\s+table\s+players\b/);
    expect(lower).not.toMatch(/alter\s+table\s+teams\b/);
    expect(lower).not.toMatch(/alter\s+table\s+observations\b/);
  });

  it('contains NO descriptive-minor tokens in the executable DDL (COPPA)', () => {
    // The flag `include_eyes_on_players` is structural — a boolean toggle
    // controlling whether the public route renders the eyes-on-players
    // section AT ALL. The column never stores minor data; it stores TRUE
    // / FALSE only. So we strip the include-flag identifiers before
    // running the banned-token sweep, and assert the rest of the
    // executable DDL carries no per-minor field name (parent, medical,
    // biometric, dob, jersey, photo). Same family as LESSONS#0088 (strip
    // documentation before scanning) — here we strip a structural
    // include-flag whose identifier happens to contain "players" but
    // whose value space is just a boolean.
    const { sql } = findMigration();
    const lower = ddlOnly(sql)
      .toLowerCase()
      .replace(/include_eyes_on_players/g, '')
      .replace(/include_queued_drills/g, '')
      .replace(/include_weekly_focus/g, '');
    for (const banned of ['parent', 'medical', 'biometric', 'dob', 'jersey', 'photo']) {
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
