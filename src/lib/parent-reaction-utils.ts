import type { ParentReaction } from '@/types/database';

export const ALLOWED_REACTIONS = ['❤️', '👏', '🌟', '🙌', '🔥'] as const;
export type AllowedReaction = (typeof ALLOWED_REACTIONS)[number];

export const MAX_MESSAGE_LENGTH = 200;
export const MAX_NAME_LENGTH = 50;

// ─── Validation ───────────────────────────────────────────────────────────────

export function isValidReaction(emoji: string): boolean {
  return (ALLOWED_REACTIONS as readonly string[]).includes(emoji);
}

export function isValidMessage(text: string | null | undefined): boolean {
  if (text == null || text.trim() === '') return true; // optional field
  return text.trim().length <= MAX_MESSAGE_LENGTH;
}

export function isValidParentName(name: string | null | undefined): boolean {
  if (name == null || name.trim() === '') return true; // optional field
  return name.trim().length <= MAX_NAME_LENGTH;
}

// ─── Display helpers ──────────────────────────────────────────────────────────

export function getReactionLabel(emoji: string): string {
  const labels: Record<string, string> = {
    '❤️': 'Love it',
    '👏': 'Great work',
    '🌟': 'Star coach',
    '🙌': 'Awesome',
    '🔥': 'On fire',
  };
  return labels[emoji] ?? 'Thanks';
}

export function formatReactionTime(createdAt: string): string {
  const date = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function buildDisplayName(reaction: ParentReaction): string {
  if (reaction.parent_name?.trim()) return reaction.parent_name.trim();
  return 'A parent';
}

// ─── Aggregation helpers ──────────────────────────────────────────────────────

export function countReactionsByType(
  reactions: ParentReaction[]
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of reactions) {
    counts[r.reaction] = (counts[r.reaction] ?? 0) + 1;
  }
  return counts;
}

export function countUnread(reactions: ParentReaction[]): number {
  return reactions.filter((r) => !r.is_read).length;
}

export function hasUnread(reactions: ParentReaction[]): boolean {
  return reactions.some((r) => !r.is_read);
}

export function getRecentReactions(
  reactions: ParentReaction[],
  days: number
): ParentReaction[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return reactions.filter((r) => new Date(r.created_at) >= cutoff);
}

export function sortNewest(reactions: ParentReaction[]): ParentReaction[] {
  return [...reactions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function hasReactions(reactions: ParentReaction[]): boolean {
  return reactions.length > 0;
}

export function getTotalReactionCount(reactions: ParentReaction[]): number {
  return reactions.length;
}

export function getReactionsWithMessages(
  reactions: ParentReaction[]
): ParentReaction[] {
  return reactions.filter((r) => r.message && r.message.trim().length > 0);
}

export function getMostUsedReaction(reactions: ParentReaction[]): string | null {
  if (reactions.length === 0) return null;
  const counts = countReactionsByType(reactions);
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

export function buildSummaryLine(reactions: ParentReaction[]): string {
  const total = reactions.length;
  if (total === 0) return 'No reactions yet';
  const withMessages = getReactionsWithMessages(reactions).length;
  const counts = countReactionsByType(reactions);
  const topEmoji = getMostUsedReaction(reactions) ?? '❤️';
  const parts = [`${total} reaction${total !== 1 ? 's' : ''}`];
  if (withMessages > 0) parts.push(`${withMessages} message${withMessages !== 1 ? 's' : ''}`);
  const topCount = counts[topEmoji] ?? 0;
  if (topCount > 0) parts.push(`${topEmoji}×${topCount}`);
  return parts.join(' · ');
}

export function groupReactionsByPlayer(
  reactions: ParentReaction[]
): Record<string, ParentReaction[]> {
  const groups: Record<string, ParentReaction[]> = {};
  for (const r of reactions) {
    const key = r.player_id ?? 'unknown';
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return groups;
}
