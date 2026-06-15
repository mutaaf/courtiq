/**
 * Ticket 0082 — pure helpers for the parent-reaction → capture seed line.
 *
 * When a parent leaves a reaction on the portal naming a specific thing about
 * their kid ("thank you for sticking with him on his shooting"), the next
 * time the coach opens Capture for THAT kid the reaction surfaces as ONE
 * quiet zinc-500 line ABOVE the existing 0025 per-player memory line:
 *
 *   "Sarah said his shooting carried last week — what did you see today?"
 *
 * This file is the PURE side of that surface — the in-memory selection of
 * the qualifying reaction (extractReactionSeed) and the deterministic
 * derivation of the prompt's note KEY (deriveNoteKey). No DB access, no AI
 * call, no React. The route widens the existing Capture player-card data
 * fetch to read the most-recent qualifying `parent_reactions` row; the
 * component renders one zinc-500 line.
 *
 * Voice contract (LESSONS#0023): the helper preserves the parent's exact
 * words — no AI rephrasing, no marketing-voice rewriting. The pronoun is
 * ALWAYS "their" in the rendered prompt (the player table has no gender
 * field per LESSONS#0036 / #0078 — inventing one is a bigger voice failure
 * than the voice-neutral form). The "A parent" fallback is used when
 * parent_first_name is null/empty so the rendered prompt never reads with
 * an awkward leading blank or the word "anonymous".
 *
 * COPPA contract (LESSONS#0036 / #0072): the helper's input shape allow-
 * lists ONLY (player_id, parent_first_name, note, created_at). The route's
 * explicit `.select()` matches that allow-list; never read parent_email /
 * parent_phone / share_token / coach_reply_id / coach_reply_at / is_read /
 * the reaction emoji from the row, and never `delete` a field on the DB row
 * — spread to a new object if filtering is needed.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReactionRow {
  player_id: string;
  /**
   * The parent's first name (sanitized at write time on the portal). `null`
   * when the parent left no name — the helper substitutes the literal word
   * "A parent" so the rendered prompt never reads "anonymous" or with a
   * leading blank.
   */
  parent_first_name: string | null;
  /**
   * The parent's freely-typed note. `null` for heart-only reactions (which
   * the helper excludes; the seed needs specific words).
   */
  note: string | null;
  /** ISO timestamp of when the reaction was created. */
  created_at: string;
}

export interface ExtractReactionSeedArgs {
  reactions: ReactionRow[];
  playerId: string;
  /** Default 14 days — the seed pulls from the last two weeks of reactions. */
  lookbackDays?: number;
  /** Default 12 chars — below this, the note is too sparse to seed a prompt. */
  minNoteLength?: number;
  /** Default 300 chars — above this, the note is too noisy to seed a prompt. */
  maxNoteLength?: number;
  /** Caller passes `Date.now()` so the helper stays pure / deterministic. */
  nowMs: number;
}

export interface ReactionSeed {
  /** Parent display name. Literal "A parent" when the original was null/empty. */
  parent_first_name: string;
  /** The parent's TRIMMED note. The rendering layer does any display truncation. */
  note: string;
  /** Same ISO timestamp from the DB row. */
  created_at: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_MIN_NOTE_LENGTH = 12;
const DEFAULT_MAX_NOTE_LENGTH = 300;
const NOTE_KEY_MIN_LENGTH = 4;
const NOTE_KEY_MAX_LENGTH = 24;
const VERBATIM_FALLBACK_MAX = 60;
const FALLBACK_PARENT_NAME = 'A parent';

// Common English stop-words for the note-key scan. Conservative list — we
// want the FIRST significant token in a parent's natural-language reaction
// ("thank you for sticking with him on his shooting" → "sticking" or
// "shooting"), so we drop the typical openers + pronouns + prepositions.
// Lowercased for case-insensitive matching.
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'have', 'has', 'had', 'was',
  'were', 'are', 'his', 'her', 'him', 'she', 'they', 'them', 'their',
  'thank', 'thanks', 'you', 'your', 'really', 'such', 'just', 'about',
  'from', 'into', 'over', 'under', 'when', 'what', 'who', 'why', 'how',
  'where', 'because', 'been', 'being', 'still', 'much', 'very', 'good',
  'great', 'love', 'loved', 'like', 'liked', 'happy',
  // Less-than-4-char tokens are filtered separately by length, but listed
  // here for clarity when reading the stop-word set.
]);

// ─── extractReactionSeed ────────────────────────────────────────────────────

/**
 * Pick the SINGLE most-recent qualifying parent reaction for the named
 * player. A reaction qualifies when:
 *
 *   - it belongs to the player (player_id === args.playerId);
 *   - its note is non-null and, trimmed, has length in [min, max];
 *   - its created_at is within the lookback window of nowMs.
 *
 * Returns the qualifying reaction with the LATEST created_at, or null when
 * nothing qualifies. The returned `note` is trimmed; the `parent_first_name`
 * is replaced with the literal "A parent" when the original is null/empty
 * (NEVER "anonymous", NEVER an empty string — see Voice contract above).
 *
 * Pure function. Deterministic across input order. No DB / network / AI.
 */
