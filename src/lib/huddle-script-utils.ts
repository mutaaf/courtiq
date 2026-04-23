// Pure utility functions for the Practice Huddle Script feature.
// No side effects — safe to test in isolation.

export interface PlayerSpotlight {
  player_id?: string;
  name: string;
  achievement: string;
}

export interface HuddleScript {
  huddle_script: string;
  player_spotlight: PlayerSpotlight;
  team_shoutout: string;
  team_challenge: string;
  next_session_hint?: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

export function isValidPlayerSpotlight(s: unknown): s is PlayerSpotlight {
  if (s === null || typeof s !== 'object') return false;
  const d = s as Record<string, unknown>;
  return (
    typeof d.name === 'string' && d.name.length > 0 &&
    typeof d.achievement === 'string' && d.achievement.length > 0
  );
}

export function isValidHuddleScript(data: unknown): data is HuddleScript {
  if (data === null || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.huddle_script === 'string' && d.huddle_script.length > 20 &&
    isValidPlayerSpotlight(d.player_spotlight) &&
    typeof d.team_shoutout === 'string' && d.team_shoutout.length > 0 &&
    typeof d.team_challenge === 'string' && d.team_challenge.length > 0
  );
}

export function isValidChallengeText(text: string): boolean {
  return typeof text === 'string' && text.trim().length >= 10;
}

export function hasPlayerSpotlight(script: HuddleScript): boolean {
  return isValidPlayerSpotlight(script.player_spotlight);
}

export function hasNextSessionHint(script: HuddleScript): boolean {
  return typeof script.next_session_hint === 'string' && script.next_session_hint.trim().length > 0;
}

// ── Data sufficiency ──────────────────────────────────────────────────────────

export function hasEnoughDataForHuddle(observationCount: number): boolean {
  return observationCount >= 1;
}

// ── Observation helpers ───────────────────────────────────────────────────────

export interface ObsRow {
  player_id: string;
  category?: string;
  sentiment: string;
  text: string;
}

export function filterPositiveObs(obs: ObsRow[]): ObsRow[] {
  return obs.filter((o) => o.sentiment === 'positive');
}

export function filterNeedsWorkObs(obs: ObsRow[]): ObsRow[] {
  return obs.filter((o) => o.sentiment === 'needs-work');
}

export function groupObsByPlayer(obs: ObsRow[]): Map<string, ObsRow[]> {
  const map = new Map<string, ObsRow[]>();
  for (const o of obs) {
    const existing = map.get(o.player_id) ?? [];
    map.set(o.player_id, [...existing, o]);
  }
  return map;
}

export function countPositiveObsForPlayer(obs: ObsRow[], playerId: string): number {
  return obs.filter((o) => o.player_id === playerId && o.sentiment === 'positive').length;
}

export function getTopCategoryForPlayer(obs: ObsRow[], playerId: string): string {
  const playerObs = obs.filter((o) => o.player_id === playerId && o.category);
  const counts = new Map<string, number>();
  for (const o of playerObs) {
    const cat = o.category!;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  let topCat = '';
  let topCount = 0;
  for (const [cat, count] of counts.entries()) {
    if (count > topCount) {
      topCount = count;
      topCat = cat;
    }
  }
  return topCat;
}

export function getPlayerWithMostPositiveObs(
  obs: ObsRow[],
  playerIdToName: Record<string, string>,
): { playerId: string; name: string; positiveCount: number } | null {
  const positiveObs = filterPositiveObs(obs);
  if (positiveObs.length === 0) return null;

  const counts = new Map<string, number>();
  for (const o of positiveObs) {
    counts.set(o.player_id, (counts.get(o.player_id) ?? 0) + 1);
  }

  let topId = '';
  let topCount = 0;
  for (const [id, count] of counts.entries()) {
    if (count > topCount && playerIdToName[id]) {
      topCount = count;
      topId = id;
    }
  }

  if (!topId) return null;
  return { playerId: topId, name: playerIdToName[topId], positiveCount: topCount };
}

export function getBestPositiveObs(obs: ObsRow[], playerId: string): string {
  const playerPositiveObs = obs.filter(
    (o) => o.player_id === playerId && o.sentiment === 'positive' && o.text,
  );
  if (playerPositiveObs.length === 0) return '';
  // Prefer longer text (more descriptive)
  return playerPositiveObs.sort((a, b) => b.text.length - a.text.length)[0].text;
}

export function extractTeamStrengths(obs: ObsRow[]): string[] {
  const positiveObs = filterPositiveObs(obs);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const o of positiveObs) {
    if (o.category && !seen.has(o.category)) {
      seen.add(o.category);
      result.push(o.category);
    }
  }
  return result.slice(0, 3);
}

export function extractTeamChallenges(obs: ObsRow[]): string[] {
  const needsWorkObs = filterNeedsWorkObs(obs);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const o of needsWorkObs) {
    if (o.category && !seen.has(o.category)) {
      seen.add(o.category);
      result.push(o.category);
    }
  }
  return result.slice(0, 3);
}

