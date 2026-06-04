/**
 * Ticket 0067 — pure helpers for the sub-handoff routes.
 *
 * Extracted from the route bodies so the validation rules + the per-token
 * rate-limit can be unit-tested in isolation (LESSONS#0060 pattern).
 *
 * Reuses:
 *   - generateObserverToken / validateObserverToken from observer-utils.ts
 *     for the 24h HMAC token shape (LESSONS#0096 — do NOT re-inline).
 *   - containsBannedWord from player-trajectory-utils.ts for the voice scan
 *     (LESSONS#0023 — instruct positively; structural guarantee is the scan).
 */
import { containsBannedWord } from './player-trajectory-utils';
export { generateObserverToken, validateObserverToken } from './observer-utils';

/** AGENTS.md voice scan. Returns true when the text contains a banned word. */
export function isVoiceUnclean(text: string): boolean {
  return containsBannedWord(text);
}

/** Trim + length-validate the optional sub-name. Returns the trimmed name,
 *  or null when absent. Throws `length` when too long, `voice` when banned. */
export function validateSubFirstName(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw new Error('length');
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 40) throw new Error('length');
  if (isVoiceUnclean(trimmed)) throw new Error('voice');
  return trimmed;
}

/** Validate the sub-note text. Returns the trimmed text on success;
 *  throws `length` when empty/too-long, `voice` when banned. */
export function validateSubNoteText(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('length');
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('length');
  if (trimmed.length > 500) throw new Error('length');
  if (isVoiceUnclean(trimmed)) throw new Error('voice');
  return trimmed;
}

/** Truncate a sub-note to a short preview for the /home card. */
export function truncateForHome(text: string, max = 120): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

// ── Sub-note rate limit (in-memory, per token) ──────────────────────────────
// The sub-coach can leave at most THREE notes per token (the sub doesn't spam
// the regular coach). Idempotent re-write within the budget UPDATES the row;
// a 4th call returns 429. Process-local; mirrors the in-memory limiter shape
// in observer-utils.ts (per-IP) and parent-reactions (per-IP).

const subNoteCountByToken = new Map<string, number>();

export const SUB_NOTE_MAX_PER_TOKEN = 3;

export function tryConsumeSubNoteSlot(token: string): boolean {
  const current = subNoteCountByToken.get(token) ?? 0;
  if (current >= SUB_NOTE_MAX_PER_TOKEN) return false;
  subNoteCountByToken.set(token, current + 1);
  return true;
}

/** Test-only: clear the rate-limit map between specs. */
export function __resetSubHandoffRateLimitForTests(): void {
  subNoteCountByToken.clear();
}
