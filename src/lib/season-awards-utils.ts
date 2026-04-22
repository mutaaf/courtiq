// Pure utility functions for End-of-Season Player Awards generation.
// No imports from React or Next.js — fully testable in isolation.

export interface AwardObservation {
  player_id: string;
  category: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  text: string;
  created_at: string;
}

export interface AwardPlayer {
  id: string;
  name: string;
}

export interface PlayerAwardData {
  name: string;
  totalObs: number;
  positiveObs: number;
  needsWorkObs: number;
  positiveRatio: number;
  topCategory: string;
  bestObservation: string;
}

export interface AwardEntry {
  player_name: string;
  award_title: string;
  emoji: string;
  description: string;
  standout_moment: string;
}

export interface SeasonAwards {
  season_label: string;
  ceremony_intro: string;
  awards: AwardEntry[];
  team_message: string;
}

// Group observations by player_id.
export function getPlayerObsMap(obs: AwardObservation[]): Map<string, AwardObservation[]> {
  const map = new Map<string, AwardObservation[]>();
  for (const o of obs) {
    const list = map.get(o.player_id) ?? [];
    list.push(o);
    map.set(o.player_id, list);
  }
  return map;
}

// Total observation count for a player.
export function countPlayerObs(playerObs: AwardObservation[]): number {
  return playerObs.length;
}

// Positive observation count for a player.
export function countPlayerPositiveObs(playerObs: AwardObservation[]): number {
  return playerObs.filter((o) => o.sentiment === 'positive').length;
}

// Needs-work observation count for a player.
export function countPlayerNeedsWorkObs(playerObs: AwardObservation[]): number {
  return playerObs.filter((o) => o.sentiment === 'needs-work').length;
}

// Positive ratio for a player (0–1). Returns 0 when no scored observations.
export function getPlayerPositiveRatio(playerObs: AwardObservation[]): number {
  const scored = playerObs.filter((o) => o.sentiment !== 'neutral');
  if (scored.length === 0) return 0;
  return scored.filter((o) => o.sentiment === 'positive').length / scored.length;
}

