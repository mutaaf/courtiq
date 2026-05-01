// ─── Practice Template Library ───────────────────────────────────────────────
// Pre-built, age-appropriate practice templates for volunteer coaches.
// Each template produces a ready-to-run drill queue — no setup required.

export type AgeGroup =
  | 'U6' | 'U7' | 'U8'
  | 'U9' | 'U10' | 'U11' | 'U12'
  | 'U13' | 'U14' | 'U15' | 'U16' | 'U17' | 'U18';

export interface TemplateDrill {
  name: string;
  durationMins: number;
  cues: string[];
  description: string;
}

export interface PracticeTemplate {
  id: string;
  name: string;
  sport: string;       // matches team.sport_id lowercase
  ageLabel: string;    // human-readable age range
  totalMins: number;
  description: string;
  drills: TemplateDrill[];
  tags: string[];
}

// ─── Basketball Templates ────────────────────────────────────────────────────

const BASKETBALL_U8: PracticeTemplate = {
  id: 'bball-u8-30',
  name: 'Basketball Basics',
  sport: 'basketball',
  ageLabel: 'Ages 6–8',
  totalMins: 30,
  description: 'Fun fundamentals for young players. Dribbling, passing, and simple shooting.',
  tags: ['beginner', 'fundamentals', 'short'],
  drills: [
    {
      name: 'Dribble Warm-Up',
      durationMins: 5,
      cues: [
        'Eyes up — look where you\'re going, not at the ball',
        'Fingertips, not palms — feel the ball with your fingertips',
        'Stay in your own space, spread out!',
        'Try alternating hands every 5 dribbles',
      ],
      description: 'Each player with a ball, dribble in place then move around the court.',
    },
    {
      name: 'Partner Passing',
      durationMins: 7,
      cues: [
        'Step toward your partner when you pass',
        'Catch with two hands — make a target for them',
        'Chest pass: push from chest, snap wrists',
        'Shout your partner\'s name before you pass',
      ],
      description: 'Pairs chest-pass back and forth, moving slightly further apart each minute.',
    },
    {
      name: 'Lay-Up Lane',
      durationMins: 8,
      cues: [
        'Two steps after the dribble — big step, little step',
        'Use the backboard — aim for the square',
        'Jump off the inside foot (right side = left foot)',
        'Encourage every attempt — celebrate effort!',
      ],
      description: 'Single-file line, each player dribbles in and attempts a lay-up.',
    },
    {
      name: 'Sharks & Minnows',
      durationMins: 10,
      cues: [
        'Keep your head up to see the sharks!',
        'Change direction when you\'re in trouble',
        'Protect the ball with your body',
        'Have fun — this is their favourite part!',
      ],
      description: 'One shark tries to knock minnows\' balls out. Last minnow wins.',
    },
  ],
};

const BASKETBALL_U12: PracticeTemplate = {
  id: 'bball-u12-45',
  name: 'Skill Builder',
  sport: 'basketball',
  ageLabel: 'Ages 9–12',
  totalMins: 45,
  description: 'Balanced session covering footwork, passing, shooting mechanics, and 3-on-3.',
  tags: ['intermediate', 'balanced', 'medium'],
  drills: [
    {
      name: 'Dynamic Warm-Up',
      durationMins: 5,
      cues: [
        'High knees, butt kicks, lateral shuffles — get the blood flowing',
        'Remind players to breathe and stay loose',
        'Keep pace energetic but controlled',
      ],
      description: 'Line drills: jog, skip, high knees, defensive shuffle across the gym.',
    },
    {
      name: 'Ball Handling Circuit',
      durationMins: 8,
      cues: [
        'Low dribble = harder to steal; keep it below your waist',
        'Pound dribble: push the ball hard into the floor',
        'Crossover: bring the ball low across your body',
        'Between the legs is advanced — don\'t rush it',
      ],
      description: 'Stations: stationary dribble, crossover, figure-8 around cones.',
    },
    {
      name: 'Passing Triangle',
      durationMins: 7,
      cues: [
        'Pass to the open teammate — don\'t hold the ball',
        'Look off the defender before passing',
        'Bounce pass: hits the floor 2/3 of the way to your target',
        'No lob passes in traffic — keep it crisp',
      ],
      description: 'Groups of 3 form a triangle, moving the ball quickly with skip passes.',
    },
    {
      name: 'Form Shooting',
      durationMins: 10,
      cues: [
        'BEEF: Balance, Eyes, Elbow, Follow-through',
        'Elbow under the ball, wrist snaps forward on release',
        'Follow-through: hand in the cookie jar',
        'Shoot from close first — build confidence, then move back',
      ],
      description: 'Start at 3 feet from basket, make 3 before moving back. No rushing.',
    },
    {
      name: '3-on-3 Scrimmage',
      durationMins: 15,
      cues: [
        'No ball hogging — 3 passes before shooting',
        'Call out screens for teammates',
        'Defense: stay between your player and the basket',
        'Rotate fairly — swap teams every 3 minutes',
      ],
      description: 'Half-court 3-on-3, rotating teams. Emphasise teamwork over scoring.',
    },
  ],
};

