/**
 * Weekly Team Focus — coaches declare a skill theme for the week (e.g. "Defense
 * week before Saturday's big game"). Stored in localStorage, expires after 7 days.
 * No DB or API calls required.
 */

export const FOCUS_CATEGORIES = [
  { id: 'shooting',     label: 'Shooting',      emoji: '🎯' },
  { id: 'defense',      label: 'Defense',        emoji: '🛡️' },
  { id: 'dribbling',    label: 'Ball Handling',  emoji: '⚡' },
  { id: 'passing',      label: 'Passing',        emoji: '🤝' },
  { id: 'hustle',       label: 'Hustle',         emoji: '🔥' },
  { id: 'awareness',    label: 'Court Vision',   emoji: '👁️' },
  { id: 'teamwork',     label: 'Teamwork',       emoji: '📣' },
  { id: 'footwork',     label: 'Footwork',       emoji: '👟' },
  { id: 'conditioning', label: 'Conditioning',   emoji: '💪' },
  { id: 'leadership',   label: 'Leadership',     emoji: '🏆' },
] as const;

export type FocusCategory = (typeof FOCUS_CATEGORIES)[number]['id'];

export interface WeeklyFocus {
  category: FocusCategory;
  /** ISO date string (YYYY-MM-DD) when the focus was set */
  setAt: string;
}

const FOCUS_TTL_DAYS = 7;

export function getWeeklyFocusKey(teamId: string): string {
  return `weekly-focus-${teamId}`;
}

export function isValidFocusCategory(value: string): value is FocusCategory {
  return FOCUS_CATEGORIES.some((c) => c.id === value);
}

export function getFocusCategoryConfig(
  category: string
): (typeof FOCUS_CATEGORIES)[number] | null {
  return FOCUS_CATEGORIES.find((c) => c.id === category) ?? null;
}

/** Returns true when the focus is older than FOCUS_TTL_DAYS. */
export function isWeeklyFocusExpired(focus: WeeklyFocus): boolean {
  const setAt = new Date(focus.setAt + 'T12:00:00');
  const diffDays = (Date.now() - setAt.getTime()) / 86_400_000;
  return diffDays > FOCUS_TTL_DAYS;
}

/** How many calendar days remain before the focus expires (minimum 0). */
export function getDaysRemaining(focus: WeeklyFocus): number {
  const setAt = new Date(focus.setAt + 'T12:00:00');
  const diffDays = (Date.now() - setAt.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(FOCUS_TTL_DAYS - diffDays));
}

/** Read the active weekly focus for a team. Returns null if unset or expired. */
export function getWeeklyFocus(teamId: string): WeeklyFocus | null {
  try {
    const raw = localStorage.getItem(getWeeklyFocusKey(teamId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WeeklyFocus;
    if (!parsed?.category || !parsed?.setAt) return null;
    if (!isValidFocusCategory(parsed.category)) return null;
    if (isWeeklyFocusExpired(parsed)) {
      localStorage.removeItem(getWeeklyFocusKey(teamId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Persist a weekly focus for a team. Returns the stored focus object. */
export function setWeeklyFocus(teamId: string, category: FocusCategory): WeeklyFocus {
  const focus: WeeklyFocus = {
    category,
    setAt: new Date().toISOString().split('T')[0],
  };
  try {
    localStorage.setItem(getWeeklyFocusKey(teamId), JSON.stringify(focus));
  } catch {}
  return focus;
}

/** Remove the weekly focus for a team. */
export function clearWeeklyFocus(teamId: string): void {
  try {
    localStorage.removeItem(getWeeklyFocusKey(teamId));
  } catch {}
}

/**
 * Returns true when the given skill category matches the active weekly focus.
 * Used by DrillOfDayCard to show a "Matches your focus" badge.
 */
export function categoryMatchesFocus(
  category: string | null | undefined,
  focus: WeeklyFocus | null
): boolean {
  if (!category || !focus) return false;
  return category === focus.category;
}

/**
 * Human-readable label for how recently the focus was set.
 * "Today", "Yesterday", "N days ago"
 */
export function formatFocusAge(focus: WeeklyFocus): string {
  const setAt = new Date(focus.setAt + 'T12:00:00');
  const diffDays = Math.round((Date.now() - setAt.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}
