// ─── Player of the Match utilities ────────────────────────────────────────────
//
// Pure functions for selecting and scoring the standout player from a single
// game/scrimmage/tournament session based on observation data.
//
// Scoring: positiveCount × 3 + uniqueCategories × 2 + totalObs (tie-breaker)
// Requirement: ≥ 2 total observations from ≥ 2 different players.

import type { SessionType } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MatchObs {
  player_id: string;
  player_name: string;
  sentiment: 'positive' | 'needs-work' | 'neutral';
  category: string;
  text: string;
}

export interface MatchCandidate {
  player_id: string;
  player_name: string;
  score: number;
  positive_count: number;
  total_count: number;
  top_categories: string[];
  highlight_obs: MatchObs[];  // up to 3 positive observations to surface in the card
}

export interface PlayerOfMatchResult {
  player_name: string;
  session_label: string;   // e.g. "vs. Lincoln" or "Practice Match"
  headline: string;        // 5–8 word catchy phrase
  achievement: string;     // 2–3 sentences of what they did well
  key_moment: string;      // 1–2 sentences quoting a specific observation
  coach_message: string;   // warm 1-sentence coach shoutout
}

// ─── Session type helpers ─────────────────────────────────────────────────────

/** Returns true for session types that can have a Player of the Match. */
export function isMatchSessionType(type: SessionType | string): boolean {
  return type === 'game' || type === 'scrimmage' || type === 'tournament';
}

// ─── Observation helpers ──────────────────────────────────────────────────────

/** Group observations by player_id. */
export function groupMatchObsByPlayer(
  obs: MatchObs[]
): Record<string, MatchObs[]> {
  const grouped: Record<string, MatchObs[]> = {};
  for (const o of obs) {
    if (!o.player_id) continue;
    (grouped[o.player_id] ??= []).push(o);
  }
  return grouped;
}

/** Count positive observations in a set. */
export function countPositiveMatchObs(obs: MatchObs[]): number {
  return obs.filter((o) => o.sentiment === 'positive').length;
}

/** Return unique skill categories from a set of observations. */
export function getUniqueMatchCategories(obs: MatchObs[]): string[] {
  return [...new Set(obs.map((o) => o.category).filter(Boolean))];
}

/** Compute match score for a single player. */
export function calculateMatchScore(obs: MatchObs[]): number {
  const positiveCount = countPositiveMatchObs(obs);
  const categoryCount = getUniqueMatchCategories(obs).length;
  const total = obs.length;
  return positiveCount * 3 + categoryCount * 2 + total;
}

/** Select up to `limit` positive observations for the highlight strip. */
export function getHighlightObs(obs: MatchObs[], limit = 3): MatchObs[] {
  return obs.filter((o) => o.sentiment === 'positive').slice(0, limit);
}

// ─── Candidate selection ──────────────────────────────────────────────────────

/** Rank all players by match score, highest first.  Only includes players
 *  with at least 1 observation. */
export function rankMatchCandidates(
  grouped: Record<string, MatchObs[]>
): MatchCandidate[] {
  return Object.entries(grouped)
    .map(([player_id, obs]) => ({
      player_id,
      player_name: obs[0]?.player_name ?? 'Unknown',
      score: calculateMatchScore(obs),
      positive_count: countPositiveMatchObs(obs),
      total_count: obs.length,
      top_categories: getUniqueMatchCategories(obs),
      highlight_obs: getHighlightObs(obs),
    }))
    .sort((a, b) => b.score - a.score);
}

/** Pick the top-ranked candidate.  Returns null when nobody qualifies. */
export function selectMatchCandidate(
  grouped: Record<string, MatchObs[]>
): MatchCandidate | null {
  const ranked = rankMatchCandidates(grouped);
  return ranked.length > 0 ? ranked[0] : null;
}

// ─── Data sufficiency ─────────────────────────────────────────────────────────

/** Minimum data gate: ≥ 2 observations from ≥ 2 different players. */
export function hasEnoughDataForMatchMVP(obs: MatchObs[]): boolean {
  if (obs.length < 2) return false;
  const players = new Set(obs.map((o) => o.player_id).filter(Boolean));
  return players.size >= 2;
}

// ─── Share text ───────────────────────────────────────────────────────────────

/** Build a WhatsApp-ready share message for the Player of the Match card. */
export function buildMatchShareText(
  result: PlayerOfMatchResult,
  teamName: string,
  coachName: string
): string {
  const lines = [
    `🏅 Player of the Match — ${teamName}`,
    `${result.session_label}`,
    '',
    `⭐ ${result.player_name}: ${result.headline}`,
    '',
    result.achievement,
    '',
    result.key_moment ? `💬 "${result.key_moment}"` : '',
    '',
    `— ${coachName} · Powered by SportsIQ`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');
  return lines.replace(/\n{3,}/g, '\n\n').trim();
}

/** Build session label for the card (e.g. "vs. Lincoln" or "Tournament Day"). */
export function buildMatchSessionLabel(
  type: string,
  opponent?: string | null,
  date?: string | null
): string {
  const dateStr = date ? new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
  if (opponent) {
    const typeLabel = type === 'tournament' ? 'Tournament' : type === 'scrimmage' ? 'Scrimmage' : 'Game';
    return dateStr ? `${typeLabel} vs. ${opponent} · ${dateStr}` : `${typeLabel} vs. ${opponent}`;
  }
  const label = type === 'tournament' ? 'Tournament Day' : type === 'scrimmage' ? 'Scrimmage' : 'Game Day';
  return dateStr ? `${label} · ${dateStr}` : label;
}

// ─── Validation helpers ───────────────────────────────────────────────────────

export function isValidMatchResult(data: unknown): data is PlayerOfMatchResult {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.player_name === 'string' &&
    typeof d.headline === 'string' &&
    typeof d.achievement === 'string' &&
    typeof d.coach_message === 'string'
  );
}

// ─── Styling helpers ──────────────────────────────────────────────────────────

/** Card border/background accent for the Player of the Match theme (gold). */
export function getMatchAccentClasses(): {
  card: string;
  header: string;
  badge: string;
  share: string;
} {
  return {
    card: 'border-yellow-500/30 bg-yellow-500/5',
    header: 'text-yellow-400',
    badge: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300',
    share: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300 hover:bg-yellow-500/15',
  };
}
