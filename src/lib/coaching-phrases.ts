/**
 * Static library of sport- and category-specific coaching phrases.
 * These are things a coach can SAY to players during a drill to reinforce
 * technique — especially useful when no drill-specific cues are available
 * (e.g. warmup, scrimmage, AI-generated drills, custom drills).
 */

export type SportSlug = 'basketball' | 'soccer' | 'flag_football' | 'volleyball' | 'lacrosse' | 'swimming' | 'tennis' | 'gymnastics' | 'baseball' | 'softball';

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
  'cradle': 'dribbling',
  'cradling': 'dribbling',
  'ground ball': 'hustle',
  'groundball': 'hustle',
  'dodging': 'footwork',
  // swimming
  'stroke': 'shooting',
  'flip turn': 'footwork',
  'flip turns': 'footwork',
  'kick': 'footwork',
  'pulls': 'shooting',
  'arm pull': 'shooting',
  'streamline': 'awareness',
  'breathing': 'conditioning',
  'starts': 'hustle',
  'turns': 'footwork',
  // tennis
  'serve': 'shooting',
  'serves': 'shooting',
  'forehand': 'shooting',
  'backhand': 'shooting',
  'volley': 'passing',
  'volleys': 'passing',
  'composure': 'attitude',
  'rally': 'passing',
  // baseball / softball
  'batting': 'shooting',
  'hitting': 'shooting',
  'at-bat': 'shooting',
  'at bat': 'shooting',
  'pitching': 'shooting',
  'throwing': 'passing',
  'fielding': 'defense',
  'glove work': 'defense',
  'baserunning': 'footwork',
  'base running': 'footwork',
  'base path': 'footwork',
  // gymnastics
  'tumbling': 'shooting',
  'handstand': 'shooting',
  'handstands': 'shooting',
  'cartwheel': 'shooting',
  'cartwheels': 'shooting',
  'back walkover': 'shooting',
  'back walkovers': 'shooting',
  'roundoff': 'shooting',
  'back handspring': 'shooting',
  'beam': 'awareness',
  'balance beam': 'awareness',
  'bars': 'shooting',
  'uneven bars': 'shooting',
  'vault': 'shooting',
  'landing': 'footwork',
  'pointed toes': 'footwork',
  'body shape': 'footwork',
  'split': 'conditioning',
  'splits': 'conditioning',
  'flexibility': 'conditioning',
  'stretching': 'conditioning',
};