// ── Player spotlight ──────────────────────────────────────────────────────────

export function buildPlayerSpotlightPayload(
  obs: ObsRow[],
  playerIdToName: Record<string, string>,
): { playerId: string; name: string; achievement: string } | null {
  const best = getPlayerWithMostPositiveObs(obs, playerIdToName);
  if (!best) return null;
  const obsText = getBestPositiveObs(obs, best.playerId);
  const topCat = getTopCategoryForPlayer(obs, best.playerId);
  const achievement = obsText || (topCat ? `great work on ${topCat.toLowerCase()}` : 'great effort today');
  return { playerId: best.playerId, name: best.name, achievement };
}

// ── Script formatting & sharing ───────────────────────────────────────────────

export function formatSpotlightLine(name: string, achievement: string): string {
  return `${name} — ${achievement}`;
}

export function buildHuddleShareText(script: HuddleScript): string {
  const lines: string[] = ['⭐ TEAM HUDDLE SCRIPT ⭐', ''];
  lines.push(script.huddle_script);
  if (script.next_session_hint) {
    lines.push('', `📅 Next up: ${script.next_session_hint}`);
  }
  return lines.join('\n');
}

export function truncateScript(script: string, maxLen: number): string {
  if (script.length <= maxLen) return script;
  return script.slice(0, maxLen - 3) + '...';
}

export function buildPreviewText(script: HuddleScript, maxLen = 100): string {
  return truncateScript(script.huddle_script, maxLen);
}

export function countWordsInScript(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function estimateReadingSeconds(text: string, wpm = 130): number {
  const words = countWordsInScript(text);
  return Math.ceil((words / wpm) * 60);
}

export function isScriptReadableInSeconds(text: string, targetSecs = 45): boolean {
  return estimateReadingSeconds(text) <= targetSecs;
}

// ── Session label ─────────────────────────────────────────────────────────────

export function buildHuddleSessionLabel(
  sessionType: string,
  date: string,
): string {
  const d = new Date(date + 'T00:00:00');
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const shortDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const typeLabel =
    sessionType === 'game' ? 'Game'
    : sessionType === 'scrimmage' ? 'Scrimmage'
    : sessionType === 'tournament' ? 'Tournament'
    : sessionType === 'training' ? 'Training'
    : 'Practice';
  return `${weekday}'s ${typeLabel} — ${shortDate}`;
}

// ── Summary stats ─────────────────────────────────────────────────────────────

export function buildObsSummary(obs: ObsRow[]): {
  total: number;
  positive: number;
  needsWork: number;
  topStrengths: string[];
  topChallenges: string[];
} {
  return {
    total: obs.length,
    positive: filterPositiveObs(obs).length,
    needsWork: filterNeedsWorkObs(obs).length,
    topStrengths: extractTeamStrengths(obs),
    topChallenges: extractTeamChallenges(obs),
  };
}
