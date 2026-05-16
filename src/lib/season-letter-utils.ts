// Utilities for end-of-season personal letters to each player's family.

export interface LetterObservation {
  player_id: string | null;
  category: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  text: string;
  created_at: string;
}

export interface LetterPlayer {
  id: string;
  name: string;
  jersey_number?: number | null;
}

export interface LetterAchievement {
  badge_type: string;
  awarded_at: string;
  note?: string | null;
}

export interface LetterPayload {
  playerName: string;
  firstName: string;
  seasonLabel: string;
  teamName: string;
  sportName: string;
  coachName: string;
  totalObs: number;
  positiveObsCount: number;
  topStrength: string;
  topGrowthArea: string;
  highlightObservations: string[];
  growthObservations: string[];
  badges: string[];
  sessionCount: number;
}

export function formatPlayerFirstName(playerName: string): string {
  return playerName.split(' ')[0] ?? playerName;
}

export function getPlayerObs(observations: LetterObservation[], playerId: string): LetterObservation[] {
  return observations.filter((o) => o.player_id === playerId);
}

export function getPositiveObs(observations: LetterObservation[]): LetterObservation[] {
  return observations.filter((o) => o.sentiment === 'positive');
}

export function getNeedsWorkObs(observations: LetterObservation[]): LetterObservation[] {
  return observations.filter((o) => o.sentiment === 'needs-work');
}

export function hasEnoughDataForLetter(observations: LetterObservation[]): boolean {
  const positive = getPositiveObs(observations);
  return positive.length >= 3;
}

export function getTopCategory(observations: LetterObservation[]): string {
  if (observations.length === 0) return 'general';
  const counts: Record<string, number> = {};
  for (const o of observations) {
    const cat = o.category || 'general';
    counts[cat] = (counts[cat] ?? 0) + 1;
  }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : 'general';
}

export function selectHighlightObs(observations: LetterObservation[], maxCount = 3): string[] {
  const positive = getPositiveObs(observations);
  // Sort by text length descending (longer = more specific/detailed)
  const sorted = [...positive].sort((a, b) => b.text.length - a.text.length);
  return sorted.slice(0, maxCount).map((o) => o.text);
}

export function selectGrowthObs(observations: LetterObservation[], maxCount = 2): string[] {
  const nw = getNeedsWorkObs(observations);
  // Take the oldest needs-work obs (early season struggles = growth arc)
  const sorted = [...nw].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  return sorted.slice(0, maxCount).map((o) => o.text);
}

export function getObsCountForPlayer(observations: LetterObservation[], playerId: string): number {
  return getPlayerObs(observations, playerId).length;
}

export function isValidLetterText(text: string): boolean {
  return typeof text === 'string' && text.trim().length >= 100;
}

export function getLetterPreview(letterText: string, maxChars = 120): string {
  const trimmed = letterText.trim();
  if (trimmed.length <= maxChars) return trimmed;
  const truncated = trimmed.slice(0, maxChars);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > 60 ? truncated.slice(0, lastSpace) : truncated) + '…';
}

export function countParagraphs(letterText: string): number {
  return letterText.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
}

export function buildLetterShareText(letter: {
  player_name: string;
  season_label: string;
  letter: string;
  coach_name: string;
}): string {
  return [
    `A note from your coach — ${letter.player_name}`,
    `${letter.season_label}`,
    '',
    letter.letter,
    '',
    `— ${letter.coach_name}`,
  ].join('\n');
}

export function buildLetterWhatsAppUrl(letter: {
  player_name: string;
  season_label: string;
  letter: string;
  coach_name: string;
}, parentPhone?: string | null): string {
  const text = buildLetterShareText(letter);
  const encoded = encodeURIComponent(text);
  if (parentPhone) {
    const phone = parentPhone.replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

export function buildLetterPayload(
  player: LetterPlayer,
  observations: LetterObservation[],
  sessionCount: number,
  achievements: LetterAchievement[],
  coachName: string,
  teamName: string,
  sportName: string,
  seasonLabel: string,
): LetterPayload {
  const playerObs = getPlayerObs(observations, player.id);
  const positiveObs = getPositiveObs(playerObs);
  const needsWorkObs = getNeedsWorkObs(playerObs);

  return {
    playerName: player.name,
    firstName: formatPlayerFirstName(player.name),
    seasonLabel,
    teamName,
    sportName,
    coachName,
    totalObs: playerObs.length,
    positiveObsCount: positiveObs.length,
    topStrength: getTopCategory(positiveObs),
    topGrowthArea: getTopCategory(needsWorkObs),
    highlightObservations: selectHighlightObs(playerObs),
    growthObservations: selectGrowthObs(playerObs),
    badges: achievements.map((a) => a.badge_type),
    sessionCount,
  };
}

export function buildLetterSummaryLabel(obsCount: number, sessionCount: number): string {
  return `${obsCount} observations across ${sessionCount} session${sessionCount !== 1 ? 's' : ''}`;
}

export function getCategoryDisplayLabel(category: string): string {
  const labels: Record<string, string> = {
    dribbling: 'Ball Handling',
    passing: 'Passing',
    shooting: 'Shooting',
    defense: 'Defense',
    hustle: 'Hustle & Effort',
    teamwork: 'Teamwork',
    footwork: 'Footwork',
    leadership: 'Leadership',
    awareness: 'Court / Field Awareness',
    rebounding: 'Rebounding',
    general: 'Overall Development',
  };
  return labels[category.toLowerCase()] ?? category.charAt(0).toUpperCase() + category.slice(1);
}
