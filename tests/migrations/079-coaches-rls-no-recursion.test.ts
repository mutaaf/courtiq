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

const sql80 = readFileSync(join(process.cwd(), 'supabase', 'migrations', '080_team_coaches_rls_no_recursion.sql'), 'utf8').replace(/--.*$/gm, '');
describe('migration 080_team_coaches_rls_no_recursion.sql', () => {
  it('reads the caller’s teams in a SECURITY DEFINER function', () => {
    expect(sql80).toMatch(/create or replace function public\.current_coach_team_ids\(\)/i);
    expect(sql80).toMatch(/security definer/i); expect(sql80).toMatch(/set search_path = public/i);
  });
  it('recreates team_coaches_select with no subquery on team_coaches', () => {
    const policy = sql80.match(/create policy "team_coaches_select"[\s\S]*?;/i)?.[0] ?? '';
    expect(policy).toMatch(/coach_id = auth\.uid\(\) or team_id in \(select public\.current_coach_team_ids\(\)\)/i);
    expect(policy).not.toMatch(/from\s+(public\.)?team_coaches/i);
  });
  it('changes no tables, columns or data', () => {
    expect(sql80).not.toMatch(/\b(alter table|create table|drop table|insert into|update |delete from|truncate)\b/i);
  });
});
