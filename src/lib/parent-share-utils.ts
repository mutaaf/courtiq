export interface ParentShareMessageParams {
  playerName: string;
  teamName: string | null;
  coachName: string | null;
  shareUrl: string;
}

export function getFirstName(fullName: string): string {
  return fullName.split(' ')[0] || fullName;
}

export function buildParentShareMessage(params: ParentShareMessageParams): string {
  const { playerName, teamName, coachName, shareUrl } = params;
  const firstName = getFirstName(playerName);
  const parts: string[] = [];
  parts.push(`${firstName}'s progress report is in! 🎉`);
  if (coachName && teamName) {
    parts.push(`Coach ${getFirstName(coachName)} from ${teamName} just sent an update.`);
  } else if (teamName) {
    parts.push(`${teamName} sent a coaching update.`);
  }
  parts.push(`See how ${firstName} is doing: ${shareUrl}`);
  return parts.join(' ');
}
