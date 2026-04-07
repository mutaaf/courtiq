import type { Player, Team, CurriculumSkill } from '@/types/database';

export interface AIContext {
  sportName: string;
  teamName: string;
  ageGroup: string;
  playerCount: number;
  seasonWeek: number;
  practiceDuration: number;
  roster: Pick<Player, 'name' | 'nickname' | 'position' | 'jersey_number' | 'name_variants'>[];
  skills: Pick<CurriculumSkill, 'skill_id' | 'name' | 'category'>[];
  categories: string[];
  positions: string[];
  customInstructions: string;
}

export async function buildAIContext(
  teamId: string,
  supabase: any
): Promise<AIContext> {
  const { data: team } = await supabase
    .from('teams')
    .select('*, organizations(*), sports(*)')
    .eq('id', teamId)
    .single();

  const { data: players } = await supabase
    .from('players')
    .select('name, nickname, position, jersey_number, name_variants')
    .eq('team_id', teamId)
    .eq('is_active', true);

  let skills: any[] = [];
  if (team?.curriculum_id) {
    const { data: currSkills } = await supabase
      .from('curriculum_skills')
      .select('skill_id, name, category')
      .eq('curriculum_id', team.curriculum_id);
    skills = currSkills || [];
  }

  // Get resolved config for categories
  const { data: catOverride } = await supabase
    .from('config_overrides')
    .select('value')
    .eq('org_id', team?.org_id)
    .eq('domain', 'sport')
    .eq('key', 'categories')
    .is('team_id', null)
    .single();

  const categories = catOverride?.value || team?.sports?.default_categories || [];

  return {
    sportName: team?.sports?.name || 'Basketball',
    teamName: team?.name || 'Team',
    ageGroup: team?.age_group || '8-10',
    playerCount: players?.length || 0,
    seasonWeek: team?.current_week || 1,
    practiceDuration: 60,
    roster: players || [],
    skills,
    categories,
    positions: team?.sports?.default_positions || [],
    customInstructions: '',
  };
}
