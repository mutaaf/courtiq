export const SPORT_EMOJIS: Record<string, string> = {
  basketball:   '🏀',
  soccer:       '⚽',
  volleyball:   '🏐',
  flag_football:'🏈',
  baseball:     '⚾',
  softball:     '🥎',
  lacrosse:     '🥍',
  swimming:     '🏊',
  tennis:       '🎾',
  gymnastics:   '🤸',
};

export function getSportEmoji(sportSlug?: string | null): string {
  return SPORT_EMOJIS[sportSlug ?? ''] ?? '🏅';
}
