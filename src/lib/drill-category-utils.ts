// Utilities for the drill-picker category filter chips.
// Helps coaches tap a skill category during a 30-second break instead of
// searching or scrolling, and highlights categories that match the team's
// current skill gaps.

export interface CategoryChip {
  label: string;
  count: number;
  isGap: boolean; // true when this category matches a team skill gap
}

// ── Category extraction ───────────────────────────────────────────────────────

export function extractCategories(
  drills: { category: string }[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const d of drills) {
    const cat = normalizeCategoryName(d.category);
    if (cat && !seen.has(cat)) {
      seen.add(cat);
      result.push(cat);
    }
  }
  return result;
}

export function normalizeCategoryName(category: string): string {
  if (!category || !category.trim()) return '';
  const trimmed = category.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

export function countDrillsInCategory(
  drills: { category: string }[],
  category: string,
): number {
  const normalized = normalizeCategoryName(category);
  return drills.filter(
    (d) => normalizeCategoryName(d.category) === normalized,
  ).length;
}

// ── Gap matching ──────────────────────────────────────────────────────────────

export function isCategoryFromSkillGap(
  category: string,
  gapCategories: string[],
): boolean {
  const norm = normalizeCategoryName(category).toLowerCase();
  return gapCategories.some((g) => g.toLowerCase().includes(norm) || norm.includes(g.toLowerCase()));
}

export function getCategoriesForSkillGaps(
  gapCategories: string[],
  availableCategories: string[],
): string[] {
  return availableCategories.filter((cat) =>
    isCategoryFromSkillGap(cat, gapCategories),
  );
}

// ── Filtering ─────────────────────────────────────────────────────────────────

export function matchesCategoryFilter(
  drill: { category: string },
  selectedCategory: string | null,
): boolean {
  if (!selectedCategory) return true;
  return normalizeCategoryName(drill.category) === normalizeCategoryName(selectedCategory);
}

// ── Sorting & chip building ───────────────────────────────────────────────────

// Gap categories come first; within each group alphabetical order.
export function sortCategoriesByGap(
  categories: string[],
  gapCategories: string[],
): string[] {
  return [...categories].sort((a, b) => {
    const aIsGap = isCategoryFromSkillGap(a, gapCategories);
    const bIsGap = isCategoryFromSkillGap(b, gapCategories);
    if (aIsGap && !bIsGap) return -1;
    if (!aIsGap && bIsGap) return 1;
    return a.localeCompare(b);
  });
}

export function buildCategoryChips(
  drills: { category: string }[],
  gapCategories: string[],
): CategoryChip[] {
  const categories = extractCategories(drills);
  const sorted = sortCategoriesByGap(categories, gapCategories);
  return sorted.map((cat) => ({
    label: cat,
    count: countDrillsInCategory(drills, cat),
    isGap: isCategoryFromSkillGap(cat, gapCategories),
  }));
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  dribbling: '🏀',
  passing: '🤝',
  shooting: '🎯',
  defense: '🛡️',
  rebounding: '⬆️',
  footwork: '👟',
  conditioning: '🏃',
  teamwork: '👥',
  fundamentals: '📐',
  warmup: '🔥',
  'warm-up': '🔥',
  cooldown: '❄️',
  agility: '⚡',
  speed: '⚡',
  strength: '💪',
};

export function getCategoryIcon(category: string): string {
  const key = category.toLowerCase().replace(/\s+/g, '');
  // Try exact match first
  if (CATEGORY_ICONS[key]) return CATEGORY_ICONS[key];
  // Try partial match
  for (const [pattern, icon] of Object.entries(CATEGORY_ICONS)) {
    if (key.includes(pattern) || pattern.includes(key)) return icon;
  }
  return '🏋️';
}

// ── Utility ───────────────────────────────────────────────────────────────────

export function hasMultipleCategories(drills: { category: string }[]): boolean {
  return extractCategories(drills).length > 1;
}

export function getAllCategoryLabels(chips: CategoryChip[]): string[] {
  return chips.map((c) => c.label);
}

export function getGapCategoryChips(chips: CategoryChip[]): CategoryChip[] {
  return chips.filter((c) => c.isGap);
}

export function countTotalDrillsInChips(chips: CategoryChip[]): number {
  return chips.reduce((sum, c) => sum + c.count, 0);
}
