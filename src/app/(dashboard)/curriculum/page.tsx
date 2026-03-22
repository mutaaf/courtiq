'use client';

import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, TrendingUp, TrendingDown, Minus, Sparkles } from 'lucide-react';
import type { CurriculumSkill, ProficiencyLevel, Trend } from '@/types/database';
import { getProficiencyLabel } from '@/lib/curriculum/proficiency';

const PROFICIENCY_COLORS: Record<ProficiencyLevel, string> = {
  insufficient_data: 'bg-zinc-700 text-zinc-400',
  exploring: 'bg-amber-500/20 text-amber-400',
  practicing: 'bg-blue-500/20 text-blue-400',
  got_it: 'bg-emerald-500/20 text-emerald-400',
  game_ready: 'bg-purple-500/20 text-purple-400',
};

const PROFICIENCY_RING: Record<ProficiencyLevel, string> = {
  insufficient_data: 'stroke-zinc-700',
  exploring: 'stroke-amber-500',
  practicing: 'stroke-blue-500',
  got_it: 'stroke-emerald-500',
  game_ready: 'stroke-purple-500',
};

const PROFICIENCY_PERCENT: Record<ProficiencyLevel, number> = {
  insufficient_data: 0,
  exploring: 25,
  practicing: 50,
  got_it: 75,
  game_ready: 100,
};

const TREND_CONFIG: Record<Trend, { icon: typeof TrendingUp; color: string; label: string }> = {
  improving: { icon: TrendingUp, color: 'text-emerald-400', label: 'Improving' },
  plateau: { icon: Minus, color: 'text-zinc-400', label: 'Steady' },
  regressing: { icon: TrendingDown, color: 'text-red-400', label: 'Regressing' },
  new: { icon: Sparkles, color: 'text-blue-400', label: 'New' },
};

function ProficiencyRing({ level, size = 40 }: { level: ProficiencyLevel; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = PROFICIENCY_PERCENT[level];
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={3}
        className="text-zinc-800"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={PROFICIENCY_RING[level]}
      />
    </svg>
  );
}

