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

/**
 * Build AI context for a team.
 *
 * @param lightweight — when true, skips heavy queries (org config overrides,
 *   positions, custom instructions). Use for segmentation calls that only
 *   need roster + categories + skills.
 */
export async function buildAIContext(
  teamId: string,
  supabase: any,
  options?: { lightweight?: boolean }
): Promise<AIContext> {
  const lightweight = options?.lightweight ?? false;
  // Fetch team — handle missing team gracefully
  // In lightweight mode, skip the organizations join (not needed for segmentation)
  let team: any = null;
  try {
    const selectFields = lightweight
      ? 'id, name, age_group, curriculum_id, current_week, org_id, sports(name, default_categories, default_positions)'
      : '*, organizations(*), sports(*)';
    const { data } = await supabase
      .from('teams')
      .select(selectFields)
      .eq('id', teamId)
      .single();
    team = data;
  } catch {
    // Team not found — continue with defaults
  }

  // Fetch players — handle empty roster gracefully
  let players: any[] = [];
  try {
    const { data } = await supabase
      .from('players')
      .select('name, nickname, position, jersey_number, name_variants')
      .eq('team_id', teamId)
      .eq('is_active', true);
    players = data || [];
  } catch {
    // Players query failed — continue with empty roster
  }

  // Fetch curriculum skills (base + team-custom). Custom skills work even when
  // the team has no base curriculum, so this query runs unconditionally.
  let skills: any[] = [];
  try {
    const [baseRes, customRes] = await Promise.all([
      team?.curriculum_id
        ? supabase
            .from('curriculum_skills')
            .select('skill_id, name, category')
            .eq('curriculum_id', team.curriculum_id)
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from('team_custom_skills')
        .select('skill_id, name, category')
        .eq('team_id', teamId),
    ]);
    skills = [...(baseRes.data || []), ...(customRes.data || [])];
  } catch {
    // Curriculum query failed — continue without skills
  }

  // Get resolved config for categories — handle missing gracefully
  // In lightweight mode, skip the config_overrides lookup and use sport defaults
  let categories: string[] = [];
  if (lightweight) {
    categories = team?.sports?.default_categories || [];
  } else {
    try {
      if (team?.org_id) {
        const { data: catOverride } = await supabase
          .from('config_overrides')
          .select('value')
          .eq('org_id', team.org_id)
          .eq('domain', 'sport')
          .eq('key', 'categories')
          .is('team_id', null)
          .single();
        categories = catOverride?.value || team?.sports?.default_categories || [];
      } else {
        categories = team?.sports?.default_categories || [];
      }
    } catch {
      categories = team?.sports?.default_categories || [];
    }
  }

  return {
    sportName: team?.sports?.name || 'Basketball',
    teamName: team?.name || 'Team',
    ageGroup: team?.age_group || '8-10',
    playerCount: players.length,
    seasonWeek: team?.current_week || 1,
    practiceDuration: 60,
    roster: players,
    skills,
    categories,
    positions: team?.sports?.default_positions || [],
    customInstructions: '',
  };
}
