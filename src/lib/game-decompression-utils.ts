/**
 * Ticket 0069 — pure helpers for the game-decompression routes.
 *
 * Extracted from the route bodies so the validation rules can be unit-tested
 * in isolation (LESSONS#0060 pattern). NONE of these functions touch the
 * network or the DB.
 *
 * Reuses `containsBannedWord` from player-trajectory-utils.ts (the shared
 * AGENTS.md voice scan, LESSONS#0023).
 */
import { containsBannedWord } from './player-trajectory-utils';

/** AGENTS.md voice scan. Returns true when the text contains a banned word. */
export function isVoiceUnclean(text: string): boolean {
  return containsBannedWord(text);
}

/** Validate the post-loss voice transcript.
 *  Throws `length` when empty / over 1200 chars (DB CHECK constraint upper
 *  bound), `voice` when the transcript contains an AGENTS.md banned word
 *  (a decompression of a loss should still read like a clipboard, not
 *  breathless hype — LESSONS#0023). Returns the trimmed transcript. */
export function validateDecompressionTranscript(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('length');
  const trimmed = raw.trim();
  if (!trimmed) throw new Error('length');
  if (trimmed.length > 1200) throw new Error('length');
  if (isVoiceUnclean(trimmed)) throw new Error('voice');
  return trimmed;
}

/** Validate the duration. 1 to 60 seconds matches the DB CHECK constraint
 *  upper bound (a 30-second voice note, with a generous 60s ceiling). */
export function validateDecompressionDuration(raw: unknown): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new Error('length');
  }
  const v = Math.round(raw);
  if (v < 1 || v > 60) throw new Error('length');
  return v;
}

/** Defensive last-name strip on the AI `why` line.
 *
 * Per LESSONS#0061 — use a LITERAL SPACE in the regex, NOT `\s+`. A `\s+`
 * pattern conflates labelled-key newlines in a prompt body ("Player first
 * name: Maya\nAge group: …") with a real "first space last" surname
 * structure. The literal-space form catches "Maya Walker" but not "Maya"
 * followed by a newline.
 *
 * Returns the input with any surname-shape stripped. The AI prompt
 * instructs first-name-only, but the route never trusts model output:
 * any "Capitalized Capitalized" sequence is collapsed to just the first
 * capitalized word so a parent's eyes never read a full minor name on
 * the saved row.
 */
export function stripSurnameShape(why: string): string {
  if (!why) return why;
  // LESSONS#0061 — LITERAL space, not `\s+`. This catches "Maya Walker"
  // but tolerates legitimate two-word phrases that happen to be capitalized
  // for a reason (a sport-typed proper noun like "Power Forward" is left
  // alone because we only match lowercased-tail words: [A-Z][a-z]+ requires
  // a lowercase tail).
  return why.replace(/([A-Z][a-z]+) [A-Z][a-z]+/g, '$1');
}

/** The decompression session-window gate. A game/scrimmage/tournament
 *  session must have been played within the last 24 hours; the route
 *  composes the session timestamp from `(date, start_time)` because the
 *  schema has NO `started_at` column on sessions (LESSONS#0096). Falls
 *  back to `created_at` when the date/start_time can't be parsed.
 *
 *  Returns true when the session is within the 24h post-loss window. */
export function isWithinDecompressionWindow(
  session: {
    date?: string | null;
    start_time?: string | null;
    created_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  const nowMs = now.getTime();
  // Try the composed (date, start_time) first; if start_time is null, the
  // game was on the calendar day with no recorded time → use 00:00 on
  // that day. If that parses to a valid timestamp, use it; otherwise
  // fall back to created_at.
  // Per the schema (LESSONS#0096): `sessions.date` is a SQL DATE (no
  // timezone). We interpret a bare DATE as UTC midnight so the local
  // CI / dev TZ doesn't flip "today" into "tomorrow morning UTC". A
  // `start_time` (TIME) is also stored without a TZ; we compose it
  // against the same date and treat it as UTC for the same reason.
  let played: number | null = null;
  if (session.date) {
    const dt = session.start_time
      ? `${session.date}T${session.start_time}Z`
      : `${session.date}T00:00:00Z`;
    const ms = Date.parse(dt);
    if (!Number.isNaN(ms)) played = ms;
  }
  if (played === null && session.created_at) {
    const ms = Date.parse(session.created_at);
    if (!Number.isNaN(ms)) played = ms;
  }
  if (played === null) return false;
  const elapsedMs = nowMs - played;
  // The window opens at game-start (UTC) and closes 24h afterward.
  // We tolerate a small future-side budget (60 minutes) so a freshly-
  // captured session that lands a few minutes ahead of NOW under
  // wall-clock skew still counts as live; anything beyond an hour
  // ahead is treated as a not-yet-played future game.
  if (elapsedMs < -60 * 60 * 1000) return false;
  return elapsedMs <= 24 * 60 * 60 * 1000;
}

/** The session type gate. Only game/scrimmage/tournament sessions surface
 *  the decompression entry. A practice or training session reaches this
 *  shape only via a forged client body. */
export function isGameLikeSessionType(type: unknown): boolean {
  return type === 'game' || type === 'scrimmage' || type === 'tournament';
}
