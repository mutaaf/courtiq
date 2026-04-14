/**
 * Pure utility functions for the Player Session Messages feature.
 * No side effects — safe to test without mocks.
 */

export interface SessionObservation {
  player_id?: string | null;
  sentiment: string;
  text: string;
  category?: string | null;
  players?: { name: string } | null;
}

export interface PlayerMessageEntry {
  player_name: string;
  message: string;
  highlight: string;
  next_focus: string;
}

export interface PlayerWithObs {
  playerId: string;
  playerName: string;
  observations: SessionObservation[];
}

/** Keep only observations tied to a specific player. */
export function filterPlayerObs(obs: SessionObservation[]): SessionObservation[] {
  return obs.filter((o) => !!o.player_id);
}

/** Get unique player IDs from observations. */
export function getObservedPlayerIds(obs: SessionObservation[]): string[] {
  const ids = new Set<string>();
  for (const o of filterPlayerObs(obs)) {
    if (o.player_id) ids.add(o.player_id);
  }
  return Array.from(ids);
}

/** Count unique players with at least one observation. */
export function countObservedPlayers(obs: SessionObservation[]): number {
  return getObservedPlayerIds(obs).length;
}

/** Group observations by player_id. Returns a record keyed by player_id. */
export function groupObsByPlayer(obs: SessionObservation[]): Record<string, SessionObservation[]> {
  const result: Record<string, SessionObservation[]> = {};
  for (const o of filterPlayerObs(obs)) {
    const id = o.player_id!;
    if (!result[id]) result[id] = [];
    result[id].push(o);
  }
  return result;
}

/** Get observations for a specific player. */
export function filterObsForPlayer(obs: SessionObservation[], playerId: string): SessionObservation[] {
  return obs.filter((o) => o.player_id === playerId);
}

/** Get positive observations for a player. */
export function getPositiveObsForPlayer(obs: SessionObservation[], playerId: string): SessionObservation[] {
  return filterObsForPlayer(obs, playerId).filter((o) => o.sentiment === 'positive');
}

/** Get needs-work observations for a player. */
export function getNeedsWorkObsForPlayer(obs: SessionObservation[], playerId: string): SessionObservation[] {
  return filterObsForPlayer(obs, playerId).filter((o) => o.sentiment === 'needs-work');
}

/**
 * Return true when there is at least one player-specific observation —
 * the minimum needed to generate messages.
 */
export function hasEnoughDataForMessages(obs: SessionObservation[]): boolean {
  return filterPlayerObs(obs).length > 0;
}

/**
 * Get the most frequent skill category for a player.
 * Returns null when no categorised observations exist.
 */
export function getTopSkillCategory(obs: SessionObservation[], playerId: string): string | null {
  const playerObs = filterObsForPlayer(obs, playerId);
  const counts: Record<string, number> = {};
  for (const o of playerObs) {
    if (o.category) counts[o.category] = (counts[o.category] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

/** Calculate positive ratio (0–1) for a specific player. */
export function calculatePositiveRatio(obs: SessionObservation[], playerId: string): number {
  const playerObs = filterObsForPlayer(obs, playerId);
  if (playerObs.length === 0) return 0;
  const positiveCount = playerObs.filter((o) => o.sentiment === 'positive').length;
  return positiveCount / playerObs.length;
}

/** Sort a list of PlayerWithObs by total observation count descending. */
export function sortPlayersByMostObserved(players: PlayerWithObs[]): PlayerWithObs[] {
  return [...players].sort((a, b) => b.observations.length - a.observations.length);
}

/**
 * Build a human-readable session label.
 * e.g. "Tuesday's Practice — Apr 14" or "Game vs Eagles — Apr 14"
 */
export function buildSessionLabel(
  sessionType: string,
  sessionDate: string,
  opponent?: string | null
): string {
  const date = new Date(sessionDate + 'T00:00:00');
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const shortDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (sessionType === 'game' || sessionType === 'scrimmage' || sessionType === 'tournament') {
    const typeLabel =
      sessionType === 'tournament' ? 'Tournament' :
      sessionType === 'scrimmage' ? 'Scrimmage' : 'Game';
    return opponent
      ? `${typeLabel} vs ${opponent} — ${shortDate}`
      : `${typeLabel} — ${shortDate}`;
  }
  return `${dayName}'s Practice — ${shortDate}`;
}

/**
 * Build a clipboard-ready share string for a single player message.
 * Suitable for SMS / WhatsApp.
 */
export function buildPlayerMessageShareText(
  playerName: string,
  message: string,
  highlight: string
): string {
  return `Hi! A quick note on ${playerName} from today's session:\n\n${message}\n\nHighlight: ${highlight}`;
}

/** Return true if the message string is non-empty and meets minimum length. */
export function isValidMessageText(msg: string): boolean {
  return typeof msg === 'string' && msg.trim().length >= 10;
}

/** Count entries in a messages result set. */
export function countMessages(messages: PlayerMessageEntry[]): number {
  return messages.length;
}

/**
 * Truncate a message to a maximum character count, appending an ellipsis
 * when the string is too long.
 */
export function truncateMessage(msg: string, maxLen: number = 200): string {
  if (msg.length <= maxLen) return msg;
  return msg.slice(0, maxLen - 1) + '…';
}

/**
 * Extract unique player names from observations where a name is embedded
 * in the joined `players` relation.
 */
export function extractPlayerNamesFromObs(obs: SessionObservation[]): string[] {
  const names = new Set<string>();
  for (const o of filterPlayerObs(obs)) {
    const name = (o.players as any)?.name;
    if (name) names.add(name);
  }
  return Array.from(names);
}

/**
 * Return true when a plan's content_structured already contains generated
 * player messages, to avoid unnecessary regeneration.
 */
export function hasGeneratedMessages(contentStructured: unknown): boolean {
  if (!contentStructured || typeof contentStructured !== 'object') return false;
  const s = contentStructured as Record<string, unknown>;
  return Array.isArray(s.messages) && (s.messages as unknown[]).length > 0;
}

/**
 * Build the per-player input payload for the AI prompt — a flat list of
 * player names with their session observations.
 */
export function buildPlayerObsPayload(
  obs: SessionObservation[]
): Array<{ playerName: string; observations: Array<{ text: string; sentiment: string; category: string }> }> {
  const byPlayer = groupObsByPlayer(obs);
  return Object.entries(byPlayer).map(([, playerObs]) => {
    const playerName = (playerObs[0].players as any)?.name || 'Unknown';
    return {
      playerName,
      observations: playerObs.map((o) => ({
        text: o.text,
        sentiment: o.sentiment,
        category: o.category || 'general',
      })),
    };
  });
}
