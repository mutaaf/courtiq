/**
 * Static library of sport- and category-specific coaching phrases.
 * These are things a coach can SAY to players during a drill to reinforce
 * technique — especially useful when no drill-specific cues are available
 * (e.g. warmup, scrimmage, AI-generated drills, custom drills).
 */

export type SportSlug = 'basketball' | 'soccer' | 'flagfootball' | 'volleyball';

// Canonical category names (normalised to lowercase for matching)
const CATEGORY_ALIASES: Record<string, string> = {
  'ball handling': 'dribbling',
  'dribble': 'dribbling',
  'pass': 'passing',
  'shoot': 'shooting',
  'rebound': 'rebounding',
  'defend': 'defense',
  'effort': 'hustle',
  'court vision': 'awareness',
  'field vision': 'awareness',
  'vision': 'awareness',
  'conditioning': 'conditioning',
  'fitness': 'conditioning',
  'footwork': 'footwork',
  'fun games': 'hustle',
  'general': 'teamwork',
  'team play': 'teamwork',
  'communication': 'teamwork',
  'leadership': 'leadership',
  'first touch': 'dribbling',
  'attacking': 'shooting',
  'blocking': 'defense',
  'platform passing': 'passing',
  'setting': 'passing',
  'serving': 'shooting',
  'route running': 'awareness',
  'flag pulling': 'defense',
  'catching': 'passing',
};

