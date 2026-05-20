// Pure helpers for the InviteCoachCard home-dashboard component.
// Extracted so they can be unit-tested independently of React.

export const INVITE_MIN_SESSIONS = 2;
export const INVITE_MIN_OBSERVATIONS = 10;
export const DISMISS_DURATION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ─── Dismiss helpers ──────────────────────────────────────────────────────────

export function getInviteDismissKey(coachId: string): string {
  return `sportsiq-invite-dismiss-${coachId}`;
}

export function isInviteDismissed(coachId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(getInviteDismissKey(coachId));
    if (!stored) return false;
    const expires = Number(stored);
    if (isNaN(expires)) return false; // guard against corrupt values
    return Date.now() < expires;
  } catch {
    return false;
  }
}

export function dismissInviteCard(coachId: string): void {
  if (typeof window === 'undefined') return;
  try {
    const expires = Date.now() + DISMISS_DURATION_MS;
    localStorage.setItem(getInviteDismissKey(coachId), String(expires));
  } catch {
    // ignore storage errors
  }
}

// ─── Render gating ────────────────────────────────────────────────────────────

export function meetsShowThreshold(sessions: number, observations: number): boolean {
  return sessions >= INVITE_MIN_SESSIONS && observations >= INVITE_MIN_OBSERVATIONS;
}

// ─── Message building ─────────────────────────────────────────────────────────

export function extractFirstName(fullName: string | null | undefined): string {
  const first = fullName?.split(' ')[0];
  return first || 'Coach';
}

export function buildReferralUrl(origin: string, code: string): string {
  return `${origin}/signup?ref=${code}`;
}

export interface InviteMessageParams {
  teamName: string;
  players: number;
  observations: number;
  referralUrl: string;
}

export function buildInviteMessage({
  teamName,
  players,
  observations,
  referralUrl,
}: InviteMessageParams): string {
  const playerLabel = `${players} player${players !== 1 ? 's' : ''}`;
  return (
    `Hey! I've been using SportsIQ to track my ${teamName} coaching — ` +
    `I've captured ${observations} observations across ${playerLabel} this season. ` +
    `It auto-generates parent progress reports and practice plans. ` +
    `Try it free: ${referralUrl}\n\n` +
    `(Full disclosure: I get a free month when you sign up with my link 😊)`
  );
}

export function buildReferralBadgeText(count: number): string {
  return `🎉 ${count} coach${count > 1 ? 'es' : ''} referred`;
}
