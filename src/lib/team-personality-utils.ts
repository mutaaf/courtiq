import type { TeamPersonality } from '@/lib/ai/schemas';

export interface PersonalityObs {
  category: string;
  sentiment: string;
  text: string;
}

export interface PersonalitySession {
  quality_rating?: number | null;
}

export interface CategoryStat {
  category: string;
  positive: number;
  needsWork: number;
  total: number;
}

// ── Data prep ─────────────────────────────────────────────────────────────────

export function buildCategoryBreakdown(observations: PersonalityObs[]): CategoryStat[] {
  const map: Record<string, CategoryStat> = {};
  for (const obs of observations) {
    const cat = obs.category || 'general';
    if (!map[cat]) map[cat] = { category: cat, positive: 0, needsWork: 0, total: 0 };
    map[cat].total++;
    if (obs.sentiment === 'positive') map[cat].positive++;
    if (obs.sentiment === 'needs-work') map[cat].needsWork++;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function getTopStrengths(breakdown: CategoryStat[], maxCount = 3): string[] {
  return breakdown
    .filter((c) => c.total >= 2 && c.positive / c.total >= 0.6)
    .sort((a, b) => b.positive - a.positive)
    .slice(0, maxCount)
    .map((c) => c.category);
}

export function getTopChallenges(breakdown: CategoryStat[], maxCount = 3): string[] {
  return breakdown
    .filter((c) => c.total >= 2 && c.needsWork / c.total >= 0.4)
    .sort((a, b) => b.needsWork - a.needsWork)
    .slice(0, maxCount)
    .map((c) => c.category);
}

export function calculateHealthScore(observations: PersonalityObs[]): number {
  if (observations.length === 0) return 0;
  const positive = observations.filter((o) => o.sentiment === 'positive').length;
  return Math.round((positive / observations.length) * 100);
}

export function calculateEffortRatio(observations: PersonalityObs[]): number {
  if (observations.length === 0) return 0;
  const effortObs = observations.filter((o) =>
    ['effort', 'hustle', 'attitude', 'coachability'].includes((o.category || '').toLowerCase())
  ).length;
  return effortObs / observations.length;
}

export function calculateTeamworkRatio(observations: PersonalityObs[]): number {
  if (observations.length === 0) return 0;
  const teamworkObs = observations.filter((o) =>
    ['teamwork', 'passing', 'communication', 'leadership', 'awareness'].includes(
      (o.category || '').toLowerCase()
    )
  ).length;
  return teamworkObs / observations.length;
}

export function calculateSessionQualityAvg(sessions: PersonalitySession[]): number | null {
  const rated = sessions.filter((s) => s.quality_rating != null && s.quality_rating >= 1);
  if (rated.length === 0) return null;
  const sum = rated.reduce((acc, s) => acc + (s.quality_rating as number), 0);
  return sum / rated.length;
}

export function hasEnoughDataForPersonality(
  observations: PersonalityObs[],
  sessions: PersonalitySession[]
): boolean {
  return observations.length >= 20 && sessions.length >= 5;
}

// ── Display helpers ────────────────────────────────────────────────────────────

export function getTraitBarWidth(score: number): string {
  const clamped = Math.max(0, Math.min(100, score));
  return `${clamped}%`;
}

export function getTraitColor(score: number): string {
  if (score >= 75) return 'bg-emerald-500';
  if (score >= 50) return 'bg-orange-500';
  if (score >= 30) return 'bg-amber-500';
  return 'bg-zinc-500';
}

export function getTraitTextColor(score: number): string {
  if (score >= 75) return 'text-emerald-400';
  if (score >= 50) return 'text-orange-400';
  if (score >= 30) return 'text-amber-400';
  return 'text-zinc-400';
}

export function getPersonalityAccentClasses(): {
  border: string;
  bg: string;
  badge: string;
  heading: string;
} {
  return {
    border: 'border-violet-500/30',
    bg: 'bg-violet-500/5',
    badge: 'bg-violet-500/20 text-violet-300',
    heading: 'text-violet-300',
  };
}

export function buildPersonalityShareText(personality: TeamPersonality, teamName?: string): string {
  const header = teamName
    ? `${personality.type_emoji} ${teamName} — ${personality.team_type}`
    : `${personality.type_emoji} ${personality.team_type}`;

  const traitLines = personality.traits
    .map((t) => `• ${t.name}: ${t.score}/100 — ${t.description}`)
    .join('\n');

  return [
    header,
    `"${personality.tagline}"`,
    '',
    personality.description,
    '',
    'Our traits:',
    traitLines,
    '',
    `💪 Strengths: ${personality.strengths.join(', ')}`,
    `📈 Working on: ${personality.growth_areas.join(', ')}`,
    '',
    `Team motto: "${personality.team_motto}"`,
    '',
    'Powered by SportsIQ 🏀',
  ].join('\n');
}

// ── Validation helpers (used in tests) ────────────────────────────────────────

export function isValidTeamType(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 3;
}

export function isValidTrait(trait: unknown): boolean {
  if (!trait || typeof trait !== 'object') return false;
  const t = trait as Record<string, unknown>;
  return (
    typeof t.name === 'string' &&
    t.name.length >= 2 &&
    typeof t.score === 'number' &&
    t.score >= 0 &&
    t.score <= 100 &&
    typeof t.description === 'string' &&
    t.description.length >= 10
  );
}

export function countTraits(personality: TeamPersonality): number {
  return personality.traits.length;
}

export function getHighestTrait(personality: TeamPersonality): TeamPersonality['traits'][0] | null {
  if (personality.traits.length === 0) return null;
  return personality.traits.reduce((best, t) => (t.score > best.score ? t : best));
}

export function getLowestTrait(personality: TeamPersonality): TeamPersonality['traits'][0] | null {
  if (personality.traits.length === 0) return null;
  return personality.traits.reduce((lowest, t) => (t.score < lowest.score ? t : lowest));
}

export function getAverageTraitScore(personality: TeamPersonality): number {
  if (personality.traits.length === 0) return 0;
  const sum = personality.traits.reduce((acc, t) => acc + t.score, 0);
  return Math.round(sum / personality.traits.length);
}

export function hasStrongIdentity(personality: TeamPersonality): boolean {
  const highest = getHighestTrait(personality);
  if (!highest) return false;
  return highest.score >= 70;
}

export function buildStatsBadgeLabel(
  observations: number,
  sessions: number,
  players: number
): string {
  return `${observations} obs · ${sessions} sessions · ${players} players`;
}

export function formatCoachingPatternLabel(
  breakdownLength: number,
  topCategory: string
): string {
  if (breakdownLength === 0) return 'balanced observer';
  return `primary focus: ${topCategory}`;
}

export function selectSampleObservations(
  observations: Array<PersonalityObs & { playerName?: string }>,
  maxCount = 15
): Array<{ playerName: string; category: string; sentiment: string; text: string }> {
  const positive = observations.filter((o) => o.sentiment === 'positive');
  const needsWork = observations.filter((o) => o.sentiment === 'needs-work');
  const half = Math.floor(maxCount / 2);
  return [
    ...positive.slice(0, half + 1),
    ...needsWork.slice(0, half),
  ]
    .slice(0, maxCount)
    .map((o) => ({
      playerName: o.playerName || 'Player',
      category: o.category || 'general',
      sentiment: o.sentiment,
      text: o.text,
    }));
}
