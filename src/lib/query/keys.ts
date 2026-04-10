export const queryKeys = {
  config: {
    all: (orgId: string) => ['config', orgId] as const,
    domain: (orgId: string, domain: string) => ['config', orgId, domain] as const,
    resolved: (orgId: string, teamId: string, domain: string) => ['config', orgId, teamId, domain] as const,
  },
  features: {
    all: (orgId: string) => ['features', orgId] as const,
  },
  players: {
    all: (teamId: string) => ['players', teamId] as const,
    detail: (playerId: string) => ['players', 'detail', playerId] as const,
    proficiency: (playerId: string) => ['players', 'proficiency', playerId] as const,
    proficiencySkill: (playerId: string, skillId: string) => ['players', 'proficiency', playerId, skillId] as const,
  },
  observations: {
    all: (teamId: string) => ['observations', teamId] as const,
    player: (playerId: string) => ['observations', 'player', playerId] as const,
    session: (sessionId: string) => ['observations', 'session', sessionId] as const,
  },
  reportCards: {
    player: (playerId: string) => ['reportCards', playerId] as const,
    team: (teamId: string) => ['reportCards', 'team', teamId] as const,
  },
  plans: {
    all: (teamId: string) => ['plans', teamId] as const,
  },
  sessions: {
    all: (teamId: string) => ['sessions', teamId] as const,
  },
  drills: {
    all: (sportId: string) => ['drills', sportId] as const,
    detail: (drillId: string) => ['drills', 'detail', drillId] as const,
  },
  branding: {
    org: (orgId: string) => ['branding', orgId] as const,
  },
  share: {
    report: (token: string) => ['share', token] as const,
  },
  teams: {
    all: () => ['teams'] as const,
  },
  coach: {
    current: () => ['coach', 'current'] as const,
  },
} as const;
