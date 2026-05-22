// Pure utilities for the "Quick Wins" home dashboard card.
// Surfaces 1-3 personalized micro-actions derived from a coach's data gaps.

export type ActionType =
  | 'rate_session'
  | 'ai_debrief'
  | 'add_jersey'
  | 'add_parent_contact'
  | 'set_weekly_focus'
  | 'generate_plan'
  | 'weekly_star';

export interface QuickWinAction {
  type: ActionType;
  priority: number;
  title: string;
  subtitle: string;
  href: string;
  estimatedSeconds: number;
}

export interface ActionPlayer {
  id: string;
  name: string;
  jersey_number?: number | null;
  parent_email?: string | null;
  parent_phone?: string | null;
}

export interface ActionSession {
  id: string;
  type: string;
  date: string;
  quality_rating?: number | null;
  coach_debrief_extracts?: unknown;
  observations?: [{ count: number }];
}

export interface GatherActionsParams {
  lastSession: ActionSession | null;
  players: ActionPlayer[];
  obsCount: number;
  sessionCount: number;
  weeklyFocusSet: boolean;
  planGeneratedThisWeek: boolean;
  weeklyStarGeneratedThisWeek: boolean;
}

// ── Player helpers ────────────────────────────────────────────────────────────

export function hasPlayerJersey(player: ActionPlayer): boolean {
  return player.jersey_number != null;
}

export function hasPlayerEmail(player: ActionPlayer): boolean {
  return typeof player.parent_email === 'string' && player.parent_email.trim().length > 0;
}

export function hasPlayerPhone(player: ActionPlayer): boolean {
  return typeof player.parent_phone === 'string' && player.parent_phone.trim().length > 0;
}

export function hasPlayerParentContact(player: ActionPlayer): boolean {
  return hasPlayerEmail(player) || hasPlayerPhone(player);
}

export function countPlayersWithoutJersey(players: ActionPlayer[]): number {
  return players.filter((p) => !hasPlayerJersey(p)).length;
}

export function countPlayersWithoutParentContact(players: ActionPlayer[]): number {
  return players.filter((p) => !hasPlayerParentContact(p)).length;
}

export function getPlayersWithoutJersey(players: ActionPlayer[]): ActionPlayer[] {
  return players.filter((p) => !hasPlayerJersey(p));
}

export function getPlayersWithoutParentContact(players: ActionPlayer[]): ActionPlayer[] {
  return players.filter((p) => !hasPlayerParentContact(p));
}

// ── Session helpers ───────────────────────────────────────────────────────────

export function getSessionObsCount(session: ActionSession): number {
  return session.observations?.[0]?.count ?? 0;
}

export function sessionNeedsRating(session: ActionSession): boolean {
  return session.quality_rating == null;
}

export function sessionNeedsDebrief(session: ActionSession): boolean {
  return session.coach_debrief_extracts == null && getSessionObsCount(session) >= 3;
}

export function isGameSession(session: ActionSession): boolean {
  return ['game', 'scrimmage', 'tournament'].includes(session.type);
}

// ── Gate check ────────────────────────────────────────────────────────────────

export function hasSufficientDataForWins(obsCount: number, sessionCount: number): boolean {
  return sessionCount >= 1;
}

// ── Action builders ───────────────────────────────────────────────────────────

export function buildRateSessionAction(session: ActionSession): QuickWinAction {
  const typeLabel = isGameSession(session) ? 'game' : 'practice';
  return {
    type: 'rate_session',
    priority: 1,
    title: `Rate your last ${typeLabel}`,
    subtitle: 'Takes 5 seconds. Builds your session quality trend.',
    href: `/sessions/${session.id}`,
    estimatedSeconds: 5,
  };
}

export function buildDebriefAction(session: ActionSession): QuickWinAction {
  return {
    type: 'ai_debrief',
    priority: 2,
    title: 'Get AI insights from last session',
    subtitle: `${getSessionObsCount(session)} observations ready to analyze.`,
    href: `/sessions/${session.id}?fromPractice=1`,
    estimatedSeconds: 15,
  };
}

export function buildAddJerseyAction(count: number): QuickWinAction {
  return {
    type: 'add_jersey',
    priority: 3,
    title: `Add jersey numbers (${count} missing)`,
    subtitle: 'Helps Quick Capture and Practice Timer identify players faster.',
    href: '/roster',
    estimatedSeconds: 60,
  };
}