const BASKETBALL_U16: PracticeTemplate = {
  id: 'bball-u16-60',
  name: 'Competitive Prep',
  sport: 'basketball',
  ageLabel: 'Ages 13–18',
  totalMins: 60,
  description: 'High-intensity session with game-speed drills, pick-and-roll, and full-court scrimmage.',
  tags: ['advanced', 'competitive', 'long'],
  drills: [
    {
      name: 'Shooting Warm-Up',
      durationMins: 8,
      cues: [
        'Warm up with form shots — no heat-check three-pointers yet',
        'Catch and shoot: feet set before the ball arrives',
        'Pull-up jumper: create your own shot off the dribble',
      ],
      description: 'Players pair up: one feeds, one shoots mid-range. Switch after 2 minutes.',
    },
    {
      name: '5-Man Weave',
      durationMins: 7,
      cues: [
        'Pass ahead of the runner — lead them, don\'t make them slow down',
        'Sprint after you pass — go behind the player you passed to',
        'Finish every rep with a lay-up: no stopping early',
        'Talk on every pass — communication is the point',
      ],
      description: '5-player full-court passing drill ending in a lay-up.',
    },
    {
      name: 'Pick & Roll Coverage',
      durationMins: 10,
      cues: [
        'On-ball defender: go over the screen, don\'t let the shooter open',
        'Big man: hedge hard, then recover to the roll man',
        'Communication: "Screen!" before it\'s set',
        'Offensive: use the screen — don\'t drift away from it',
      ],
      description: '2-on-2: one guard sets up pick-and-roll vs. two defenders. Rotate.',
    },
    {
      name: 'Defensive Slide Series',
      durationMins: 10,
      cues: [
        'Low and wide: don\'t cross your feet',
        'Pressure the ball: make the handler uncomfortable',
        'Close-out: sprint then chop your steps to avoid fouling',
        'Hands active but controlled: deflections not fouls',
      ],
      description: 'Line drill: defensive slides, close-outs, and 1-on-1 live reps.',
    },
    {
      name: 'Full-Court Scrimmage',
      durationMins: 25,
      cues: [
        'Play the system: run the offense you\'ve practised',
        'Take good shots: open, within range, balanced',
        'Transition D: get back before the shot is even up',
        'Coach: call out good decisions, not just makes and misses',
      ],
      description: '5-on-5 full court. Rotate bench every 5 minutes.',
    },
  ],
};

// ─── Soccer Templates ────────────────────────────────────────────────────────

const SOCCER_U8: PracticeTemplate = {
  id: 'soccer-u8-30',
  name: 'First Kick',
  sport: 'soccer',
  ageLabel: 'Ages 6–8',
  totalMins: 30,
  description: 'Ball mastery and fun small-sided games for young players.',
  tags: ['beginner', 'fundamentals', 'short'],
  drills: [
    {
      name: 'Ball Mastery Warm-Up',
      durationMins: 5,
      cues: [
        'Touch the ball with the sole of your foot — feel it!',
        'Light touches — you control the ball, it doesn\'t control you',
        'Keep the ball close; don\'t let it roll away',
        'Try using your left foot — both feet are your friends',
      ],
      description: 'Each player with a ball: toe taps, sole rolls, inside touches in place.',
    },
    {
      name: 'Dribble & Stop',
      durationMins: 7,
      cues: [
        'Head up — look for cones (and pretend defenders!)',
        'Small touches keep the ball close',
        'Stop with the sole when the coach whistles',
        'Change direction as fast as you can',
      ],
      description: 'Dribble freely in a marked grid, stop on whistle, change direction.',
    },
    {
      name: 'Passing Pairs',
      durationMins: 8,
      cues: [
        'Plant foot beside the ball, kick with the inside of your foot',
        'Aim for your partner\'s feet — not too hard!',
        'Say "yes!" or call their name to ask for the ball',
        'First touch: trap it, don\'t let it bounce away',
      ],
      description: 'Pairs 5 yards apart passing back and forth, moving a yard further every minute.',
    },
    {
      name: '2v2 Mini Game',
      durationMins: 10,
      cues: [
        'When your team has the ball, spread out — give each other space',
        'When the other team has it, get between them and the goal',
        'Celebrate every goal — yours AND theirs!',
        'Encourage quiet players to call for the ball',
      ],
      description: '2v2 on a small pitch with cones as goals. Everyone plays.',
    },
  ],
};