// Baseball and softball share the same phrases (nearly identical skill sets)
const BASEBALL_PHRASES: Record<string, string[]> = {
  shooting: [
    "Level swing — keep your bat path flat through the hitting zone",
    "See the ball all the way in — eyes locked from the pitcher's hand to the bat",
    "Hips lead the swing — rotate your hips first, your arms follow",
    "Strong base — weight on your back foot until you stride forward",
    "Pitchers: push off the rubber and drive through your front hip for power",
  ],
  passing: [
    "Four-seam grip — find the seams before every throw",
    "Step toward your target — your feet aim the throw as much as your arm",
    "Crow hop before you throw — build momentum, don't just arm it",
    "Follow through all the way down — finish with your throwing arm near your hip",
  ],
  defense: [
    "Glove down on grounders — easier to come up than go down",
    "Two hands on every catch — secure it before you think about the throw",
    "Ready position on every pitch: weight forward, on your toes",
    "Charge slow rollers — go get it, don't let the ball play you",
    "Track the fly ball with a curved approach — don't run straight back",
  ],
  footwork: [
    "Hit through first base — don't slow down, run through the bag",
    "Touch the inside corner of the bag when rounding — every step counts",
    "Read your third-base coach on contact — eyes up while running",
    "Two steps off the bag, lean forward — be ready to go on a wild pitch",
  ],
  hustle: [
    "Run out every ball — anything can happen with two outs",
    "Sprint to your position between every half-inning",
    "Chase every grounder — a little more effort saves a hit",
  ],
  awareness: [
    "Know the situation before every pitch — outs, runners, count, score",
    "Back up every play — if you're not making the catch, be the backup",
    "Read the ball off the bat — move on contact, not after the catch",
  ],
  teamwork: [
    "Call it loud and early on fly balls — communication prevents collisions",
    "Encourage your pitcher after a tough inning — team energy matters",
    "Hit for your team — advancing a runner is just as valuable as a hit",
  ],
  leadership: [
    "Pick up your teammate after an error — that's what great players do",
    "Communicate the defence before every pitch — know everyone's assignment",
    "Set the tone: your energy in the dugout sets the team's energy on the field",
  ],
  conditioning: [
    "Warm up your arm gradually — never throw hard with a cold arm",
    "Baseball is a long game — stay focused even when you're not in the action",
    "Quick hands and quick feet beat pure strength — work on your quickness",
  ],
  attitude: [
    "Every at-bat is a new start — forget the last out, focus on this pitch",
    "Errors are part of the game — shake it off and make the next play great",
    "Stay loose and trust your training — tense players make more mistakes",
  ],
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

  flag_football: {
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

  swimming: {
    shooting: [
      "Reach long, pull deep — every stroke is full extension",
      "High elbow on the catch — it's your biggest power move",
      "Rotate your hips — swimming is a full-body motion",
      "Smooth is fast — relax into the water, don't fight it",
    ],
    footwork: [
      "Tight flip turn — the wall is your accelerator",
      "Flutter kick from the hip, not the knee — small and fast",
      "Point your toes on every kick — maximise your propulsion",
      "Push off long and stay streamlined — that's free speed",
    ],
    conditioning: [
      "Control your breath count — find your rhythm and stick to it",
      "Trust your training — when it hurts, that's where you get stronger",
      "Arms follow your breath — find your cycle and own it",
    ],
    awareness: [
      "Head down — every time you lift to look, you slow down",
      "Feel the water, don't fight it — work with the resistance",
      "Count your strokes to the wall — know your own body",
    ],
    hustle: [
      "Fast tempo in practice means fast tempo in races",
      "Every lap is a chance to improve — make it count",
      "Tired in practice means ready for the race",
    ],
    teamwork: [
      "Relay splits win meets — cheer your teammates into the wall",
      "Read your relay anchor — get your timing right on the exchange",
      "Your lane is yours — own it and bring it home for the team",
    ],
  },
  tennis: {
    shooting: [
      "Toss the ball in front — trophy position, then explode up",
      "Racket head low before contact — load that energy",
      "Follow through across your body — that's power AND accuracy",
      "Watch the ball onto the strings — don't look where you want it to go",
    ],
    footwork: [
      "Split step every time your opponent contacts the ball",
      "Small recovery steps to ready position after every shot",
      "Load your outside foot before you hit — transfer that power",
      "Shuffle sideways and stay balanced — big crossover steps only when you must",
    ],
    awareness: [
      "See the whole court — where is your opponent, where are the gaps?",
      "Big picture after the serve — watch where they go, not where the ball goes",
      "Anticipate the return — start moving before they hit",
    ],
    hustle: [
      "Chase every ball — you'll be surprised how many you get back",
      "Effort pays off — every ball retrieved changes momentum",
      "Play every point like it's match point",
    ],
    passing: [
      "Stay low at the net — volley with a firm wrist, not a swing",
      "Move your feet to the ball at net — don't just reach",
      "Poach when you see the opportunity — surprise movement wins doubles",
    ],
    teamwork: [
      "Communicate every serve in doubles — who takes the middle?",
      "Call the poach early — surprise movement is your weapon",
      "Celebrate every point together — momentum is contagious",
    ],
    attitude: [
      "One point at a time — forget the last one, focus on this one",
      "Big moments are opportunities, not threats — embrace the pressure",
      "Breathe between points — reset your body, reset your mind",
    ],
  },
  lacrosse: {
    dribbling: [
      "Top hand does the work, bottom hand guides — feel the rhythm",
      "Eyes up while cradling — look for teammates, not at your stick",
      "Tight cradle when guarded, loose cradle when you have space",
      "Protect the ball — keep your body between the stick and the defender",
    ],
    passing: [
      "Step toward your target — power comes from your feet and hips",
      "Lead your teammate — throw where they're going, not where they are",
      "Quick release: catch and throw in one motion — don't hold it",
      "Both hands on the stick until release — control first",
    ],
    shooting: [
      "Pick a corner, aim low — low shots are hardest to save",
      "Hips into the shot — full body rotation, not just your arms",
      "Off-stick side is the goalie's weakness — aim there",
      "Fake first if a defender is close — get them moving, then shoot",
    ],
    defense: [
      "Keep your stick up between your player and the goal",
      "Check the stick, not the body — body checks are a foul",
      "Force them to their off hand — make them uncomfortable",
      "Don't lunge — stay on your feet, move your feet to stay in front",
    ],
    hustle: [
      "Ground balls win games — sprint to every loose ball",
      "Scoop low — get under it before you pick it up",
      "Transition: when you get the ball, look upfield immediately",
      "First to the ball wins it — want it more than they do",
    ],
    footwork: [
      "Plant your outside foot hard before each dodge — explode in the new direction",
      "Roll dodge: get your body between the defender and the ball",
      "Quick choppy steps beat big lunges in tight spaces",
      "Stay on the balls of your feet — never flat-footed",
    ],
    awareness: [
      "Head up while cradling — know where your teammates are before you catch",
      "Weak-side cutter: when someone drives, cut to the open space",
      "Two outlets — the ball carrier always needs two passing options",
      "Read the defense first: is your player in front or behind?",
    ],
    teamwork: [
      "Move without the ball — don't watch, get open",
      "Call for it — 'I'm open!' helps your teammate make a quick decision",
      "Triangle offense: always two outlets when you have the ball",
      "When we move together, the defense can't stop all of us",
    ],
  },
  baseball: BASEBALL_PHRASES,
  softball: BASEBALL_PHRASES,

  gymnastics: {
    shooting: [
      "Tight body, engaged core — every skill starts with a strong shape",
      "Arms drive the skill — reach hard and pull tight on the way around",
      "Spot your landing: find your point on the mat before your feet hit",
      "Round-off should be your most powerful skill — punch the ground hard",
      "Hollow body from start to finish — no banana back",
    ],
    awareness: [
      "Spot a point on the wall — find it every time and your balance will hold",
      "Feel the beam under your feet, don't look down — trust your body",
      "Slow your breathing: calm body, calm balance",
      "Your arms are your rudder — use them to stay centred",
    ],
    footwork: [
      "Stick the landing — squeeze your feet and hips together on impact",
      "Pointed toes tell the judges you mean it — lead with those feet",
      "Step-kick-step into every tumbling pass — your approach matters",
      "Land with soft knees — absorb the impact, don't crash it",
    ],
    conditioning: [
      "Flexibility is strength — a little further every day adds up over a season",
      "Hollow holds build every skill — commit to those 30 seconds",
      "Your core is your foundation — if it's weak, everything wobbles",
      "Stretch after, not through, the pain — consistent work beats forcing",
    ],
    hustle: [
      "Give your best every pass — effort is the one thing always in your control",
      "Perfect practice makes perfect — don't sleepwalk through a rep",
      "One more rep when you think you're done — that's where champions are made",
    ],
    teamwork: [
      "Cheer loud for your teammates — their nerves are just like yours",
      "Help each other warm up — spotting is an act of trust",
      "A great team environment means every athlete performs better",
    ],
    attitude: [
      "Fear means you care — feel it, then do the skill anyway",
      "Shake off the fall: reset, refocus, and try again — that's gymnastics",
      "Focus on what you can control: your shape, your effort, your attitude",
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
  cooldown: [
    "Great work today — finish strong with this cool-down",
    "Light movement and deep breaths — let your body recover",
    "Reflect on one thing you did well and one thing to improve",
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
 * Normalise a sport slug so both 'flag_football' and 'flag football'
 * resolve to the same key used in SPORT_PHRASES ('flag_football').
 */
function normaliseSportSlug(sportSlug: string | undefined | null): string {
  const key = (sportSlug ?? '').toLowerCase();
  if (key === 'flagfootball' || key === 'flag football') return 'flag_football';
  return key;
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

  const sportKey = normaliseSportSlug(sportSlug);
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
  const sportKey = normaliseSportSlug(sportSlug);
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

  const sportKey = normaliseSportSlug(sportSlug);
  const inSport = !!(SPORT_PHRASES[sportKey]?.[cat]);
  const sportName =
    sportKey === 'basketball' ? 'Basketball' :
    sportKey === 'soccer' ? 'Soccer' :
    sportKey === 'flag_football' ? 'Flag football' :
    sportKey === 'volleyball' ? 'Volleyball' :
    sportKey === 'swimming' ? 'Swimming' :
    sportKey === 'tennis' ? 'Tennis' :
    sportKey === 'gymnastics' ? 'Gymnastics' :
    sportKey === 'baseball' ? 'Baseball' :
    sportKey === 'softball' ? 'Softball' : null;

  if (inSport && sportName) {
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    return `${sportName}: ${label} tip`;
  }

  const label = cat.charAt(0).toUpperCase() + cat.slice(1);
  return `${label} tip`;
}