// Phrases keyed by [sportSlug][normalisedCategory]
const SPORT_PHRASES: Record<string, Record<string, string[]>> = {
  basketball: {
    dribbling: [
      "Eyes up — feel the ball, don't watch it",
      "Low dribble when you're guarded, high dribble when you're open",
      "Fingertips, not your palm — you control it better that way",
      "Protect the ball — get your body between the defender and the ball",
      "Change your speed to lose defenders: slow down, then explode",
    ],
    passing: [
      "Step toward your target when you pass — add power with your feet",
      "Catch their hands, not their chest — chest-high and catchable",
      "Lead them — pass where they're going, not where they are",
      "Quick! The ball moves faster than any defender can",
    ],
    shooting: [
      "BEEF: Balance, Eyes, Elbow, Follow-through",
      "Wrist snap — like you're reaching into a cookie jar on a high shelf",
      "Square your feet to the basket before you release",
      "Hold your follow-through until the ball hits the rim",
    ],
    defense: [
      "Defensive stance — feet wider than shoulders, bend your knees",
      "See both your player AND the ball at the same time",
      "Step-slide, step-slide — never cross your feet on defence",
      "Make them go left — make them uncomfortable",
    ],
    rebounding: [
      "Box out first — position before you jump",
      "Two hands on every rebound — secure it",
      "Assume every shot is a miss and go get it",
      "Chin the ball after you grab it — bring it to your chin",
    ],
    footwork: [
      "Stay on the balls of your feet, not flat-footed",
      "Small, quick steps in tight spaces are faster than big lunges",
      "Pivot on the ball of your foot — keep your pivot foot planted",
    ],
    teamwork: [
      "Talk to each other! Communication wins games",
      "Be where your teammates need you, not just where you want to be",
      "Help side — everyone rotates together on defence",
    ],
    hustle: [
      "Sprint to every loose ball — it belongs to whoever wants it most",
      "Effort is a choice. Make that choice right now",
      "The play isn't over until the whistle blows — keep going",
    ],
    conditioning: [
      "Pump your arms harder to run faster — your legs follow your arms",
      "Stay in athletic stance even when you're tired — that's the habit",
      "Control your breathing: in through your nose, out through your mouth",
    ],
    awareness: [
      "Head up! What do you see before the ball even reaches you?",
      "Find your teammates before you catch the ball — pre-scan",
      "Scan the floor — where are the spaces? Where is the defence weak?",
    ],
    shooting_mechanics: [
      "Align your elbow under the ball for a straight shot",
      "Rise up into the shot — use your legs, not just your arms",
      "Focus on the back of the rim, not the ball",
    ],
    leadership: [
      "Leaders communicate — tell your teammates what you see",
      "Encourage one person next to you right now",
      "Great leaders make the people around them better",
    ],
  },

  soccer: {
    passing: [
      "Inside of the foot for accuracy — lock your ankle",
      "Pass it early! The ball moves faster than any player can run",
      "Weight your pass: firm enough to reach, soft enough to control",
      "Play to feet, not to space, when your teammate is closely marked",
    ],
    dribbling: [
      "Keep the ball close — small, controlled touches",
      "Change your pace to lose defenders: slow down, then explode",
      "Use both feet — defenders can't predict a two-footed player",
      "Head up! Dribble with your peripheral vision, not staring at the ball",
    ],
    shooting: [
      "Aim for the corners — the goalkeeper can't reach both posts",
      "Head down and over the ball when shooting low to keep it on target",
      "Drive through the ball with your laces — lean into it",
    ],
    defense: [
      "Stay on your feet — don't dive in and get beaten",
      "Slow them down — get goal-side and force them to the outside",
      "Press together — everyone moves on the press signal",
    ],
    footwork: [
      "Open your hips when receiving so you can play in any direction",
      "Check your shoulder before the ball arrives — know where you'll play it",
      "First touch away from pressure, not into it",
    ],
    teamwork: [
      "Support the ball! Give your teammate an option at all times",
      "Call for the ball using your name — be vocal",
      "Third-man runs — be ready for the give-and-go off the wall",
    ],
    hustle: [
      "Never give up on a ball — hunt it down",
      "Press immediately the moment you lose possession",
      "Sprint goal-side before the opposition even looks up",
    ],
    awareness: [
      "Scan before you receive — know your next action",
      "Find the space first, then call for the ball",
      "Play out of pressure — always have a way out before you receive",
    ],
    conditioning: [
      "Run with purpose — every sprint puts pressure on their defence",
      "Recover quickly — your defensive shape depends on it",
      "Stay low in your stance — it's easier to change direction",
    ],
    leadership: [
      "Organise your teammates — talk, point, communicate",
      "Be positive when someone makes a mistake — lift them up",
    ],
  },

  flagfootball: {
    passing: [
      "Step with your front foot as you release — your whole body drives the throw",
      "Follow through toward your target — wrist over at the end",
      "Snap your wrist — put spiral spin on the ball",
    ],
    awareness: [
      "Read the defence before the snap — where is the open zone?",
      "Run your route on time — the QB is counting on you being there",
      "After the catch, look upfield immediately — go!",
    ],
    defense: [
      "Read the QB's eyes — they tell you exactly where the ball is going",
      "Stay in your zone — don't chase and leave space open",
      "Go for the flags decisively — don't hesitate",
    ],
    teamwork: [
      "Huddle up between plays — everyone listen and know their job",
      "Block your defender — create space for your ball-carrier",
      "Encourage everyone after each play, win or lose",
    ],
    hustle: [
      "Every play, every down — full effort from the snap to the flag",
      "Don't stop running until the play is declared dead",
      "Chase the ball-carrier even if you think you can't reach — try",
    ],
    footwork: [
      "Jab step to sell your route, then break hard in your real direction",
      "Balanced stance at the line — ready to explode in any direction",
    ],
    conditioning: [
      "Short game, high intensity — give everything on each rep",
      "Stay low and ready between plays — recover fast",
    ],
    leadership: [
      "Positive voice in the huddle — one person talking clearly",
      "Clap for your teammates after every play — build the culture",
    ],
  },

  volleyball: {
    passing: [
      "Platform! Flat forearms together, bump from your platform not your hands",
      "Move your feet first, get under the ball early, then platform",
      "Aim your pass to your setter's forehead height — consistent target",
      "Bend your knees on every pass — you can't get low enough from standing tall",
    ],
    setting: [
      "High hands! Catch and release above your forehead",
      "Same hand shape every time — consistent sets win matches",
      "Set it high and tight to the antenna for your attacker",
      "Push with both hands equally — no spinning the ball",
    ],
    shooting: [
      "Toss it slightly in front of your hitting shoulder — not over your head",
      "Contact the ball at your highest point — arm fully extended",
      "Aim for the deep corners or angle it hard cross-court",
    ],
    defense: [
      "Serve-receive position: on your toes, leaning slightly forward, ready to move",
      "Read the setter — position yourself before the attack comes",
      "Never let the ball hit the floor — effort changes everything",
    ],
    teamwork: [
      "Call 'mine' loud and early — no hesitation, no collision",
      "Talk constantly: free ball, down ball, rotate — never silent",
      "Celebrate together after every rally — energy is contagious",
    ],
    hustle: [
      "Dive for every ball — get on the floor, even if you barely reach it",
      "Every ball that hits the floor is a ball you could have saved",
      "Out-work the other team on every single point",
    ],
    footwork: [
      "Shuffle to the ball — don't cross your feet when moving laterally",
      "Three-step approach to the net for hitting — outside-right-left",
      "Good platform starts with good foot position — get there early",
    ],
    leadership: [
      "Talk your team through every moment — lead with your voice",
      "Pick someone up after a mistake — that's team culture",
    ],
  },
};

