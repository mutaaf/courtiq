import type { Player, CurriculumSkill } from '@/types/database';

interface Keyterm {
  keyword: string;
  boost: number;
}

export function buildKeyterms(
  players: Pick<Player, 'name' | 'nickname' | 'name_variants'>[],
  skills?: Pick<CurriculumSkill, 'name'>[],
  terminology?: Record<string, string>
): Keyterm[] {
  const keyterms: Keyterm[] = [];

  // Player names (highest boost)
  for (const player of players) {
    keyterms.push({ keyword: player.name, boost: 1.5 });

    // First name only
    const firstName = player.name.split(' ')[0];
    if (firstName && firstName.length > 2) {
      keyterms.push({ keyword: firstName, boost: 1.5 });
    }

    // Nickname
    if (player.nickname) {
      keyterms.push({ keyword: player.nickname, boost: 1.5 });
    }

    // Variants
    if (player.name_variants) {
      for (const variant of player.name_variants) {
        keyterms.push({ keyword: variant, boost: 1.3 });
      }
    }
  }

  // Skill names (medium boost)
  if (skills) {
    for (const skill of skills) {
      keyterms.push({ keyword: skill.name, boost: 1.2 });
    }
  }

  // Sport terminology (lower boost)
  if (terminology) {
    for (const term of Object.values(terminology)) {
      keyterms.push({ keyword: term, boost: 1.1 });
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return keyterms.filter((kt) => {
    const key = kt.keyword.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
