/**
 * Player name matching utility for SportsIQ.
 *
 * After AI segmentation, player_name strings may still be slightly off due
 * to ASR errors, alternate spellings, or the AI's own approximations.
 * This module resolves those strings to roster player IDs using a tiered
 * matching strategy:
 *   1. Exact match (name / nickname / variants)
 *   2. Normalized exact match (strip non-alpha, lowercase)
 *   3. Substring containment (existing behavior)
 *   4. First-name-only match when unique in roster
 *   5. Soundex phonetic match
 *   6. Levenshtein edit-distance match (≤1 for short names, ≤2 for longer)
 */

export interface PlayerForMatch {
  id: string;
  name: string;
  nickname: string | null;
  name_variants: string[] | null;
}

// ---------------------------------------------------------------------------
// Phonetic & edit-distance helpers
// ---------------------------------------------------------------------------

const SOUNDEX_CODES: Record<string, string> = {
  B: '1', F: '1', P: '1', V: '1',
  C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
};

/** US Soundex phonetic code (4 characters). */
export function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';

  let code = s[0];
  // Initial code for the first letter; vowels / H / W / Y don't get a digit
  let prev = SOUNDEX_CODES[s[0]] ?? '0';

  for (let i = 1; i < s.length; i++) {
    const ch = s[i];
    const digit = SOUNDEX_CODES[ch] ?? '0';

    if (digit !== '0' && digit !== prev) {
      code += digit;
      if (code.length === 4) break;
    }

    // Vowels and non-coded letters (H, W, Y) reset the "previous" so that
    // identical adjacent codes separated by a vowel ARE both recorded, e.g.
    // "Leland" → L453 (not L430).
    if ('AEIOUHWY'.includes(ch)) {
      prev = '0';
    } else if (digit !== '0') {
      prev = digit;
    }
  }

  return (code + '000').slice(0, 4);
}

/** Levenshtein edit distance (space-optimised, O(n) space). */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1).fill(0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev.splice(0, b.length + 1, ...curr);
  }
  return prev[b.length];
}

// ---------------------------------------------------------------------------
// Name normalisation helpers
// ---------------------------------------------------------------------------

/** Lowercase + strip non-alpha/non-space characters. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z\s]/g, '').trim();
}

/** Return the first word (first name) of a normalized name. */
function firstName(name: string): string {
  return normalize(name).split(/\s+/)[0] ?? '';
}

// ---------------------------------------------------------------------------
// Main matcher
// ---------------------------------------------------------------------------

/**
 * Find a player by a (potentially noisy) name string.
 *
 * Tries strategies from most to least exact, returning the first match.
 * Returns null if no strategy produces a confident match.
 */
export function findPlayerByName(
  name: string,
  players: PlayerForMatch[]
): string | null {
  if (!players.length || !name.trim()) return null;

  const lower = name.toLowerCase();
  const norm = normalize(name);
  const fName = firstName(name);

  // Pre-compute candidate strings for each player once.
  const candidates = players.map((p) => {
    const rawNames = [p.name, p.nickname, ...(p.name_variants ?? [])]
      .filter((n): n is string => Boolean(n));
    const normalizedForms = rawNames.map(normalize);
    // Individual words (≥3 chars) from each name form, for word-level matching.
    const wordForms = normalizedForms.flatMap((n) =>
      n.split(/\s+/).filter((w) => w.length >= 3)
    );
    return {
      id: p.id,
      lower: rawNames.map((n) => n.toLowerCase()),
      normalized: normalizedForms,
      wordForms,
      // Also build space-stripped versions for soundex comparison.
      soundexKeys: rawNames.map((n) => soundex(normalize(n).replace(/\s+/g, ''))),
      firstNameKey: firstName(p.name),
    };
  });

  // 1. Exact case-insensitive match.
  for (const c of candidates) {
    if (c.lower.includes(lower)) return c.id;
  }

  // 2. Normalized exact match (strips punctuation like apostrophes).
  for (const c of candidates) {
    if (c.normalized.includes(norm)) return c.id;
  }

  // 3. Substring containment (original behaviour).
  for (const c of candidates) {
    if (c.lower.some((n) => n.includes(lower) || lower.includes(n))) {
      return c.id;
    }
  }

  // 4. First-name-only match — only when exactly one player has that first name.
  if (fName.length >= 3) {
    const firstNameHits = candidates.filter((c) => c.firstNameKey === fName);
    if (firstNameHits.length === 1) return firstNameHits[0].id;
  }

  // 5. Soundex phonetic match.
  const querySoundex = soundex(norm.replace(/\s+/g, ''));
  for (const c of candidates) {
    if (c.soundexKeys.includes(querySoundex)) return c.id;
  }

  // 6. Levenshtein edit-distance match.
  //    Threshold: 1 edit for names ≤6 chars, 2 edits for longer names.
  //    We compare against both full name forms AND individual words so that
  //    a query like "Zoo" (typo for "Zoe") matches against the word "zoe"
  //    from "Zoe Chen" rather than the full string "zoe chen".
  const threshold = norm.length <= 6 ? 1 : 2;
  let bestId: string | null = null;
  let bestDist = Infinity;

  for (const c of candidates) {
    const allForms = [...c.normalized, ...c.wordForms];
    for (const n of allForms) {
      const dist = editDistance(norm, n);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        bestId = c.id;
      }
    }
  }

  return bestId;
}
