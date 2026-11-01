/**
 * Migration 079 — coaches_select_org must not read coaches inside its own policy (42P17 recursion).
 * .test.ts NOT .spec.ts (LESSONS#0020 / #38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = readFileSync(join(process.cwd(), 'supabase', 'migrations', '079_coaches_rls_no_recursion.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');

describe('migration 079_coaches_rls_no_recursion.sql', () => {
  it('looks up the caller’s org in a SECURITY DEFINER function with a fixed search_path', () => {
    expect(code).toMatch(/create or replace function public\.current_coach_org_id\(\)/i);
    expect(code).toMatch(/security definer/i);
    expect(code).toMatch(/set search_path = public/i);
    expect(code).toMatch(/where id = auth\.uid\(\)/i);
  });
  it('recreates coaches_select_org against the function, with no subquery on coaches', () => {
    const policy = code.match(/create policy "coaches_select_org"[\s\S]*?;/i)?.[0] ?? '';
    expect(policy).toMatch(/org_id = public\.current_coach_org_id\(\)/i);
    expect(policy).not.toMatch(/from\s+(public\.)?coaches/i);
  });
  it('changes no tables, columns or data', () => {
    expect(code).not.toMatch(/\b(alter table|create table|drop table|insert into|update |delete from|truncate)\b/i);
  });
});