export default function CurriculumPage() {
  const { activeTeam } = useActiveTeam();

  const { data: skills, isLoading: skillsLoading } = useQuery({
    queryKey: ['curriculum-skills', activeTeam?.curriculum_id],
    queryFn: async () => {
      if (!activeTeam?.curriculum_id) return [];
      const supabase = createClient();
      const { data, error } = await supabase
        .from('curriculum_skills')
        .select('*')
        .eq('curriculum_id', activeTeam.curriculum_id)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!activeTeam?.curriculum_id,
    ...CACHE_PROFILES.config,
  });

  const { data: teamProficiency, isLoading: profLoading } = useQuery({
    queryKey: ['team-proficiency', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const supabase = createClient();
      const { data: players } = await supabase
        .from('players')
        .select('id')
        .eq('team_id', activeTeam.id)
        .eq('is_active', true);

      if (!players?.length) return [];

      const playerIds = players.map((p) => p.id);
      const { data, error } = await supabase
        .from('player_skill_proficiency')
        .select('*')
        .in('player_id', playerIds);

      if (error) throw error;
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.proficiency,
  });

  // Group skills by category
  const skillsByCategory = (skills || []).reduce(
    (acc: Record<string, CurriculumSkill[]>, skill: CurriculumSkill) => {
      if (!acc[skill.category]) acc[skill.category] = [];
      acc[skill.category].push(skill);
      return acc;
    },
    {}
  );

  // Compute team-wide dominant proficiency per skill
  function getTeamSkillLevel(skillId: string): {
    level: ProficiencyLevel;
    trend: Trend;
    playerCount: number;
  } {
    const entries = (teamProficiency || []).filter((p: any) => p.skill_id === skillId);
    if (entries.length === 0) {
      return { level: 'insufficient_data', trend: 'new', playerCount: 0 };
    }

    const levelCounts: Record<ProficiencyLevel, number> = {
      insufficient_data: 0,
      exploring: 0,
      practicing: 0,
      got_it: 0,
      game_ready: 0,
    };

    entries.forEach((e: any) => {
      levelCounts[e.proficiency_level as ProficiencyLevel]++;
    });

    // Find the most common level (excluding insufficient_data if possible)
    let dominantLevel: ProficiencyLevel = 'insufficient_data';
    let maxCount = 0;
    for (const [level, count] of Object.entries(levelCounts)) {
      if (level === 'insufficient_data') continue;
      if (count > maxCount) {
        maxCount = count;
        dominantLevel = level as ProficiencyLevel;
      }
    }

    // If all insufficient_data
    if (maxCount === 0) dominantLevel = 'insufficient_data';

    // Most common trend
    const trends = entries.map((e: any) => e.trend).filter(Boolean);
    const trendMap: Record<string, number> = {};
    trends.forEach((t: string) => { trendMap[t] = (trendMap[t] || 0) + 1; });
    let dominantTrend: Trend = 'new';
    let maxTrend = 0;
    for (const [trend, count] of Object.entries(trendMap)) {
      if (count > maxTrend) {
        maxTrend = count;
        dominantTrend = trend as Trend;
      }
    }

    return { level: dominantLevel, trend: dominantTrend, playerCount: entries.length };
  }

  const isLoading = skillsLoading || profLoading;
  const currentWeek = activeTeam?.current_week || 1;

  if (!activeTeam?.curriculum_id) {
    return (
      <div className="p-4 lg:p-8">
        <div className="flex flex-col items-center justify-center py-16">
          <BookOpen className="h-16 w-16 text-zinc-600 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Curriculum</h1>
          <p className="text-zinc-400 text-center max-w-md">
            No curriculum is assigned to this team. Assign a curriculum in team settings to track
            skill development.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Curriculum</h1>
        <p className="text-zinc-400 text-sm">
          Skill roadmap for {activeTeam.age_group} &middot; Week {currentWeek}
        </p>
      </div>

      {/* Proficiency legend */}
      <div className="flex flex-wrap gap-3">
        {(['exploring', 'practicing', 'got_it', 'game_ready'] as ProficiencyLevel[]).map(
          (level) => (
            <div key={level} className="flex items-center gap-1.5">
              <div className={`h-3 w-3 rounded-full ${PROFICIENCY_COLORS[level].split(' ')[0]}`} />
              <span className="text-xs text-zinc-400">{getProficiencyLabel(level)}</span>
            </div>
          )
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(skillsByCategory).map(([category, catSkills]) => (
            <div key={category} className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {(catSkills as CurriculumSkill[]).map((skill: CurriculumSkill) => {
                  const teamLevel = getTeamSkillLevel(skill.skill_id);
                  const trendConfig = TREND_CONFIG[teamLevel.trend];
                  const TrendIcon = trendConfig.icon;
                  const isCurrentWeekSkill =
                    skill.intro_week !== null && skill.intro_week === currentWeek;
                  const isIntroduced =
                    skill.intro_week !== null && skill.intro_week <= currentWeek;

                  return (
                    <Card
                      key={skill.id}
                      className={`transition-colors ${
                        isCurrentWeekSkill ? 'border-orange-500/50 ring-1 ring-orange-500/20' : ''
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <ProficiencyRing level={teamLevel.level} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-zinc-100 truncate">
                                {skill.name}
                              </p>
                              {isCurrentWeekSkill && (
                                <Badge className="shrink-0 text-[10px]">This Week</Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className={`text-xs font-medium ${
                                  PROFICIENCY_COLORS[teamLevel.level].split(' ')[1]
                                }`}
                              >
                                {getProficiencyLabel(teamLevel.level)}
                              </span>
                              {teamLevel.level !== 'insufficient_data' && (
                                <span className={`flex items-center gap-0.5 text-xs ${trendConfig.color}`}>
                                  <TrendIcon className="h-3 w-3" />
                                </span>
                              )}
                            </div>
                            {skill.intro_week !== null && (
                              <p className="text-[10px] text-zinc-500 mt-1">
                                {isIntroduced
                                  ? `Introduced week ${skill.intro_week}`
                                  : `Coming week ${skill.intro_week}`}
                              </p>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
