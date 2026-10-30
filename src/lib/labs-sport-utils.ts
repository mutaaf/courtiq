// Maps a team's sport slug to the Chalk Talk board it opens on.
// Chalk Talk knows basketball, flag football 5v5 and 7v7; everything else starts on basketball
// (the coach can switch tabs on the board).
export type ChalkTalkSport = 'basketball' | 'flag5' | 'flag7';

export function chalkTalkSportFor(slug: string | null | undefined): ChalkTalkSport {
  const s = String(slug ?? '').toLowerCase();
  if (/flag|football/.test(s)) return /7/.test(s) ? 'flag7' : 'flag5';
  return 'basketball';
}
