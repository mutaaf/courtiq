/**
 * coach-reflection-utils.ts
 *
 * Pure utility functions for the Coach Reflection Journal feature.
 * All functions are side-effect free and fully testable without mocking.
 */

export type ReflectionCategory =
  | 'player_development'
  | 'team_dynamics'
  | 'coaching_approach'
  | 'session_design';

export interface ReflectionQuestion {
  id: string;
  question: string;
  context: string;
  category: ReflectionCategory;
}

export interface CoachReflectionContent {
  session_summary: string;
  questions: ReflectionQuestion[];
  growth_focus: string;
  sessionId?: string;
  answers?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Answer utilities
// ---------------------------------------------------------------------------

/** Returns true if the answer string is non-empty (trimmed). */
export function isValidReflectionAnswer(answer: string): boolean {
  return typeof answer === 'string' && answer.trim().length > 0;
}

/** Count how many questions have non-empty answers. */
export function countAnsweredQuestions(
  reflection: CoachReflectionContent
): number {
  if (!reflection.answers) return 0;
  return reflection.questions.filter((q) =>
    isValidReflectionAnswer(reflection.answers![q.id] ?? '')
  ).length;
}

/** True when every question has a non-empty answer. */
export function hasAllAnswers(reflection: CoachReflectionContent): boolean {
  if (!reflection.questions.length) return false;
  return countAnsweredQuestions(reflection) === reflection.questions.length;
}

/** True when at least one question has a non-empty answer. */
export function hasAnyAnswer(reflection: CoachReflectionContent): boolean {
  return countAnsweredQuestions(reflection) > 0;
}

/** Truncate an answer to maxLength characters, appending "…" when needed. */
export function truncateAnswer(answer: string, maxLength: number): string {
  if (!answer || answer.length <= maxLength) return answer;
  return answer.slice(0, maxLength).trimEnd() + '…';
}

// ---------------------------------------------------------------------------
// Category utilities
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<ReflectionCategory, string> = {
  player_development: 'Player Development',
  team_dynamics: 'Team Dynamics',
  coaching_approach: 'Coaching Approach',
  session_design: 'Session Design',
};

const CATEGORY_COLORS: Record<ReflectionCategory, string> = {
  player_development: 'text-emerald-400',
  team_dynamics: 'text-blue-400',
  coaching_approach: 'text-orange-400',
  session_design: 'text-purple-400',
};

/** Human-readable label for a reflection category. */
export function getCategoryLabel(category: ReflectionCategory | string): string {
  return CATEGORY_LABELS[category as ReflectionCategory] ?? category;
}

/** Tailwind color class for a reflection category. */
export function getCategoryColor(category: ReflectionCategory | string): string {
  return CATEGORY_COLORS[category as ReflectionCategory] ?? 'text-zinc-400';
}

/** True if the string is a valid ReflectionCategory. */
export function isValidCategory(value: string): value is ReflectionCategory {
  return value in CATEGORY_LABELS;
}

// ---------------------------------------------------------------------------
// Observation analysis utilities
// ---------------------------------------------------------------------------

export interface ObservationRow {
  player_id: string | null;
  sentiment: string;
  category: string;
  text: string;
}

/** Count observations by sentiment. */
export function countBySentiment(
  obs: ObservationRow[]
): { positive: number; needsWork: number; neutral: number } {
  return obs.reduce(
    (acc, o) => {
      if (o.sentiment === 'positive') acc.positive += 1;
      else if (o.sentiment === 'needs-work') acc.needsWork += 1;
      else acc.neutral += 1;
      return acc;
    },
    { positive: 0, needsWork: 0, neutral: 0 }
  );
}

/** Compute a health score (0-100) as percent positive of all player observations. */
export function calculateHealthScore(obs: ObservationRow[]): number {
  const playerObs = obs.filter((o) => o.player_id);
  if (!playerObs.length) return 0;
  const positive = playerObs.filter((o) => o.sentiment === 'positive').length;
  return Math.round((positive / playerObs.length) * 100);
}

/** Count how many unique players were observed. */
export function countObservedPlayers(obs: ObservationRow[]): number {
  const ids = new Set(obs.filter((o) => o.player_id).map((o) => o.player_id));
  return ids.size;
}

/** Return player IDs that are in the roster but have no observations. */
export function getUnobservedPlayerIds(
  obs: ObservationRow[],
  rosterIds: string[]
): string[] {
  const seen = new Set(obs.filter((o) => o.player_id).map((o) => o.player_id));
  return rosterIds.filter((id) => !seen.has(id));
}

/** Aggregate observations by category, sorted by total descending. */
export function aggregateByCategory(
  obs: ObservationRow[]
): Array<{ category: string; total: number; positive: number; needsWork: number }> {
  const map = new Map<string, { total: number; positive: number; needsWork: number }>();
  for (const o of obs) {
    const cat = o.category || 'General';
    const entry = map.get(cat) ?? { total: 0, positive: 0, needsWork: 0 };
    entry.total += 1;
    if (o.sentiment === 'positive') entry.positive += 1;
    if (o.sentiment === 'needs-work') entry.needsWork += 1;
    map.set(cat, entry);
  }
  return Array.from(map.entries())
    .map(([category, counts]) => ({ category, ...counts }))
    .sort((a, b) => b.total - a.total);
}

// ---------------------------------------------------------------------------
// Share / export utilities
// ---------------------------------------------------------------------------

/** Build a plain-text version of a completed reflection for clipboard sharing. */
export function buildReflectionShareText(
  reflection: CoachReflectionContent,
  sessionLabel: string
): string {
  const lines: string[] = [
    `Coach Reflection — ${sessionLabel}`,
    '',
    reflection.session_summary,
    '',
    '--- Reflections ---',
  ];

  for (const q of reflection.questions) {
    lines.push('');
    lines.push(`[${getCategoryLabel(q.category)}] ${q.question}`);
    const answer = reflection.answers?.[q.id];
    if (answer && isValidReflectionAnswer(answer)) {
      lines.push(`Answer: ${answer}`);
    } else {
      lines.push('Answer: (not yet answered)');
    }
  }

  lines.push('');
  lines.push(`Growth Focus: ${reflection.growth_focus}`);

  return lines.join('\n');
}

/** Summarize a reflection for display in the Plans list (max 120 chars). */
export function buildReflectionPreview(reflection: CoachReflectionContent): string {
  const answered = countAnsweredQuestions(reflection);
  const total = reflection.questions.length;
  const suffix =
    answered === total
      ? 'All questions answered'
      : answered === 0
      ? 'Not yet answered'
      : `${answered}/${total} questions answered`;
  return truncateAnswer(reflection.session_summary, 80) + ` · ${suffix}`;
}

// ---------------------------------------------------------------------------
// Completion / progress utilities
// ---------------------------------------------------------------------------

/** Completion ratio 0-1 for a reflection. */
export function reflectionProgress(reflection: CoachReflectionContent): number {
  const total = reflection.questions.length;
  if (!total) return 0;
  return countAnsweredQuestions(reflection) / total;
}

/** Group questions by category. */
export function groupQuestionsByCategory(
  questions: ReflectionQuestion[]
): Record<ReflectionCategory, ReflectionQuestion[]> {
  const groups: Record<ReflectionCategory, ReflectionQuestion[]> = {
    player_development: [],
    team_dynamics: [],
    coaching_approach: [],
    session_design: [],
  };
  for (const q of questions) {
    if (isValidCategory(q.category)) {
      groups[q.category].push(q);
    }
  }
  return groups;
}
