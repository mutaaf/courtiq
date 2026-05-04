// ─── Player Growth Streak ─────────────────────────────────────────────────────
//
// A "growth streak" counts consecutive practice sessions where a player received
// at least one positive observation. It is human-readable ("3 sessions in a row!")
// and distinct from the algorithmic Momentum Score — coaches can explain it to
// players and parents in plain language.
//
// All functions are pure and side-effect free for easy unit testing.
// Computed entirely from the observations already loaded on the player detail
// page — no extra API routes, DB tables, or AI calls required.

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GrowthObs {
  session_id: string | null;
  sentiment: string;
  created_at: string;
}

export interface SessionBucket {
  sessionKey: string;      // session_id or a synthetic key for null-session obs
  latestAt: string;        // ISO timestamp of most-recent obs in this session
  hasPositive: boolean;
  hasNeedsWork: boolean;
  obsCount: number;
}

export interface GrowthStreakData {
  currentStreak: number;                // consecutive sessions with ≥1 positive obs
  longestStreak: number;                // longest run in the loaded observation window
  totalObservedSessions: number;        // sessions where the player had any observation
  positiveSessionCount: number;         // sessions with at least one positive
  lastPositiveAt: string | null;        // ISO timestamp of last positive obs
  hasAnyPositive: boolean;
}

// ─── Bucketing ────────────────────────────────────────────────────────────────

export function groupObsBySession(obs: GrowthObs[]): SessionBucket[] {
  const map = new Map<string, SessionBucket>();
  let nullCounter = 0;

  for (const o of obs) {
    const key = o.session_id ?? `__no_session_${nullCounter++}`;
    const existing = map.get(key);
    if (existing) {
      if (o.created_at > existing.latestAt) existing.latestAt = o.created_at;
      if (o.sentiment === 'positive') existing.hasPositive = true;
      if (o.sentiment === 'needs-work') existing.hasNeedsWork = true;
      existing.obsCount += 1;
    } else {
      map.set(key, {
        sessionKey: key,
        latestAt: o.created_at,
        hasPositive: o.sentiment === 'positive',
        hasNeedsWork: o.sentiment === 'needs-work',
        obsCount: 1,
      });
    }
  }

  return Array.from(map.values());
}

export function sortBucketsDesc(buckets: SessionBucket[]): SessionBucket[] {
  return [...buckets].sort((a, b) => (a.latestAt > b.latestAt ? -1 : 1));
}

// ─── Streak calculation ───────────────────────────────────────────────────────

export function calculateCurrentStreak(sortedDesc: SessionBucket[]): number {
  let streak = 0;
  for (const bucket of sortedDesc) {
    if (bucket.hasPositive) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function calculateLongestStreak(sortedDesc: SessionBucket[]): number {
  let longest = 0;
  let current = 0;
  for (const bucket of sortedDesc) {
    if (bucket.hasPositive) {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

export function countPositiveSessions(buckets: SessionBucket[]): number {
  return buckets.filter((b) => b.hasPositive).length;
}

export function getLastPositiveAt(obs: GrowthObs[]): string | null {
  const positives = obs.filter((o) => o.sentiment === 'positive');
  if (!positives.length) return null;
  return positives.reduce((latest, o) => (o.created_at > latest ? o.created_at : latest), positives[0].created_at);
}

// ─── Main entry ───────────────────────────────────────────────────────────────

export function buildGrowthStreakData(obs: GrowthObs[]): GrowthStreakData {
  if (!obs.length) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalObservedSessions: 0,
      positiveSessionCount: 0,
      lastPositiveAt: null,
      hasAnyPositive: false,
    };
  }

  const buckets = groupObsBySession(obs);
  const sorted = sortBucketsDesc(buckets);
  const currentStreak = calculateCurrentStreak(sorted);
  const longestStreak = calculateLongestStreak(sorted);
  const positiveSessionCount = countPositiveSessions(buckets);
  const lastPositiveAt = getLastPositiveAt(obs);

  return {
    currentStreak,
    longestStreak,
    totalObservedSessions: buckets.length,
    positiveSessionCount,
    lastPositiveAt,
    hasAnyPositive: positiveSessionCount > 0,
  };
}

// ─── Guard ────────────────────────────────────────────────────────────────────

export function hasEnoughDataForGrowthStreak(obs: GrowthObs[]): boolean {
  if (!obs.length) return false;
  const buckets = groupObsBySession(obs);
  // Need at least 2 distinct sessions with observations to show a meaningful streak
  return buckets.length >= 2;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function getStreakEmoji(streak: number): string {
  if (streak === 0) return '';
  if (streak === 1) return '🌱';
  if (streak === 2) return '🌿';
  if (streak <= 4) return '🔥';
  if (streak <= 7) return '⚡';
  return '🏆';
}

export function getStreakLabel(streak: number): string {
  if (streak === 0) return '';
  if (streak === 1) return 'First positive session!';
  if (streak === 2) return 'Two in a row!';
  if (streak === 3) return 'Three in a row!';
  if (streak <= 5) return 'On a roll!';
  if (streak <= 9) return 'Hot streak!';
  return 'Unstoppable!';
}

export function formatStreakCount(count: number): string {
  return count === 1 ? '1 session' : `${count} sessions`;
}

export function getStreakBadgeClasses(streak: number): string {
  if (streak <= 0) return 'bg-zinc-800 text-zinc-400';
  if (streak <= 2) return 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40';
  if (streak <= 4) return 'bg-orange-900/50 text-orange-300 border border-orange-700/40';
  return 'bg-amber-900/50 text-amber-300 border border-amber-700/40';
}

export function getStreakTextColor(streak: number): string {
  if (streak <= 0) return 'text-zinc-500';
  if (streak <= 2) return 'text-emerald-400';
  if (streak <= 4) return 'text-orange-400';
  return 'text-amber-400';
}

export function isHotStreak(data: GrowthStreakData): boolean {
  return data.currentStreak >= 3;
}

export function isStreakActive(data: GrowthStreakData): boolean {
  return data.currentStreak > 0;
}

export function buildShareText(data: GrowthStreakData, playerName: string): string {
  const first = playerName.split(' ')[0];
  if (data.currentStreak >= 3) {
    return `🔥 ${first} has had positive coaching feedback for ${formatStreakCount(data.currentStreak)} in a row! #YouthSports #SportsIQ`;
  }
  if (data.currentStreak >= 1) {
    return `${getStreakEmoji(data.currentStreak)} ${first} is making progress! Positive observations in ${formatStreakCount(data.currentStreak)}. #SportsIQ`;
  }
  return `${first} is working hard at practice! #YouthSports #SportsIQ`;
}

export function buildParentMessage(data: GrowthStreakData, playerName: string): string {
  const first = playerName.split(' ')[0];
  if (data.currentStreak >= 3) {
    return `Great news! ${first} has been getting positive coaching feedback for ${formatStreakCount(data.currentStreak)} in a row. Keep up the great work!`;
  }
  if (data.currentStreak === 2) {
    return `${first} has had positive observations in their last 2 sessions — they're building momentum!`;
  }
  if (data.currentStreak === 1) {
    return `${first} had a great session with positive coaching feedback. Let's keep it going!`;
  }
  return `${first} keeps showing up and working hard. Every session counts!`;
}

export function getStreakSummaryLine(data: GrowthStreakData): string {
  if (!data.hasAnyPositive) return 'No positive sessions yet';
  if (data.currentStreak === 0) {
    return `Best streak: ${formatStreakCount(data.longestStreak)}`;
  }
  return `${formatStreakCount(data.currentStreak)} in a row`;
}
