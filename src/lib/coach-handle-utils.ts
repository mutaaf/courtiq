// Pure helpers for the vanity coach handle (ticket 0054).
//
// Three pure functions, no database access — the API routes and the
// /settings/referrals UI all funnel through here so the validation rule and
// the proposal rule are defined exactly once. The CHECK regex on
// `coaches.handle` (supabase/migrations/051_coaches_handle.sql) enforces the
// SAME character class, and tests/migrations/coaches-handle.test.ts cross-
// checks the two so they never disagree.
//
// COPPA: the handle is a coach's own opt-in choice on their own row. Nothing
// in this file touches `players` or any minor-scoped data.

// The handle's character class:
//   - 2 to 32 chars total
//   - lowercase alphanumeric + hyphen
//   - first and last char must be alphanumeric (no leading/trailing hyphen)
// Anchored. The exact same shape lives in the migration CHECK regex.
const HANDLE_SHAPE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;

export function isValidHandleShape(handle: string): boolean {
  if (typeof handle !== 'string') return false;
  return HANDLE_SHAPE.test(handle);
}

// Reserved handles — a coach must NOT be able to claim a handle that
// collides with an existing top-level route prefix or a /coach/<sub>
// segment we might add later (the reserved list is for route-prefix
// protection only — see ticket 0054, "Out of scope: handle marketplace").
//
// Set-of-strings so isReservedHandle is O(1). All entries are lowercase;
// the helper lowercases its input before lookup so the check is case-
// insensitive.
export const RESERVED_HANDLES: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'app',
  'settings',
  'signup',
  'login',
  'share',
  'team-card',
  'season-recap',
  'plan',
  'recap',
  'programs',
  'coach',
  'parents',
  'observe',
  'org',
  'privacy',
  'terms',
  'account',
]);

export function isReservedHandle(handle: string): boolean {
  if (typeof handle !== 'string') return false;
  return RESERVED_HANDLES.has(handle.toLowerCase());
}

// Kebab-case a display name → a handle candidate that satisfies HANDLE_SHAPE
// and is not in `takenHandles` and is not reserved. If the primary candidate
// is taken/reserved, suffix with -2, -3, ... until free.
//
// Steps (deterministic — the same input always returns the same output):
//   1) NFKD-normalize and strip diacritics so "José" → "Jose".
//   2) Lowercase.
//   3) Replace any run of characters that are NOT [a-z0-9] with a single '-'.
//   4) Collapse repeated '-' into a single '-' and trim leading/trailing '-'.
//   5) If the primary is empty, fall back to 'coach'.
//   6) Cap at MAX_LEN.
//   7) If primary is in takenHandles ∪ reserved, try `${primary}-2`,
//      `${primary}-3`, ... (each capped at MAX_LEN). Stop at the first free
//      candidate; bound the search at ATTEMPTS so we never loop unbounded.
const MAX_LEN = 32;
const MAX_ATTEMPTS = 50;

function normalize(input: string): string {
  // NFKD splits accented letters into a base + combining-mark; the unicode
  // property escape drops the combining marks so "José" → "Jose". \p{M} =
  // "any mark" (combining diacritical, enclosing, spacing).
  return input.normalize('NFKD').replace(/\p{M}/gu, '');
}

function slugify(input: string): string {
  const lower = normalize(input).toLowerCase();
  // Strip apostrophes and quote-like marks FIRST so "D'Angelo" → "DAngelo"
  // → "dangelo", not "d-angelo" — a name with an apostrophe is a single
  // token, not two words joined by punctuation.
  const dequoted = lower.replace(/['’ʼ`"‘]/g, '');
  // Replace any non-alphanumeric run with a single hyphen.
  const hyphenated = dequoted.replace(/[^a-z0-9]+/g, '-');
  // Collapse repeated hyphens.
  const collapsed = hyphenated.replace(/-+/g, '-');
  // Trim leading/trailing hyphens.
  return collapsed.replace(/^-+|-+$/g, '');
}

function capLen(s: string, max: number): string {
  if (s.length <= max) return s;
  // Trim and re-strip any trailing hyphen the cap might have produced.
  return s.slice(0, max).replace(/-+$/g, '');
}

export function proposeHandle(displayName: string, takenHandles: Set<string>): string {
  const baseSlug = slugify(displayName ?? '');
  // If the input collapses to nothing (e.g. "!!!"), fall back to a safe
  // placeholder that satisfies the shape regex.
  let primary = baseSlug.length >= 2 ? baseSlug : 'coach';
  primary = capLen(primary, MAX_LEN);

  const isFree = (h: string) =>
    isValidHandleShape(h) && !takenHandles.has(h) && !isReservedHandle(h);

  if (isFree(primary)) return primary;

  // Append -2, -3, ... — each cap-trimmed to MAX_LEN.
  for (let n = 2; n < 2 + MAX_ATTEMPTS; n++) {
    const suffix = `-${n}`;
    // Trim the primary so primary + suffix still fits.
    const room = MAX_LEN - suffix.length;
    const trimmedPrimary = capLen(primary, Math.max(2, room));
    const candidate = `${trimmedPrimary}${suffix}`;
    if (isFree(candidate)) return candidate;
  }

  // Extremely unlikely fallback — bail out with a deterministic guaranteed
  // shape. The route still validates server-side, so a malformed handle
  // would 400; this never returns one.
  return capLen(primary || 'coach', MAX_LEN);
}
