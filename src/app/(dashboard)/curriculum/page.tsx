'use client';

import { useState, useMemo } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { CACHE_PROFILES } from '@/lib/query/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { BookOpen, TrendingUp, TrendingDown, Minus, Sparkles, Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Check, Loader2 } from 'lucide-react';
import { queryKeys } from '@/lib/query/keys';
import type { CurriculumSkill, ProficiencyLevel, Trend, TeamCustomSkill } from '@/types/database';
import { getProficiencyLabel } from '@/lib/curriculum/proficiency';
import { CustomSkillSheet } from '@/components/curriculum/custom-skill-sheet';
import { trackEvent } from '@/lib/analytics';

type MergedSkillRow =
  | (CurriculumSkill & { is_custom: false })
  | (TeamCustomSkill & { is_custom: true });

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
  const { activeTeam, coach } = useActiveTeam();
  const queryClient = useQueryClient();

  const [sheetOpen, setSheetOpen] = useState<
    | { mode: 'add'; category?: string }
    | { mode: 'edit'; skill: TeamCustomSkill }
    | null
  >(null);

  const { data: baseSkills, isLoading: skillsLoading } = useQuery({
    queryKey: ['curriculum-skills', activeTeam?.curriculum_id],
    queryFn: async () => {
      if (!activeTeam?.curriculum_id) return [];
      const data = await query<CurriculumSkill[]>({
        table: 'curriculum_skills',
        select: '*',
        filters: { curriculum_id: activeTeam.curriculum_id },
        order: { column: 'sort_order', ascending: true },
      });
      return data || [];
    },
    enabled: !!activeTeam?.curriculum_id,
    ...CACHE_PROFILES.config,
  });

  // Custom skills query — fails gracefully if migration 026 isn't applied yet.
  const { data: customSkills } = useQuery({
    queryKey: ['team-custom-skills', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam?.id) return [];
      try {
        const data = await query<TeamCustomSkill[]>({
          table: 'team_custom_skills',
          select: '*',
          filters: { team_id: activeTeam.id },
          order: { column: 'sort_order', ascending: true },
        });
        return data || [];
      } catch {
        return [];
      }
    },
    enabled: !!activeTeam?.id,
    ...CACHE_PROFILES.config,
  });

  const skills = useMemo<MergedSkillRow[]>(() => {
    const base: MergedSkillRow[] = (baseSkills || []).map((s) => ({ ...s, is_custom: false as const }));
    const custom: MergedSkillRow[] = (customSkills || []).map((s) => ({ ...s, is_custom: true as const }));
    return [...base, ...custom].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.name.localeCompare(b.name);
    });
  }, [baseSkills, customSkills]);

  const knownCategories = useMemo(() => {
    return Array.from(new Set(skills.map((s) => s.category))).sort();
  }, [skills]);

  function refreshCustom() {
    if (!activeTeam) return;
    queryClient.invalidateQueries({ queryKey: ['team-custom-skills', activeTeam.id] });
  }

  async function handleDelete(skill: TeamCustomSkill) {
    if (!confirm(`Remove "${skill.name}"? Past observations on this skill will keep the ID but show "Removed skill".`)) return;
    try {
      await mutate({
        table: 'team_custom_skills',
        operation: 'delete',
        filters: { id: skill.id },
      });
      trackEvent('curriculum_custom_skill_deleted', { skill_id: skill.skill_id });
      refreshCustom();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  // ── Week stepper ───────────────────────────────────────────────────────
  const [savingWeek, setSavingWeek] = useState(false);
  const [weekJustSaved, setWeekJustSaved] = useState(false);
  const seasonWeeks = activeTeam?.season_weeks ?? 52;

  async function setCurrentWeek(nextWeek: number) {
    if (!activeTeam) return;
    const clamped = Math.max(1, Math.min(seasonWeeks, nextWeek));
    if (clamped === activeTeam.current_week) return;
    setSavingWeek(true);
    try {
      await mutate({
        table: 'teams',
        operation: 'update',
        filters: { id: activeTeam.id },
        data: { current_week: clamped },
      });
      trackEvent('team_week_updated', {
        from: activeTeam.current_week,
        to: clamped,
        delta: clamped - activeTeam.current_week,
      });
      // Invalidate the active-team query so every page picks up the new week
      queryClient.invalidateQueries({ queryKey: queryKeys.teams.all() });
      setWeekJustSaved(true);
      setTimeout(() => setWeekJustSaved(false), 1500);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update week');
    } finally {
      setSavingWeek(false);
    }
  }

  const { data: teamProficiency, isLoading: profLoading } = useQuery({
    queryKey: ['team-proficiency', activeTeam?.id],
    queryFn: async () => {
      if (!activeTeam) return [];
      const players = await query<{ id: string }[]>({
        table: 'players',
        select: 'id',
        filters: { team_id: activeTeam.id, is_active: true },
      });

      if (!players?.length) return [];

      const playerIds = players.map((p) => p.id);
      const data = await query<any[]>({
        table: 'player_skill_proficiency',
        select: '*',
        filters: { player_id: { op: 'in', value: playerIds } },
      });
      return data || [];
    },
    enabled: !!activeTeam,
    ...CACHE_PROFILES.proficiency,
  });

  // Group merged (base + custom) skills by category
  const skillsByCategory = skills.reduce(
    (acc: Record<string, MergedSkillRow[]>, skill) => {
      if (!acc[skill.category]) acc[skill.category] = [];
      acc[skill.category].push(skill);
      return acc;
    },
    {} as Record<string, MergedSkillRow[]>,
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

  // Even with no base curriculum, the coach can still add custom skills.
  // Show the empty state only when both are absent.
  if (!activeTeam?.curriculum_id && (customSkills || []).length === 0) {
    return (
      <div className="p-4 lg:p-8">
        <div className="flex flex-col items-center justify-center py-16">
          <BookOpen className="h-16 w-16 text-zinc-600 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Curriculum</h1>
          <p className="text-zinc-400 text-center max-w-md mb-6">
            No curriculum is assigned to this team yet. Assign one in team settings, or
            add your own skills to start tracking what your team is working on.
          </p>
          {coach?.id && activeTeam?.id && (
            <Button onClick={() => setSheetOpen({ mode: 'add' })}>
              <Plus className="h-4 w-4" />
              Add a custom skill
            </Button>
          )}
        </div>
        {sheetOpen && coach?.id && activeTeam?.id && (
          <CustomSkillSheet
            teamId={activeTeam.id}
            coachId={coach.id}
            defaultAgeGroup={activeTeam.age_group}
            knownCategories={knownCategories}
            existing={sheetOpen.mode === 'edit' ? sheetOpen.skill : null}
            defaultCategory={sheetOpen.mode === 'add' ? sheetOpen.category : undefined}
            onClose={() => setSheetOpen(null)}
            onSaved={refreshCustom}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Curriculum</h1>
          <p className="text-zinc-400 text-sm">
            Skill roadmap for {activeTeam?.age_group}
          </p>
        </div>
        {coach?.id && activeTeam?.id && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSheetOpen({ mode: 'add' })}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add custom skill</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </div>

      {/* Week stepper — coaches advance the team's current_week as the season
          progresses; everything else (curriculum highlights, AI prompts, etc.)
          keys off this value. */}
      {activeTeam?.id && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Current Week</p>
            <p className="text-lg font-bold text-zinc-100">
              Week {currentWeek}
              {seasonWeeks ? <span className="text-sm font-normal text-zinc-500"> of {seasonWeeks}</span> : null}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => setCurrentWeek(currentWeek - 1)}
              disabled={savingWeek || currentWeek <= 1}
              aria-label="Previous week"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 active:scale-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="number"
              min={1}
              max={seasonWeeks}
              value={currentWeek}
              disabled={savingWeek}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) setCurrentWeek(v);
              }}
              aria-label="Set current week"
              className="h-9 w-14 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-center text-sm font-semibold text-zinc-100 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30"
            />
            <button
              onClick={() => setCurrentWeek(currentWeek + 1)}
              disabled={savingWeek || currentWeek >= seasonWeeks}
              aria-label="Next week"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-orange-500/50 hover:text-orange-400 active:scale-95 transition-colors disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <div className="ml-1 w-5 flex items-center justify-center">
              {savingWeek ? (
                <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
              ) : weekJustSaved ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : null}
            </div>
          </div>
        </div>
      )}

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
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                  {category}
                </h2>
                {coach?.id && activeTeam?.id && (
                  <button
                    onClick={() => setSheetOpen({ mode: 'add', category })}
                    className="flex items-center gap-1 text-xs text-zinc-500 hover:text-orange-400 transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Add to {category}
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {catSkills.map((skill) => {
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
                      } ${skill.is_custom ? 'border-zinc-700 bg-zinc-900/40' : ''}`}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <ProficiencyRing level={teamLevel.level} size={40} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-zinc-100 truncate">
                                {skill.name}
                              </p>
                              {isCurrentWeekSkill && (
                                <Badge className="shrink-0 text-[10px]">This Week</Badge>
                              )}
                              {skill.is_custom && (
                                <span className="shrink-0 rounded-full bg-zinc-800 border border-zinc-700 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
                                  Custom
                                </span>
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
                          {skill.is_custom && (
                            <div className="flex flex-col gap-1 shrink-0">
                              <button
                                onClick={() => setSheetOpen({ mode: 'edit', skill })}
                                aria-label="Edit"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDelete(skill)}
                                aria-label="Delete"
                                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
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

      {sheetOpen && coach?.id && activeTeam?.id && (
        <CustomSkillSheet
          teamId={activeTeam.id}
          coachId={coach.id}
          defaultAgeGroup={activeTeam.age_group}
          knownCategories={knownCategories}
          existing={sheetOpen.mode === 'edit' ? sheetOpen.skill : null}
          defaultCategory={sheetOpen.mode === 'add' ? sheetOpen.category : undefined}
          onClose={() => setSheetOpen(null)}
          onSaved={refreshCustom}
        />
      )}
    </div>
  );
}
