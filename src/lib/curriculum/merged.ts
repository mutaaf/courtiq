/**
 * Merged curriculum reader — returns base curriculum_skills + team_custom_skills
 * as a single sorted list. Custom skills always sort after base ones (default
 * sort_order 1000 in the DB).
 *
 * Use this everywhere the AI or the UI consumes the team's curriculum, so coach
 * additions show up alongside built-ins without code changes elsewhere.
 *
 * Server-side only (uses service-role Supabase). For client reads, query the
 * two tables via /api/data and merge in the component.
 */

import { createServiceSupabase } from '@/lib/supabase/server';
import type {
  CurriculumSkill,
  TeamCustomSkill,
  MergedSkill,
} from '@/types/database';

interface MergeArgs {
  teamId: string;
  /** Optional — pass when the caller already knows it (saves one query). */
  curriculumId?: string | null;
}

export async function getMergedCurriculum({
  teamId,
  curriculumId,
}: MergeArgs): Promise<MergedSkill[]> {
  const admin = await createServiceSupabase();

  // Resolve curriculum_id from team if not passed
  let resolvedId = curriculumId ?? null;
  if (resolvedId === undefined || resolvedId === null) {
    const { data: team } = await admin
      .from('teams')
      .select('curriculum_id')
      .eq('id', teamId)
      .single();
    resolvedId = team?.curriculum_id ?? null;
  }

  // Parallel fetch
  const [baseRes, customRes] = await Promise.all([
    resolvedId
      ? admin
          .from('curriculum_skills')
          .select('*')
          .eq('curriculum_id', resolvedId)
          .order('sort_order', { ascending: true })
      : Promise.resolve({ data: [] as CurriculumSkill[], error: null }),
    admin
      .from('team_custom_skills')
      .select('*')
      .eq('team_id', teamId)
      .order('sort_order', { ascending: true }),
  ]);

  const base: MergedSkill[] = ((baseRes.data || []) as CurriculumSkill[]).map(
    (s) => ({ ...s, is_custom: false as const }),
  );
  const custom: MergedSkill[] = ((customRes.data || []) as TeamCustomSkill[]).map(
    (s) => ({ ...s, is_custom: true as const }),
  );

  // Sort by (sort_order, name) — custom skills already default to sort_order=1000
  return [...base, ...custom].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Lightweight projection used by AI prompts — keeps the payload small.
 */
export interface SkillForPrompt {
  skill_id: string;
  name: string;
  category: string;
}

export function toSkillsForPrompt(merged: MergedSkill[]): SkillForPrompt[] {
  return merged.map((s) => ({
    skill_id: s.skill_id,
    name: s.name,
    category: s.category,
  }));
}
