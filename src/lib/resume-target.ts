/**
 * Ticket 0035 — pure parser + path builder for the AI-quota wall's "resume after
 * upgrade" token.
 *
 * When a free coach hits the wall mid-task (e.g. generating Maya's parent report),
 * the upgrade round-trip carries an opaque `resume` string describing the blocked
 * action so the post-checkout landing can drop them back on the exact artifact.
 * The string is built CLIENT-side from what the coach was doing (it is NOT added
 * to the server's 402 body — that contract stays stable, see src/lib/ai/error.ts)
 * and is shaped `{action}:{teamId}[:{playerId}]`.
 *
 * This module is the unit-testable core (cf. 0013's `buildShareMetadata`):
 *  - `parseResumeTarget` validates the action against a fixed closed allow-list,
 *    validates every id segment as a UUID, and rejects any id the caller does not
 *    own — so an unknown action can never route and a cross-org id reads nothing.
 *  - `buildResumePath` turns a validated target into an in-app dashboard URL only;
 *    it never emits an absolute/protocol-relative URL (open-redirect guard).
 *
 * COPPA: a resume target carries only ids the coach already owns (teamId/playerId).
 * It adds no new field to `players` and is consumed only on the authed upgrade
 * surface — no public/no-auth route reads it.
 */

/** The closed set of artifact actions a resume token may describe. */
export const RESUME_KINDS = [
  'parent_report',
  'practice_plan',
  'weekly_star',
  'game_recap',
  'session_debrief',
] as const;

export type ResumeKind = (typeof RESUME_KINDS)[number];

/** Kinds that target a specific player (require BOTH a team and a player id). */
const PLAYER_SCOPED_KINDS: ReadonlySet<ResumeKind> = new Set(['parent_report']);

export interface ResumeTarget {
  kind: ResumeKind;
  teamId: string;
  /** Present only for player-scoped kinds (e.g. parent_report). */
  playerId?: string;
}

// Standard UUID shape (any version/variant) — id segments must match exactly.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUUID(value: string): boolean {
  return UUID_RE.test(value);
}

function isResumeKind(value: string): value is ResumeKind {
  return (RESUME_KINDS as readonly string[]).includes(value);
}

/**
 * Parse and validate a raw `resume` string into a `ResumeTarget`, or `null` if it
 * is malformed, names an unknown action, carries a non-UUID id, or points at any
 * id outside the caller's owned sets (cross-org).
 *
 * @param raw            The opaque resume string from the client / redirect URL.
 * @param ownedTeamIds   Team ids the upgraded coach's org actually owns.
 * @param ownedPlayerIds Player ids the upgraded coach's org actually owns.
 */
export function parseResumeTarget(
  raw: string | null | undefined,
  ownedTeamIds: readonly string[],
  ownedPlayerIds: readonly string[]
): ResumeTarget | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':');
  const [kindRaw, teamId, playerId, ...rest] = parts;

  // Reject extra segments outright — keeps the grammar tight.
  if (rest.length > 0) return null;
  if (!kindRaw || !isResumeKind(kindRaw)) return null;
  const kind = kindRaw;

  // Team id is required for every kind and must be a UUID the coach owns.
  if (!teamId || !isUUID(teamId) || !ownedTeamIds.includes(teamId)) return null;

  const playerScoped = PLAYER_SCOPED_KINDS.has(kind);
  if (playerScoped) {
    // Player-scoped kinds require a valid, owned player id.
    if (!playerId || !isUUID(playerId) || !ownedPlayerIds.includes(playerId)) return null;
    return { kind, teamId, playerId };
  }

  // Team-scoped kinds must NOT carry a player segment.
  if (playerId !== undefined) return null;
  return { kind, teamId };
}

/**
 * Build the in-app dashboard path for a validated resume target. Always returns a
 * root-relative path (never an absolute or protocol-relative URL). The `resume`
 * query param marks the surface so it can pre-light the generate action; the team
 * id rides as `team` for team-scoped surfaces.
 */
export function buildResumePath(target: ResumeTarget): string {
  switch (target.kind) {
    case 'parent_report':
      // The parent report knows the playerId — land on the player's surface.
      return `/roster/${target.playerId}?resume=parent_report&team=${target.teamId}`;
    case 'practice_plan':
      return `/plans?resume=practice_plan&team=${target.teamId}`;
    case 'weekly_star':
      return `/analytics?resume=weekly_star&team=${target.teamId}`;
    case 'game_recap':
      return `/sessions?resume=game_recap&team=${target.teamId}`;
    case 'session_debrief':
      return `/sessions?resume=session_debrief&team=${target.teamId}`;
  }
}