const SOCCER_U12: PracticeTemplate = {
  id: 'soccer-u12-45',
  name: 'Tactical Skills',
  sport: 'soccer',
  ageLabel: 'Ages 9–12',
  totalMins: 45,
  description: 'Passing combinations, pressing triggers, and 4v4 tactical play.',
  tags: ['intermediate', 'tactical', 'medium'],
  drills: [
    {
      name: 'Rondo (4v1)',
      durationMins: 8,
      cues: [
        'One-touch passing when possible — think ahead',
        'Create angles for your teammates',
        'Middle player: press the ball, don\'t just chase',
        'If you lose it, you\'re in the middle — stay sharp!',
      ],
      description: '4 players keep the ball away from 1 defender in a 10x10 grid.',
    },
    {
      name: 'Receiving & Turning',
      durationMins: 8,
      cues: [
        'Check your shoulder before the ball arrives',
        'Open your hips to receive — turn away from pressure',
        'First touch should set you up for your next action',
        'Practice both feet — discomfort is learning',
      ],
      description: 'Player receives a pass under pressure, turns, and plays forward.',
    },
    {
      name: 'Shooting Accuracy',
      durationMins: 9,
      cues: [
        'Non-kicking foot beside the ball, toe pointing at target',
        'Laces for power, inside for placement',
        'Follow through — don\'t stop your leg mid-swing',
        'Aim for corners, not the middle of the goal',
      ],
      description: 'Line of players, pass-to-self then shoot from edge of the box.',
    },
    {
      name: '4v4 + Targets',
      durationMins: 20,
      cues: [
        'Forwards: press as a unit — one triggers, others cover',
        'Find the target player to switch play under pressure',
        'When you win it back, attack quickly before they reset',
        'Coach: narrate good decisions out loud for the team to hear',
      ],
      description: '4v4 with a target player on each end. Score by connecting with your target.',
    },
  ],
};

// ─── Generic Template ────────────────────────────────────────────────────────

const FIRST_PRACTICE: PracticeTemplate = {
  id: 'generic-first-30',
  name: 'First Practice',
  sport: '',  // matches any sport
  ageLabel: 'Any age',
  totalMins: 30,
  description: 'Perfect for your very first practice. Get-to-know-you games, basic skills, and a fun finish.',
  tags: ['beginner', 'first practice', 'any sport'],
  drills: [
    {
      name: 'Name Game Warm-Up',
      durationMins: 5,
      cues: [
        'Learn every player\'s name today — it matters to them',
        'Encourage players to introduce themselves before passing',
        'Keep it light and fun — set the tone for the season',
      ],
      description: 'Players stand in a circle. Pass the ball and say the receiver\'s name.',
    },
    {
      name: 'Skill Introduction',
      durationMins: 10,
      cues: [
        'Demonstrate first — players learn by watching',
        'Start with the basic technique; correct gently',
        'Praise effort, not just success',
        'Break into pairs so everyone gets reps',
      ],
      description: 'Coach demonstrates 1–2 core skills for your sport. Players practice in pairs.',
    },
    {
      name: 'Free Play Scrimmage',
      durationMins: 10,
      cues: [
        'Let them play — minimal interruptions this first session',
        'Watch quietly: note who is confident, who holds back',
        'Cheer for good sportsmanship as much as good plays',
        'End early if energy fades — leave them wanting more',
      ],
      description: 'Small-sided game. Let the kids have fun and observe natural ability.',
    },
    {
      name: 'Circle Debrief',
      durationMins: 5,
      cues: [
        'Ask: "What was your favourite part today?"',
        'Tell each player one specific thing you noticed about them',
        'Preview next session to build excitement',
        'Finish with a team handshake or chant',
      ],
      description: 'Bring the team together. Celebrate the session and set expectations for the season.',
    },
  ],
};

