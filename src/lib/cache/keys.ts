export const cacheKeys = {
  config: (orgId: string, domain: string) => `config:${orgId}::${domain}`,
  configTeam: (orgId: string, teamId: string, domain: string) => `config:${orgId}:${teamId}:${domain}`,
  proficiency: (playerId: string, skillId: string) => `prof:${playerId}:${skillId}`,
  proficiencyAll: (playerId: string) => `prof:${playerId}:*`,
  reportCard: (playerId: string) => `rc:${playerId}`,
  reportCardTeam: (teamId: string) => `rc:team:${teamId}`,
  roster: (teamId: string) => `roster:${teamId}`,
  keyterms: (teamId: string) => `keyterms:${teamId}`,
  features: (orgId: string) => `features:${orgId}`,
  branding: (orgId: string) => `branding:${orgId}`,
  aiDedup: (promptHash: string) => `ai:dedup:${promptHash}`,
};
