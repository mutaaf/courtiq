import { bustCache, bustCachePattern } from './redis';
import { cacheKeys } from './keys';

export const invalidation = {
  onObservationCreated: async (obs: { player_id: string | null; skill_id?: string | null; team_id: string }) => {
    const busts: string[] = [];
    if (obs.player_id && obs.skill_id) {
      busts.push(cacheKeys.proficiency(obs.player_id, obs.skill_id));
    }
    if (obs.player_id) busts.push(cacheKeys.reportCard(obs.player_id));
    busts.push(cacheKeys.reportCardTeam(obs.team_id));
    await bustCache(...busts);
    if (obs.player_id) await bustCachePattern(cacheKeys.proficiencyAll(obs.player_id));
  },

  onConfigChanged: async (orgId: string, teamId?: string) => {
    await bustCachePattern(teamId ? `config:${orgId}:${teamId}:*` : `config:${orgId}:*`);
  },

  onPlayerChanged: async (teamId: string, playerId?: string) => {
    await bustCache(cacheKeys.roster(teamId), cacheKeys.keyterms(teamId));
    if (playerId) {
      await bustCachePattern(cacheKeys.proficiencyAll(playerId));
      await bustCache(cacheKeys.reportCard(playerId));
    }
  },

  onFeatureFlagChanged: async (orgId: string) => {
    await bustCache(cacheKeys.features(orgId));
  },

  onBrandingChanged: async (orgId: string) => {
    await bustCache(cacheKeys.branding(orgId));
  },
};