// Most common observation category for a player.
export function getPlayerTopCategory(playerObs: AwardObservation[]): string {
  if (playerObs.length === 0) return 'General';
  const counts: Record<string, number> = {};
  for (const o of playerObs) {
    counts[o.category] = (counts[o.category] ?? 0) + 1;
  }
  return Object.entries(counts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? 'General';
}

// Best (most notable positive) observation text for a player.
export function getPlayerBestObs(playerObs: AwardObservation[]): string {
  const positive = playerObs.filter((o) => o.sentiment === 'positive');
  if (positive.length === 0) return playerObs[0]?.text ?? '';
  // Return the longest positive observation (tends to be most descriptive).
  return positive.sort((a, b) => b.text.length - a.text.length)[0].text;
}

// Number of players who have at least one observation.
export function countPlayersWithObs(
  players: AwardPlayer[],
  obsMap: Map<string, AwardObservation[]>,
): number {
  return players.filter((p) => (obsMap.get(p.id)?.length ?? 0) > 0).length;
}

// Sort players by observation count, descending.
export function sortPlayersByEngagement(
  players: AwardPlayer[],
  obsMap: Map<string, AwardObservation[]>,
): AwardPlayer[] {
  return [...players].sort(
    (a, b) => (obsMap.get(b.id)?.length ?? 0) - (obsMap.get(a.id)?.length ?? 0),
  );
}

// Build the data payload for a single player for the AI prompt.
export function buildPlayerAwardData(
  player: AwardPlayer,
  playerObs: AwardObservation[],
): PlayerAwardData {
  return {
    name: player.name,
    totalObs: countPlayerObs(playerObs),
    positiveObs: countPlayerPositiveObs(playerObs),
    needsWorkObs: countPlayerNeedsWorkObs(playerObs),
    positiveRatio: getPlayerPositiveRatio(playerObs),
    topCategory: getPlayerTopCategory(playerObs),
    bestObservation: getPlayerBestObs(playerObs),
  };
}

// Build the full per-player payload list for the AI prompt.
export function buildAwardsPayload(
  players: AwardPlayer[],
  obsMap: Map<string, AwardObservation[]>,
): PlayerAwardData[] {
  return sortPlayersByEngagement(players, obsMap)
    .filter((p) => (obsMap.get(p.id)?.length ?? 0) > 0)
    .map((p) => buildPlayerAwardData(p, obsMap.get(p.id) ?? []));
}

// Minimum data check: at least 2 players with observations, at least 5 total.
export function hasEnoughDataForAwards(
  players: AwardPlayer[],
  obsMap: Map<string, AwardObservation[]>,
): boolean {
  const playersWithObs = countPlayersWithObs(players, obsMap);
  const totalObs = [...obsMap.values()].reduce((sum, list) => sum + list.length, 0);
  return playersWithObs >= 2 && totalObs >= 5;
}

// Build a shareable text block for a single player award.
export function buildAwardShareText(
  award: AwardEntry,
  coachName?: string,
  teamName?: string,
): string {
  const lines: string[] = [
    `${award.emoji} ${award.award_title}`,
    `Awarded to: ${award.player_name}`,
    '',
    award.description,
    '',
    `"${award.standout_moment}"`,
  ];
  if (coachName || teamName) {
    lines.push('');
    lines.push(`— ${[coachName ? `Coach ${coachName}` : null, teamName].filter(Boolean).join(' · ')}`);
  }
  lines.push('', 'Powered by SportsIQ 🏆');
  return lines.join('\n');
}

// Build a shareable text block for the full team awards ceremony.
export function buildAllAwardsShareText(
  structured: SeasonAwards,
  teamName?: string,
): string {
  const lines: string[] = [
    `🏆 ${structured.season_label}${teamName ? ` — ${teamName}` : ''}`,
    '',
    structured.ceremony_intro,
    '',
    '--- AWARDS ---',
    '',
  ];
  for (const a of structured.awards) {
    lines.push(`${a.emoji} ${a.award_title} → ${a.player_name}`);
    lines.push(`   ${a.description}`);
    lines.push('');
  }
  lines.push(structured.team_message);
  lines.push('', 'Powered by SportsIQ 🏆');
  return lines.join('\n');
}

// Cycle through accent color classes for award cards (keeps variety).
export function getAwardAccentClasses(index: number): {
  border: string;
  bg: string;
  text: string;
  emojiRing: string;
} {
  const palettes = [
    { border: 'border-amber-500/30',   bg: 'bg-amber-500/8',   text: 'text-amber-300',   emojiRing: 'bg-amber-500/20' },
    { border: 'border-orange-500/30',  bg: 'bg-orange-500/8',  text: 'text-orange-300',  emojiRing: 'bg-orange-500/20' },
    { border: 'border-emerald-500/30', bg: 'bg-emerald-500/8', text: 'text-emerald-300', emojiRing: 'bg-emerald-500/20' },
    { border: 'border-blue-500/30',    bg: 'bg-blue-500/8',    text: 'text-blue-300',    emojiRing: 'bg-blue-500/20' },
    { border: 'border-purple-500/30',  bg: 'bg-purple-500/8',  text: 'text-purple-300',  emojiRing: 'bg-purple-500/20' },
    { border: 'border-rose-500/30',    bg: 'bg-rose-500/8',    text: 'text-rose-300',    emojiRing: 'bg-rose-500/20' },
    { border: 'border-teal-500/30',    bg: 'bg-teal-500/8',    text: 'text-teal-300',    emojiRing: 'bg-teal-500/20' },
    { border: 'border-indigo-500/30',  bg: 'bg-indigo-500/8',  text: 'text-indigo-300',  emojiRing: 'bg-indigo-500/20' },
  ] as const;
  return palettes[index % palettes.length];
}

// Validate an award title is non-empty and not too long.
export function isValidAwardTitle(title: string): boolean {
  return typeof title === 'string' && title.trim().length >= 3 && title.trim().length <= 80;
}

// Validate an award entry has all required fields.
export function isValidAwardEntry(entry: unknown): entry is AwardEntry {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.player_name === 'string' && e.player_name.trim().length > 0 &&
    typeof e.award_title === 'string' && isValidAwardTitle(e.award_title) &&
    typeof e.emoji === 'string' && e.emoji.trim().length > 0 &&
    typeof e.description === 'string' && e.description.trim().length >= 10 &&
    typeof e.standout_moment === 'string' && e.standout_moment.trim().length >= 5
  );
}

// Count awards in structured data.
export function countAwards(structured: SeasonAwards): number {
  return Array.isArray(structured.awards) ? structured.awards.length : 0;
}

// Check if structured data has any awards.
export function hasAwards(structured: SeasonAwards): boolean {
  return countAwards(structured) > 0;
}

// Find a specific player's award by name (case-insensitive).
export function getPlayerAward(
  structured: SeasonAwards,
  playerName: string,
): AwardEntry | undefined {
  return structured.awards.find(
    (a) => a.player_name.toLowerCase() === playerName.toLowerCase(),
  );
}

// Get all unique award titles (to verify no duplicates).
export function getUniqueAwardTitles(structured: SeasonAwards): string[] {
  return [...new Set(structured.awards.map((a) => a.award_title.toLowerCase()))];
}

// Check if all awards have unique titles.
export function allAwardTitlesUnique(structured: SeasonAwards): boolean {
  const titles = structured.awards.map((a) => a.award_title.toLowerCase());
  return new Set(titles).size === titles.length;
}

// Format a label for the total number of awards.
export function buildAwardsSummaryLabel(structured: SeasonAwards): string {
  const n = countAwards(structured);
  if (n === 0) return 'No awards';
  if (n === 1) return '1 player award';
  return `${n} player awards`;
}
