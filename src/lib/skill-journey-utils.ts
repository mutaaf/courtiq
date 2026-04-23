// Pure utility functions for computing player skill journey data
// used on the parent-facing share portal.

export interface SkillProgress {
  skill_id: string;
  skill_name: string;
  proficiency_level: string | null;
  success_rate: number | null;
  trend: string | null;
  category: string | null;
}

export interface ShareObservation {
  category: string | null;
  sentiment: string;
  text: string;
  created_at: string;
}

export interface SkillTrendSummary {
  skill_id: string;
  skill_name: string;
  category: string | null;
  proficiency_level: string | null;
  trend: string | null;
}

export interface SeasonStats {
  totalObservations: number;
  improvingSkillCount: number;
  mostActiveCategory: string | null;
  recentObsCount: number; // last 14 days
}

export interface SkillActivityData {
  category: string;
  recentCount: number;  // last 14 days
  priorCount: number;   // 15-28 days ago
  delta: number;        // recentCount - priorCount
}

// ---------------------------------------------------------------------------
// Skill trend helpers
// ---------------------------------------------------------------------------

export function getImprovingSkills(skills: SkillProgress[]): SkillProgress[] {
  return skills.filter((s) => s.trend === 'improving');
}

export function getDecliningSkills(skills: SkillProgress[]): SkillProgress[] {
  return skills.filter((s) => s.trend === 'declining');
}

export function getPlateauSkills(skills: SkillProgress[]): SkillProgress[] {
  return skills.filter((s) => s.trend === 'plateau');
}

export function getMostImprovedSkill(skills: SkillProgress[]): SkillProgress | null {
  const improving = getImprovingSkills(skills);
  if (improving.length === 0) return null;
  // Prefer game_ready > got_it > practicing > exploring as tiebreaker
  const order: Record<string, number> = { game_ready: 4, got_it: 3, practicing: 2, exploring: 1 };
  return improving.sort(
    (a, b) => (order[b.proficiency_level ?? ''] ?? 0) - (order[a.proficiency_level ?? ''] ?? 0)
  )[0];
}

export function countImprovingSkills(skills: SkillProgress[]): number {
  return getImprovingSkills(skills).length;
}

export function countDecliningSkills(skills: SkillProgress[]): number {
  return getDecliningSkills(skills).length;
}

export function hasAnyImprovingSkill(skills: SkillProgress[]): boolean {
  return skills.some((s) => s.trend === 'improving');
}

export function formatProficiencyLabel(level: string | null | undefined): string {
  const map: Record<string, string> = {
    exploring: 'Exploring',
    practicing: 'Practicing',
    got_it: 'Got It!',
    game_ready: 'Game Ready',
  };
  return map[level ?? ''] ?? 'Exploring';
}

// ---------------------------------------------------------------------------
// Observation activity helpers
// ---------------------------------------------------------------------------

export function groupObsByCategory(
  obs: ShareObservation[]
): Record<string, ShareObservation[]> {
  const groups: Record<string, ShareObservation[]> = {};
  for (const o of obs) {
    const cat = o.category ?? 'general';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(o);
  }
  return groups;
}

export function getObsAfterDate(obs: ShareObservation[], since: Date): ShareObservation[] {
  return obs.filter((o) => new Date(o.created_at) >= since);
}

export function getObsBeforeDate(obs: ShareObservation[], before: Date): ShareObservation[] {
  return obs.filter((o) => new Date(o.created_at) < before);
}

export function getObsBetweenDates(
  obs: ShareObservation[],
  from: Date,
  to: Date
): ShareObservation[] {
  return obs.filter((o) => {
    const d = new Date(o.created_at);
    return d >= from && d < to;
  });
}

export function getMostActiveCategory(obs: ShareObservation[]): string | null {
  if (obs.length === 0) return null;
  const counts: Record<string, number> = {};
  for (const o of obs) {
    const cat = o.category ?? 'general';
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function buildSkillActivityData(obs: ShareObservation[], now: Date = new Date()): SkillActivityData[] {
  const recent = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const prior = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  const recentObs = getObsAfterDate(obs, recent);
  const priorObs = getObsBetweenDates(obs, prior, recent);

  const recentByCat = groupObsByCategory(recentObs);
  const priorByCat = groupObsByCategory(priorObs);

  const allCats = new Set([...Object.keys(recentByCat), ...Object.keys(priorByCat)]);
  return Array.from(allCats)
    .map((cat) => {
      const r = recentByCat[cat]?.length ?? 0;
      const p = priorByCat[cat]?.length ?? 0;
      return { category: cat, recentCount: r, priorCount: p, delta: r - p };
    })
    .sort((a, b) => b.recentCount - a.recentCount);
}

// The category with the biggest recent surge relative to prior period
export function getMostSurgingCategory(activityData: SkillActivityData[]): SkillActivityData | null {
  if (activityData.length === 0) return null;
  const positive = activityData.filter((a) => a.recentCount > 0);
  if (positive.length === 0) return null;
  return positive.sort((a, b) => b.delta - a.delta)[0];
}

// ---------------------------------------------------------------------------
// Season stats builder
// ---------------------------------------------------------------------------

export function buildSeasonStats(
  obs: ShareObservation[],
  skills: SkillProgress[],
  now: Date = new Date()
): SeasonStats {
  const recent = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  return {
    totalObservations: obs.length,
    improvingSkillCount: countImprovingSkills(skills),
    mostActiveCategory: getMostActiveCategory(obs),
    recentObsCount: getObsAfterDate(obs, recent).length,
  };
}

// ---------------------------------------------------------------------------
// Label helpers
// ---------------------------------------------------------------------------

export function formatCategoryLabel(cat: string | null): string {
  if (!cat) return 'General';
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, ' ');
}

export function buildProgressMessage(
  firstName: string,
  improving: SkillProgress[],
  totalObs: number
): string {
  if (improving.length === 0 && totalObs === 0) {
    return `${firstName} is getting started — more updates coming soon!`;
  }
  if (improving.length >= 2) {
    return `${firstName} is showing improvement in ${improving.length} skill areas this season.`;
  }
  if (improving.length === 1) {
    return `${firstName} is making great progress in ${formatCategoryLabel(improving[0].category ?? improving[0].skill_name)}.`;
  }
  return `${firstName} has ${totalObs} coach observation${totalObs !== 1 ? 's' : ''} on record this season.`;
}

// ---------------------------------------------------------------------------
// Trend chip helpers for display
// ---------------------------------------------------------------------------

export function getTrendIcon(trend: string | null): string {
  if (trend === 'improving') return '↑';
  if (trend === 'declining') return '↓';
  return '→';
}

export function getTrendColor(trend: string | null): string {
  if (trend === 'improving') return 'emerald';
  if (trend === 'declining') return 'amber';
  return 'gray';
}

export function sortSkillsByImprovingFirst(skills: SkillProgress[]): SkillProgress[] {
  const order: Record<string, number> = { improving: 0, plateau: 1, null: 2, declining: 3 };
  return [...skills].sort(
    (a, b) => (order[a.trend ?? 'null'] ?? 2) - (order[b.trend ?? 'null'] ?? 2)
  );
}

export function filterSkillsWithTrend(skills: SkillProgress[]): SkillProgress[] {
  return skills.filter((s) => s.trend !== null);
}

export function hasEnoughDataForJourney(obs: ShareObservation[], skills: SkillProgress[]): boolean {
  return obs.length >= 3 || skills.length >= 1;
}