// Generic phrases available for any sport
const GENERIC_PHRASES: Record<string, string[]> = {
  warmup: [
    "Get loose and talk to each other — warmup builds team chemistry",
    "Light jog to start — gradually increase your intensity",
    "Dynamic movement: high knees, arm circles, side shuffles",
  ],
  scrimmage: [
    "Apply what we just worked on — use the skill in a game situation",
    "Compete hard but stay coachable — if I stop play, listen up",
    "Encourage your teammates! Energy is contagious",
  ],
  teamwork: [
    "Use your voice — communication is a free advantage",
    "Be where your teammates need you",
    "Support the ball-carrier at all times — give them options",
  ],
  hustle: [
    "Effort is always a choice — choose to give your best right now",
    "The play isn't over until it's over — go 100% until the whistle",
    "Out-work the other team on every rep",
  ],
  conditioning: [
    "Control your breathing — find your rhythm",
    "Push through the discomfort — that's where growth happens",
    "Encourage the person right next to you",
  ],
  awareness: [
    "Head up — see the whole picture",
    "Anticipate the play before it happens",
    "Know where your teammates are at all times",
  ],
  footwork: [
    "Stay on the balls of your feet — never flat-footed",
    "Small, quick steps beat big lunges every time",
    "Low centre of gravity — the lower you are, the faster you change direction",
  ],
  leadership: [
    "Leaders communicate — tell your teammates what you see",
    "Encourage one person near you right now",
    "Great leaders make the people around them better",
  ],
  passing: [
    "Fast and accurate beats fast and wild",
    "Support the ball — give your teammate an option",
    "Call for the ball when you're open",
  ],
  defense: [
    "Move your feet — don't reach",
    "Stay goal-side and force them away from where they want to go",
    "Communicate defensive assignments — talk constantly",
  ],
};

/**
 * Normalise a raw category string for phrase lookup.
 * Handles aliases and casing variations.
 */
export function normaliseCategory(raw: string | undefined | null): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  return CATEGORY_ALIASES[lower] ?? lower;
}

/**
 * Return all phrases for a given category and sport.
 * Falls back: sport-specific → generic → empty array.
 */
export function getPhrasesForCategory(
  category: string | undefined | null,
  sportSlug: string | undefined | null,
): string[] {
  const cat = normaliseCategory(category);
  if (!cat) return [];

  const sportKey = (sportSlug ?? '').toLowerCase() as SportSlug;
  const sportPhrases = SPORT_PHRASES[sportKey]?.[cat];
  if (sportPhrases && sportPhrases.length > 0) return sportPhrases;

  const genericPhrases = GENERIC_PHRASES[cat];
  if (genericPhrases && genericPhrases.length > 0) return genericPhrases;

  return [];
}

/**
 * True when at least one phrase exists for this category/sport.
 */
export function hasPhrases(
  category: string | undefined | null,
  sportSlug: string | undefined | null,
): boolean {
  return getPhrasesForCategory(category, sportSlug).length > 0;
}

/**
 * Select a deterministic phrase for a given date seed (days since epoch).
 * Same category + sport + date always returns the same phrase — stable across
 * re-renders and across devices.
 */
export function getPhraseForDay(
  category: string | undefined | null,
  sportSlug: string | undefined | null,
  daySeed?: number,
): string {
  const phrases = getPhrasesForCategory(category, sportSlug);
  if (phrases.length === 0) return '';
  const seed = daySeed ?? Math.floor(Date.now() / 86_400_000);
  return phrases[seed % phrases.length];
}

/**
 * Select a phrase by index (wraps around). Useful for rotating through phrases
 * within a session as the coach progresses through drills.
 */
export function getPhraseByIndex(
  category: string | undefined | null,
  sportSlug: string | undefined | null,
  index: number,
): string {
  const phrases = getPhrasesForCategory(category, sportSlug);
  if (phrases.length === 0) return '';
  return phrases[Math.abs(index) % phrases.length];
}

/**
 * Count the number of available phrases for a category/sport combination.
 */
export function countPhrases(
  category: string | undefined | null,
  sportSlug: string | undefined | null,
): number {
  return getPhrasesForCategory(category, sportSlug).length;
}

/**
 * Return all supported categories for a given sport (including generic).
 */
export function getCategoriesWithPhrases(sportSlug: string | undefined | null): string[] {
  const sportKey = (sportSlug ?? '').toLowerCase();
  const sportCats = Object.keys(SPORT_PHRASES[sportKey] ?? {});
  const genericCats = Object.keys(GENERIC_PHRASES);
  return [...new Set([...sportCats, ...genericCats])];
}

/**
 * True when the category is a generic/structural drill type (warmup, scrimmage)
 * rather than a skill category. Used to choose the right label in the UI.
 */
export function isStructuralCategory(category: string | undefined | null): boolean {
  const cat = normaliseCategory(category);
  return cat === 'warmup' || cat === 'scrimmage' || cat === 'cooldown';
}

/**
 * Human-readable label for the coaching phrase card header.
 */
export function getPhraseLabelForCategory(
  category: string | undefined | null,
  sportSlug: string | undefined | null,
): string {
  const cat = normaliseCategory(category);
  if (!cat) return 'Coaching tip';
  if (cat === 'warmup') return 'Warmup coaching';
  if (cat === 'scrimmage') return 'Scrimmage coaching';

  const sportKey = (sportSlug ?? '').toLowerCase();
  const inSport = !!(SPORT_PHRASES[sportKey]?.[cat]);
  const sportName =
    sportKey === 'basketball' ? 'Basketball' :
    sportKey === 'soccer' ? 'Soccer' :
    sportKey === 'flagfootball' ? 'Flag football' :
    sportKey === 'volleyball' ? 'Volleyball' : null;

  if (inSport && sportName) {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `${sportName}: ${label} tip`;
  }

  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  return `${label} tip`;
}