export function buildAddParentContactAction(count: number): QuickWinAction {
  return {
    type: 'add_parent_contact',
    priority: 4,
    title: `Add parent contact info (${count} players)`,
    subtitle: 'Unlocks one-tap WhatsApp updates after every session.',
    href: '/roster',
    estimatedSeconds: 120,
  };
}

export function buildSetWeeklyFocusAction(): QuickWinAction {
  return {
    type: 'set_weekly_focus',
    priority: 5,
    title: 'Set a skill focus for this week',
    subtitle: "Drill recommendations and plans align to your team's weekly theme.",
    href: '/home',
    estimatedSeconds: 10,
  };
}

export function buildGeneratePlanAction(): QuickWinAction {
  return {
    type: 'generate_plan',
    priority: 6,
    title: 'Generate a practice plan',
    subtitle: 'AI will use your observation data to build a targeted session.',
    href: '/plans',
    estimatedSeconds: 20,
  };
}

export function buildWeeklyStarAction(): QuickWinAction {
  return {
    type: 'weekly_star',
    priority: 7,
    title: 'Recognize your Player of the Week',
    subtitle: 'Share it with parents to celebrate a standout performer.',
    href: '/plans',
    estimatedSeconds: 20,
  };
}

// ── Action icon ───────────────────────────────────────────────────────────────

export function getActionIcon(type: ActionType): string {
  const icons: Record<ActionType, string> = {
    rate_session: '⭐',
    ai_debrief: '✨',
    add_jersey: '#️⃣',
    add_parent_contact: '📱',
    set_weekly_focus: '🎯',
    generate_plan: '📋',
    weekly_star: '🏆',
  };
  return icons[type] ?? '✓';
}

// ── Time formatting ───────────────────────────────────────────────────────────

export function formatEstimatedTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.round(seconds / 60);
  return `${mins} min`;
}

// ── Dismiss helpers ───────────────────────────────────────────────────────────

export function buildDismissKey(type: ActionType, teamId: string): string {
  return `quick-win-dismiss:${teamId}:${type}`;
}

export function isActionDismissed(type: ActionType, teamId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(buildDismissKey(type, teamId));
    if (!raw) return false;
    const expiry = parseInt(raw, 10);
    return Date.now() < expiry;
  } catch {
    return false;
  }
}

export function dismissAction(type: ActionType, teamId: string, ttlHours = 24): void {
  if (typeof window === 'undefined') return;
  try {
    const expiry = Date.now() + ttlHours * 60 * 60 * 1000;
    window.localStorage.setItem(buildDismissKey(type, teamId), String(expiry));
  } catch {
    // ignore
  }
}

export function clearDismiss(type: ActionType, teamId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(buildDismissKey(type, teamId));
  } catch {
    // ignore
  }
}

// ── Gather + rank ─────────────────────────────────────────────────────────────

export function gatherAllActions(params: GatherActionsParams): QuickWinAction[] {
  const {
    lastSession,
    players,
    obsCount,
    sessionCount,
    weeklyFocusSet,
    planGeneratedThisWeek,
    weeklyStarGeneratedThisWeek,
  } = params;

  const actions: QuickWinAction[] = [];

  if (lastSession && sessionNeedsRating(lastSession)) {
    actions.push(buildRateSessionAction(lastSession));
  }

  if (lastSession && sessionNeedsDebrief(lastSession)) {
    actions.push(buildDebriefAction(lastSession));
  }

  const jerseyMissing = countPlayersWithoutJersey(players);
  if (jerseyMissing >= 3) {
    actions.push(buildAddJerseyAction(jerseyMissing));
  }

  const contactMissing = countPlayersWithoutParentContact(players);
  if (contactMissing >= 3) {
    actions.push(buildAddParentContactAction(contactMissing));
  }

  if (!weeklyFocusSet && obsCount >= 5 && sessionCount >= 1) {
    actions.push(buildSetWeeklyFocusAction());
  }

  if (!planGeneratedThisWeek && obsCount >= 10) {
    actions.push(buildGeneratePlanAction());
  }

  if (!weeklyStarGeneratedThisWeek && obsCount >= 7) {
    actions.push(buildWeeklyStarAction());
  }

  return actions;
}

export function rankActions(actions: QuickWinAction[]): QuickWinAction[] {
  return [...actions].sort((a, b) => a.priority - b.priority);
}

export function selectTopActions(actions: QuickWinAction[], maxCount = 3): QuickWinAction[] {
  return rankActions(actions).slice(0, maxCount);
}

export function filterUndismissedActions(
  actions: QuickWinAction[],
  teamId: string,
): QuickWinAction[] {
  return actions.filter((a) => !isActionDismissed(a.type, teamId));
}