// ─── Flag Football Templates ─────────────────────────────────────────────────

const FLAG_FOOTBALL_U8: PracticeTemplate = {
  id: 'flag-u8-30',
  name: 'Flag Football Basics',
  sport: 'flag_football',
  ageLabel: 'Ages 6–8',
  totalMins: 30,
  description: 'Flag pulling, catching fundamentals, and a fun 3v3 game for young players.',
  tags: ['beginner', 'fundamentals', 'short'],
  drills: [
    {
      name: 'Flag Pull Frenzy',
      durationMins: 5,
      cues: [
        'Grab the whole flag — don\'t just swipe at it',
        'Stay on your feet: no diving or lunging',
        'Call "flag!" out loud when you pull one',
        'Keep your hips moving to protect your own flags',
      ],
      description: 'Everyone has flags. Players try to pull each other\'s flags in a marked grid. Last player with both flags wins.',
    },
    {
      name: 'Catching Basics',
      durationMins: 8,
      cues: [
        'Eyes on the ball all the way into your hands — watch it in',
        'Fingers pointing up for high throws, down for low ones',
        'Make a triangle with your thumbs and index fingers',
        'Squeeze it tight — don\'t let it bounce off your chest',
      ],
      description: 'Coach or partner tosses soft passes at varying heights. Players focus on hand position and tracking.',
    },
    {
      name: 'Route Walk-Through',
      durationMins: 7,
      cues: [
        'Go route: run straight and fast — no curving sideways',
        'Curl: run 5 big steps, then turn and face the QB',
        'Out: run 4 steps, then cut hard 90 degrees to the sideline',
        'Start every route the same way — keep the defense guessing',
      ],
      description: 'Walk through three basic routes (go, curl, out) at half-speed. QB tosses after each break.',
    },
    {
      name: '3v3 Flag Game',
      durationMins: 10,
      cues: [
        'Offense: spread out — make the defense cover everyone',
        'Defense: stick to your player, where they go you go',
        'QB: look for the open player before you throw',
        'Celebrate every flag pull just like a tackle!',
      ],
      description: '3v3 small-sided flag game on a short field. Rotate teams every 3 minutes.',
    },
  ],
};

const FLAG_FOOTBALL_U12: PracticeTemplate = {
  id: 'flag-u12-45',
  name: 'Routes & Coverage',
  sport: 'flag_football',
  ageLabel: 'Ages 9–12',
  totalMins: 45,
  description: 'Route combinations, QB mechanics, zone coverage, and 5v5 flag scrimmage.',
  tags: ['intermediate', 'tactical', 'medium'],
  drills: [
    {
      name: 'Agility & Footwork',
      durationMins: 5,
      cues: [
        'Quick feet are your best weapon — fast feet beat coverage',
        'Stay low through the ladder; don\'t stand tall',
        'Plant hard on cuts — drive off the outside foot',
        'Visualise your first step off the line of scrimmage',
      ],
      description: 'Ladder footwork, cone cuts, and 5-yard burst starts. Two lines, alternate reps.',
    },
    {
      name: 'Route Tree',
      durationMins: 10,
      cues: [
        'Release clean: an explosive first step beats press coverage',
        'Accelerate out of every break — don\'t drift through your cut',
        'On curls and comebacks: come back toward the QB, don\'t wait',
        'Sell the deep route on every short route — same release every time',
      ],
      description: 'Receivers run go, slant, curl, and out routes against air. QB throws after each break point.',
    },
    {
      name: 'QB Mechanics',
      durationMins: 10,
      cues: [
        '3-step drop: catch, 1-2-3, throw — keep it quick',
        'Release point above the ear, not sidearm from the hip',
        'Lead your receiver: throw to where they\'re going, not where they are',
        'Scan: first read, second read, checkdown — don\'t stare one receiver down',
      ],
      description: 'QBs rotate through 3-step drops hitting receivers on curl, out, and go routes.',
    },
    {
      name: 'Zone Coverage Shells',
      durationMins: 10,
      cues: [
        'In zone: find your area first, then find the ball',
        'Keep receivers in front of you — never get beat deep',
        'Communicate constantly: "I got two!", "Help right!"',
        'Jump routes aggressively — an interception is a scoring play',
      ],
      description: '7-on-7 shell drill: defenders hold zone assignments while offense runs combination routes.',
    },
    {
      name: '5v5 Flag Scrimmage',
      durationMins: 10,
      cues: [
        'Offense: run balanced plays — spread the ball around',
        'Defense: know the down-and-distance; third-and-long means pass rush',
        'QB: read the defense before the snap, not your feet',
        'Celebrate flag pulls as loudly as scores — defense wins games',
      ],
      description: '5v5 on a 40-yard field. Rotate on turnovers and after every 3 plays.',
    },
  ],
};

