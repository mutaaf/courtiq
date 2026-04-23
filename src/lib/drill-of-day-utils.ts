import type { Drill } from '@/types/database';

// Deterministically selects one drill per day per team, targeting the top skill gap.
// All functions are pure and side-effect-free.

export function getDayKey(date: Date): string {
  return date.toISOString().split('T')[0];
}

// djb2-style hash → stable positive integer
export function buildDayHash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function matchesDrillCategory(drill: Drill, category: string): boolean {
  if (!drill.category) return false;
  return drill.category.toLowerCase() === category.toLowerCase();
}

export function filterDrillsByCategory(drills: Drill[], category: string): Drill[] {
  return drills.filter((d) => matchesDrillCategory(d, category));
}

// Seeded drills are the most reliable baseline; deprioritise ai-generated stubs
export function sortDrillsForSelection(drills: Drill[]): Drill[] {
  const ORDER: Record<string, number> = { seeded: 0, curriculum: 1, coach: 2, community: 3, ai: 4 };
  return [...drills].sort((a, b) => (ORDER[a.source] ?? 5) - (ORDER[b.source] ?? 5));
}

export function selectDrillOfDay(
  drills: Drill[],
  category: string,
  teamId: string,
  date: Date
): Drill | null {
  const candidates = sortDrillsForSelection(filterDrillsByCategory(drills, category));
  if (candidates.length === 0) return null;
  const idx = buildDayHash(teamId + getDayKey(date)) % candidates.length;
  return candidates[idx];
}

export function hasEnoughDataForDrillOfDay(
  topCategory: string | null | undefined,
  drillCount: number
): boolean {
  return !!topCategory && drillCount > 0;
}

export function getDrillCategoryLabel(category: string): string {
  if (!category) return 'General';
  return category.charAt(0).toUpperCase() + category.slice(1).toLowerCase();
}

export function getDrillDurationLabel(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getDrillCues(drill: Drill, maxCues = 2): string[] {
  const cues = drill.teaching_cues ?? [];
  return cues.slice(0, maxCues);
}

export function getDrillEquipmentLabel(equipment: string[] | null): string {
  if (!equipment || equipment.length === 0) return 'No equipment needed';
  if (equipment.length === 1) return equipment[0];
  if (equipment.length === 2) return equipment.join(' & ');
  return `${equipment[0]}, ${equipment[1]} +${equipment.length - 2} more`;
}

export function buildDrillDismissKey(teamId: string, dateKey: string): string {
  return `drill-of-day-dismissed-${teamId}-${dateKey}`;
}

export function buildDrillViewUrl(category: string): string {
  return `/drills?category=${encodeURIComponent(
    category.charAt(0).toUpperCase() + category.slice(1)
  )}`;
}

export function buildDrillShareText(drill: Drill, teamName: string): string {
  const parts = [
    `🏆 Drill of the Day — ${teamName}`,
    '',
    `📋 ${drill.name}`,
    drill.description ? drill.description : '',
  ];
  const cues = getDrillCues(drill, 2);
  if (cues.length > 0) {
    parts.push('', 'Coaching cues:');
    cues.forEach((c) => parts.push(`• ${c}`));
  }
  const duration = getDrillDurationLabel(drill.duration_minutes);
  if (duration) parts.push('', `⏱ ${duration}`);
  parts.push('', 'via SportsIQ');
  return parts.filter((p) => p !== undefined).join('\n');
}

export function getDrillPlayerCountLabel(min: number, max: number | null): string {
  if (!max || max === min) return `${min}+ players`;
  return `${min}–${max} players`;
}