export function extractReactionSeed(args: ExtractReactionSeedArgs): ReactionSeed | null {
  const {
    reactions,
    playerId,
    lookbackDays = DEFAULT_LOOKBACK_DAYS,
    minNoteLength = DEFAULT_MIN_NOTE_LENGTH,
    maxNoteLength = DEFAULT_MAX_NOTE_LENGTH,
    nowMs,
  } = args;

  if (!reactions.length || !playerId) return null;

  const cutoffMs = nowMs - lookbackDays * DAY_MS;

  // Per LESSONS#0072 — we never mutate the input rows; we filter into a new
  // array and shape the winner into a new object.
  const qualifying: ReactionRow[] = [];
  for (const r of reactions) {
    if (r.player_id !== playerId) continue;
    if (r.note == null) continue;
    const trimmed = r.note.trim();
    if (trimmed.length < minNoteLength) continue;
    if (trimmed.length > maxNoteLength) continue;
    const createdMs = Date.parse(r.created_at);
    if (!Number.isFinite(createdMs)) continue;
    if (createdMs < cutoffMs) continue;
    if (createdMs > nowMs) continue;
    qualifying.push(r);
  }

  if (qualifying.length === 0) return null;

  // Latest created_at wins. Tie-break by created_at descending lexicographic
  // ISO compare so the choice is deterministic across input order.
  qualifying.sort((a, b) => {
    if (a.created_at < b.created_at) return 1;
    if (a.created_at > b.created_at) return -1;
    return 0;
  });

  const top = qualifying[0];
  const nameRaw = top.parent_first_name?.trim() ?? '';
  const displayName = nameRaw.length === 0 ? FALLBACK_PARENT_NAME : nameRaw;

  return {
    parent_first_name: displayName,
    note: top.note!.trim(),
    created_at: top.created_at,
  };
}

// ─── deriveNoteKey ──────────────────────────────────────────────────────────

/**
 * Single-pass token scan over a parent's note. Returns the FIRST token that
 * is (a) at least NOTE_KEY_MIN_LENGTH chars long AND (b) not in the stop-word
 * set, truncated at NOTE_KEY_MAX_LENGTH chars. When no token qualifies (the
 * note is all stop-words / short tokens), falls back to the verbatim note
 * truncated at VERBATIM_FALLBACK_MAX with an ellipsis.
 *
 * The returned string is the source for the seed-line template's NOTE_KEY
 * substitution — e.g. for the note "thank you for sticking with him on his
 * shooting" the key is "sticking" (or "shooting" depending on the stop-word
 * list), so the seed line reads:
 *
 *   "Sarah said their <NOTE_KEY> carried last week — what did you see today?"
 *
 * Deterministic. No AI. No DB. The returned string is the parent's OWN words
 * — never an invented synonym, never an AI rephrase.
 */
export function deriveNoteKey(note: string): string {
  if (!note) return '';

  // Tokenize on whitespace + a small set of natural-language punctuation so
  // "him,shooting" still splits. The scan is single-pass per the AC.
  const tokens = note.split(/[\s,.;:!?()'"`]+/).filter(Boolean);

  for (const raw of tokens) {
    const lower = raw.toLowerCase();
    if (lower.length < NOTE_KEY_MIN_LENGTH) continue;
    if (STOP_WORDS.has(lower)) continue;
    return raw.slice(0, NOTE_KEY_MAX_LENGTH);
  }

  // Verbatim fallback — truncate at 60 chars with an ellipsis if longer.
  const trimmed = note.trim();
  if (trimmed.length <= VERBATIM_FALLBACK_MAX) return trimmed;
  return `${trimmed.slice(0, VERBATIM_FALLBACK_MAX)}…`;
}

// ─── Seed-line template ─────────────────────────────────────────────────────

/**
 * Compose the rendered seed-line text. Kept as a pure helper so the
 * component test can scan its output for the voice contract (banned words,
 * pronoun, "A parent" fallback) without rendering the React tree.
 *
 * Pronoun is ALWAYS "their" — the player table has no gender field
 * (LESSONS#0036 / #0078); inventing one is a bigger voice failure than the
 * voice-neutral form. NEVER reads "his shooting" / "her shooting" derived
 * from a player-gender lookup; there IS no such lookup.
 *
 * The template is positive-voice per LESSONS#0023 — it asks the coach "what
 * did you see today" (an observation invitation), never the marketing-voice
 * hype words AGENTS.md bans.
 */
export function composeSeedLine(seed: ReactionSeed): string {
  const noteKey = deriveNoteKey(seed.note);
  // The pronoun is fixed at "their" — see comment above.
  return `${seed.parent_first_name} said their ${noteKey} carried last week — what did you see today?`;
}
