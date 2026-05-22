export type QuickGameType = 'game' | 'scrimmage' | 'tournament';

/** Resolves the inserted row id from a mutate() response, which can be an array or object. */
export function resolveInsertedId(res: unknown): string | null {
  if (Array.isArray(res)) {
    const first = (res as Array<{ id?: string }>)[0];
    return first?.id ?? null;
  }
  if (res !== null && typeof res === 'object') {
    return (res as { id?: string }).id ?? null;
  }
  return null;
}

/** Builds the sessions table insert payload for a quick-start game session. */
export function buildQuickGamePayload(
  teamId: string,
  coachId: string,
  type: QuickGameType,
  opponent: string,
) {
  return {
    team_id: teamId,
    coach_id: coachId,
    type,
    date: new Date().toISOString().split('T')[0],
    opponent: opponent.trim() || null,
    notes: 'Quick-start game session',
  };
}

/** Returns the route to navigate to after session creation. */
export function quickGameDestination(type: QuickGameType, id: string): string {
  return type === 'game' ? `/sessions/${id}/game-tracker` : `/sessions/${id}`;
}
