// ─── Team Announcement Pure Utilities ────────────────────────────────────────
// All functions are side-effect-free and fully unit-testable.

import type { TeamAnnouncement, AnnouncementExpiry } from '@/types/database';

export const MAX_TITLE_LENGTH = 80;
export const MAX_BODY_LENGTH = 500;

// ─── Validation ──────────────────────────────────────────────────────────────

export function isValidTitle(title: string): boolean {
  const t = title.trim();
  return t.length > 0 && t.length <= MAX_TITLE_LENGTH;
}

export function isValidBody(body: string): boolean {
  const b = body.trim();
  return b.length > 0 && b.length <= MAX_BODY_LENGTH;
}

// ─── Expiry helpers ───────────────────────────────────────────────────────────

const EXPIRY_DAYS: Record<AnnouncementExpiry, number | null> = {
  '3d': 3,
  '7d': 7,
  '14d': 14,
  never: null,
};

/** Returns an ISO string for the chosen expiry, or null for "never". */
export function expiryToDate(expiry: AnnouncementExpiry, from = new Date()): string | null {
  const days = EXPIRY_DAYS[expiry];
  if (days === null) return null;
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function expiryLabel(expiry: AnnouncementExpiry): string {
  switch (expiry) {
    case '3d': return 'Expires in 3 days';
    case '7d': return 'Expires in 7 days';
    case '14d': return 'Expires in 14 days';
    case 'never': return 'No expiry';
  }
}

// ─── Active filter ────────────────────────────────────────────────────────────

/** Returns true when the announcement is not yet expired. */
export function isActive(a: TeamAnnouncement, now = new Date()): boolean {
  if (!a.expires_at) return true;
  return new Date(a.expires_at) > now;
}

export function filterActive(
  announcements: TeamAnnouncement[],
  now = new Date()
): TeamAnnouncement[] {
  return announcements.filter((a) => isActive(a, now));
}

export function filterExpired(
  announcements: TeamAnnouncement[],
  now = new Date()
): TeamAnnouncement[] {
  return announcements.filter((a) => !isActive(a, now));
}

// ─── Sorting ──────────────────────────────────────────────────────────────────

/** Newest first. */
export function sortByNewest(announcements: TeamAnnouncement[]): TeamAnnouncement[] {
  return [...announcements].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

// ─── Relative-time label ─────────────────────────────────────────────────────

export function timeUntilExpiry(a: TeamAnnouncement, now = new Date()): string {
  if (!a.expires_at) return 'No expiry';
  const ms = new Date(a.expires_at).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

// ─── Summary / counts ─────────────────────────────────────────────────────────

export function countActive(
  announcements: TeamAnnouncement[],
  now = new Date()
): number {
  return filterActive(announcements, now).length;
}

export function hasAnnouncements(announcements: TeamAnnouncement[]): boolean {
  return announcements.length > 0;
}

export function hasActiveAnnouncements(
  announcements: TeamAnnouncement[],
  now = new Date()
): boolean {
  return countActive(announcements, now) > 0;
}

/** Truncate body for preview display. */
export function truncateBody(body: string, maxLen = 120): string {
  if (body.length <= maxLen) return body;
  return body.slice(0, maxLen - 1).trimEnd() + '…';
}

/** Build a plain-text summary line for clipboard / notification use. */
export function buildAnnouncementShareText(a: TeamAnnouncement): string {
  return `📢 ${a.title}\n\n${a.body}`;
}

/** Returns the most recent active announcement, or null. */
export function getLatestActive(
  announcements: TeamAnnouncement[],
  now = new Date()
): TeamAnnouncement | null {
  const active = sortByNewest(filterActive(announcements, now));
  return active[0] ?? null;
}
