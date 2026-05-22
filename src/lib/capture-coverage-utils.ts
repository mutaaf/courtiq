export interface CoveragePlayer {
  id: string;
  name: string;
  jersey_number: number | null;
}

const DEFAULT_CHIP_CAP = 4;

/** UUID v4 pattern — used to distinguish IDs from display names. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function formatPlayerChipLabel(name: string, jerseyNumber: number | null): string {
  const firstName = name.split(' ')[0];
  return jerseyNumber != null ? `#${jerseyNumber} ${firstName}` : firstName;
}

export function getUnobservedPlayers(
  roster: CoveragePlayer[],
  observedIds: Set<string>,
  cap: number = DEFAULT_CHIP_CAP
): CoveragePlayer[] {
  return roster.filter((p) => !observedIds.has(p.id)).slice(0, cap);
}

export function countUnobservedPlayers(
  roster: CoveragePlayer[],
  observedIds: Set<string>
): number {
  return roster.filter((p) => !observedIds.has(p.id)).length;
}

export function hasAllPlayersObserved(
  roster: CoveragePlayer[],
  observedIds: Set<string>
): boolean {
  return roster.length > 0 && roster.every((p) => observedIds.has(p.id));
}