// ─── Template Registry ───────────────────────────────────────────────────────

export const PRACTICE_TEMPLATES: PracticeTemplate[] = [
  FIRST_PRACTICE,
  BASKETBALL_U8,
  BASKETBALL_U12,
  BASKETBALL_U16,
  SOCCER_U8,
  SOCCER_U12,
  FLAG_FOOTBALL_U8,
  FLAG_FOOTBALL_U12,
];

// ─── Utility Functions ───────────────────────────────────────────────────────

export function getTemplatesForSport(sportId: string): PracticeTemplate[] {
  const sport = sportId.toLowerCase();
  return PRACTICE_TEMPLATES.filter(
    (t) => t.sport === '' || t.sport === sport
  );
}

export function getTemplateById(id: string): PracticeTemplate | undefined {
  return PRACTICE_TEMPLATES.find((t) => t.id === id);
}

export function getTotalMinutes(template: PracticeTemplate): number {
  return template.drills.reduce((sum, d) => sum + d.durationMins, 0);
}

export function getDrillCount(template: PracticeTemplate): number {
  return template.drills.length;
}

export function matchesAgeGroup(template: PracticeTemplate, ageGroup: string): boolean {
  if (!ageGroup) return true;
  // Generic templates (sport='') match every age group
  if (template.sport === '') return true;
  const id = template.id;
  const ageNum = parseInt(ageGroup.replace(/\D/g, ''), 10);
  if (isNaN(ageNum)) return true;

  if (id.includes('u8')) return ageNum <= 8;
  if (id.includes('u12')) return ageNum >= 9 && ageNum <= 12;
  if (id.includes('u16')) return ageNum >= 13;
  return true;
}

export function rankTemplates(
  templates: PracticeTemplate[],
  sportId: string,
  ageGroup: string
): PracticeTemplate[] {
  return [...templates].sort((a, b) => {
    const aMatch = matchesAgeGroup(a, ageGroup) ? 0 : 1;
    const bMatch = matchesAgeGroup(b, ageGroup) ? 0 : 1;
    if (aMatch !== bMatch) return aMatch - bMatch;
    // Generic templates last within same age match
    const aGeneric = a.sport === '' ? 1 : 0;
    const bGeneric = b.sport === '' ? 1 : 0;
    return aGeneric - bGeneric;
  });
}

export function hasSufficientCues(template: PracticeTemplate): boolean {
  return template.drills.every((d) => d.cues.length > 0);
}

export function buildTemplateLabel(template: PracticeTemplate): string {
  const parts = [template.name, template.ageLabel];
  return parts.join(' · ');
}

export function buildTemplateSummary(template: PracticeTemplate): string {
  const mins = getTotalMinutes(template);
  const drills = getDrillCount(template);
  return `${drills} drills · ${mins} min`;
}

export function filterByTag(templates: PracticeTemplate[], tag: string): PracticeTemplate[] {
  return templates.filter((t) => t.tags.includes(tag.toLowerCase()));
}

export function getAllTags(templates: PracticeTemplate[]): string[] {
  const tags = new Set<string>();
  templates.forEach((t) => t.tags.forEach((tag) => tags.add(tag)));
  return Array.from(tags).sort();
}

export function templateFitsSession(template: PracticeTemplate, availableMinutes: number): boolean {
  return getTotalMinutes(template) <= availableMinutes;
}

export function scaleTemplateDuration(
  template: PracticeTemplate,
  targetMins: number
): PracticeTemplate {
  const currentTotal = getTotalMinutes(template);
  if (currentTotal === 0) return template;
  const ratio = targetMins / currentTotal;
  return {
    ...template,
    drills: template.drills.map((d) => ({
      ...d,
      durationMins: Math.max(1, Math.round(d.durationMins * ratio)),
    })),
  };
}
