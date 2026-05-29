/**
 * Ticket 0056 — `parent_reactions` gets TWO new columns so the coach can
 * one-tap-reply: a timestamp + an FK to the announcement that carries the
 * reply.
 *
 *   - coach_reply_at TIMESTAMPTZ NULL
 *   - coach_reply_id UUID NULL REFERENCES team_announcements(id) ON DELETE SET NULL
 *
 * COPPA discussion: NEITHER new column is a minor-descriptive field. They are
 * a server-stamped timestamp and an FK to an EXISTING coach-owned table
 * (`team_announcements`, migration 022). No new column on `players`; no name
 * / DOB / medical / biometric / photo descriptor added anywhere.
 *
 * The migration's `--` header documents this trail (LESSONS#88 — the inverse
 * mistake would be to scan the raw file, falsely tripping on the words the
 * comment uses to record what we are NOT adding). The banned-token scan
 * therefore runs over the executable DDL with `--` comment lines stripped.
 *
 * .test.ts NOT .spec.ts (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ParentReaction } from '@/types/database';

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');

function findMigration(): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
  const match = files.find((f) => /parent.?reactions.?coach.?reply/i.test(f));
  if (!match) throw new Error('No parent_reactions_coach_reply migration found in supabase/migrations');
  return { file: match, sql: readFileSync(join(MIGRATIONS_DIR, match), 'utf8') };
}

/**
 * The executable DDL only — `--` comment lines stripped. The migration's
 * header legitimately NAMES the COPPA boundary (what it is NOT adding) so
 * scanning the raw file would falsely trip on those documentation words
 * (LESSONS#88).
 */
function ddlOnly(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n');
}

describe('parent_reactions coach-reply migration (ticket 0056)', () => {
  it('adds coach_reply_at TIMESTAMPTZ NULL on parent_reactions', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/alter\s+table\s+parent_reactions/);
    expect(lower).toMatch(/coach_reply_at\s+timestamptz/);
    // Nullable — a reaction starts unreplied.
    expect(lower).not.toMatch(/coach_reply_at\s+timestamptz\s+not\s+null/);
  });

  it('adds coach_reply_id UUID NULL with FK to team_announcements ON DELETE SET NULL', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    expect(lower).toMatch(/coach_reply_id\s+uuid/);
    expect(lower).toMatch(/references\s+team_announcements\s*\(\s*id\s*\)\s+on\s+delete\s+set\s+null/);
    // Nullable — a reaction is unreplied until the coach taps.
    expect(lower).not.toMatch(/coach_reply_id\s+uuid\s+not\s+null/);
  });

  it('adds NO descriptive minor field or planted contact (COPPA)', () => {
    const { sql } = findMigration();
    const lower = ddlOnly(sql).toLowerCase();

    // The ticket's explicit banned-token list — none may appear in the
    // EXECUTABLE DDL (the header comment legitimately uses them to record
    // what is NOT added; LESSONS#88).
    for (const banned of ['similarity', 'dob', 'biometric', 'photo', 'medical']) {
      expect(lower).not.toContain(banned);
    }

    // Belt-and-suspenders: the migration touches NO other table than
    // parent_reactions. `team_announcements` appears ONLY in the FK
    // REFERENCES clause, never as the subject of a `create table` or
    // `alter table`.
    expect(lower).not.toMatch(/alter\s+table\s+players/);
    expect(lower).not.toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?players/);
    expect(lower).not.toMatch(/alter\s+table\s+team_announcements/);
  });

  it('uses a UNIQUE version prefix not already taken (LESSONS#6)', () => {
    const { file } = findMigration();
    const prefix = file.split('_')[0];
    const all = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql'));
    const samePrefix = all.filter((f) => f.split('_')[0] === prefix);
    expect(samePrefix).toEqual([file]);
  });
});

describe('ParentReaction type — widened with the two new nullable fields', () => {
  it('declares coach_reply_at and coach_reply_id as string | null (compile-time)', () => {
    // tsc --noEmit fails this file if the type is missing the new fields. Per
    // LESSONS#99: when widening a domain type, grep tests/ for literal
    // constructors and update them; this constructor is the canary.
    const row: ParentReaction = {
      id: 'r1',
      share_token: 'tok',
      player_id: 'p1',
      team_id: 't1',
      coach_id: 'c1',
      reaction: '❤️',
      message: 'thanks for sticking with him on his shooting',
      parent_name: 'Sarah',
      is_read: false,
      created_at: '2026-05-29T00:00:00.000Z',
      coach_reply_at: null,
      coach_reply_id: null,
    };
    expect(row.coach_reply_at).toBeNull();
    expect(row.coach_reply_id).toBeNull();

    const replied: ParentReaction = {
      ...row,
      coach_reply_at: '2026-05-29T10:00:00.000Z',
      coach_reply_id: 'announce-1',
    };
    expect(replied.coach_reply_at).toBe('2026-05-29T10:00:00.000Z');
    expect(replied.coach_reply_id).toBe('announce-1');
  });
});
