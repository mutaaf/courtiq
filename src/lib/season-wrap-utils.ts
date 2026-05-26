// ─── Ticket 0036 — season-wrap helpers ───────────────────────────────────────────
//
// Pure helpers that detect a completed season and build the coach-private
// "that's a wrap" home card from data we ALREADY collect (teams.current_week /
// season_weeks + accumulated sessions/observations). The one growth highlight is
// derived DETERMINISTICALLY from observation counts — no AI call, no quota cost —
// so a free coach is re-activated without spending a model round-trip on a passive
// card (the ticket's preferred default; mirrors season-momentum-utils 0032).
//
// Aggregate-only and coach-private: nothing here leaks per-player data to a public
// surface, and the highlight names a player only inside the coach's own home feed.

export type SeasonPhase = 'not_started' | 'in_progress' | 'complete';

/** The slice of a team row these helpers read. */
export interface WrapTeam {
  season: string | null;
  season_weeks: number | null;
  current_week: number;
}

export interface WrapSession {
  id: string;
  type: string;
  date: string;
}

export interface WrapObservation {
  player_id: string | null;
  category: string | null;
  sentiment: string;
  created_at: string;
}

export interface WrapPlayer {
  id: string;
  name: string;
}

/** What the route returns and the card renders. Factual totals + one highlight. */
export interface SeasonWrap {
  /** weeks coached — the season position, capped at season_weeks when set. */
  weeksCoached: number;
  /** practice-type sessions logged this season. */
  practiceCount: number;
  /** unique players with at least one observation this season. */
  playersObserved: number;
  /** one plain growth-highlight sentence, or null when there's nothing to show. */
  highlight: string | null;
}

/**
 * Decide the season phase from team fields + practice count alone — no DB read,
 * no AI. A team with zero practices logged is `not_started` regardless of its
 * week fields (a season the coach never actually ran has no wrap to show). With
 * practices: a set season length whose current_week has reached/passed it is
 * `complete`; everything else (no season length, or week still short of the end)
 * is `in_progress`.
 */
export function getSeasonPhase(team: WrapTeam, practiceCount: number): SeasonPhase {
  if (practiceCount <= 0) return 'not_started';
  if (team.season_weeks != null && team.season_weeks > 0 && team.current_week >= team.season_weeks) {
    return 'complete';
  }
  return 'in_progress';
}

/** Practice-type sessions only (games / scrimmages / tournaments aren't "practices"). */
export function countPractices(sessions: WrapSession[]): number {
  return sessions.filter((s) => s.type === 'practice').length;
}

/** Unique players that have at least one observation. */
export function countPlayersObserved(observations: WrapObservation[]): number {
  const ids = new Set(observations.filter((o) => o.player_id).map((o) => o.player_id as string));
  return ids.size;
}

/**
 * The season's growth highlight, computed from POSITIVE observation counts only.
 * Growth is measured by progress markers, not raw volume — a player with many
 * needs-work notes doesn't win the highlight. Names the player with the most
 * positive observations and the category they progressed most in. Clipboard
 * voice, no hype words. Returns null when there are no positive observations
 * (the card simply omits the line — no empty nag).
 */
export function buildGrowthHighlight(
  observations: WrapObservation[],
  players: WrapPlayer[],
): string | null {
  const positive = observations.filter((o) => o.sentiment === 'positive' && o.player_id);
  if (positive.length === 0) return null;

  // Most positive observations by player.
  const byPlayer: Record<string, number> = {};
  for (const o of positive) {
    const id = o.player_id as string;
    byPlayer[id] = (byPlayer[id] || 0) + 1;
  }
  const topPlayerId = Object.entries(byPlayer).sort(([, a], [, b]) => b - a)[0]?.[0];
  if (!topPlayerId) return null;

  const player = players.find((p) => p.id === topPlayerId);
  if (!player) return null;

  // The category that player progressed most in (most positive obs in it).
  const byCategory: Record<string, number> = {};
  for (const o of positive) {
    if (o.player_id !== topPlayerId) continue;
    const cat = (o.category || '').trim();
    if (!cat) continue;
    byCategory[cat] = (byCategory[cat] || 0) + 1;
  }
  const topCategory = Object.entries(byCategory).sort(([, a], [, b]) => b - a)[0]?.[0];

  // First name keeps the line short and personal on a phone screen.
  const firstName = player.name.split(' ')[0] || player.name;

  if (topCategory) {
    return `Biggest jump: ${firstName}'s ${topCategory.toLowerCase()}.`;
  }
  return `Biggest jump: ${firstName} this season.`;
}

/**
 * Build the full season wrap (factual totals + one growth highlight) from rows we
 * already collect. weeks coached comes from the team's season position: when a
 * season length is set we cap at season_weeks (current_week can overrun); without
 * one we fall back to current_week.
 */
export function buildSeasonWrap(
  team: WrapTeam,
  sessions: WrapSession[],
  observations: WrapObservation[],
  players: WrapPlayer[],
): SeasonWrap {
  const weeksCoached =
    team.season_weeks != null && team.season_weeks > 0
      ? Math.min(team.current_week, team.season_weeks)
      : team.current_week;

  return {
    weeksCoached,
    practiceCount: countPractices(sessions),
    playersObserved: countPlayersObserved(observations),
    highlight: buildGrowthHighlight(observations, players),
  };
}
