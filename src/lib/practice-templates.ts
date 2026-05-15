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

// ─── Volleyball Templates ─────────────────────────────────────────────────────

const VOLLEYBALL_U12: PracticeTemplate = {
  id: 'vball-u12-45',
  name: 'Volleyball Basics',
  sport: 'volleyball',
  ageLabel: 'Ages 9–12',
  totalMins: 45,
  description: 'Passing, setting, and serving fundamentals with a mini-game finish.',
  tags: ['beginner', 'fundamentals', 'medium'],
  drills: [
    {
      name: 'Passing Circle Warm-Up',
      durationMins: 7,
      cues: [
        'Platform first — flat forearms together before the ball arrives',
        'Bend your knees and move your feet to get under the ball early',
        'Aim your pass to shoulder height — consistent target for your setter',
        'Call "mine!" loud and clear so everyone knows who has it',
      ],
      description: 'Players stand in a circle and forearm-pass to each other. Focus on platform position and footwork.',
    },
    {
      name: 'Serving Station',
      durationMins: 10,
      cues: [
        'Toss the ball slightly in front of your hitting shoulder — not over your head',
        'Contact at your highest point with a flat, firm hand',
        'Step with your opposite foot as you serve — get your whole body into it',
        'Aim for the back third of the court — depth beats power at this age',
      ],
      description: 'Half the team at the service line, half on the other side to retrieve. Rotate every 3 serves.',
    },
    {
      name: 'Setting Introduction',
      durationMins: 10,
      cues: [
        'High hands above your forehead — make a triangle with your thumbs and fingers',
        'Push with both hands equally — no spinning the ball',
        'Get under the ball, don\'t reach for it',
        'Set it high so your attacker has time to approach',
      ],
      description: 'Coach tosses to setter position; players practice overhead setting in pairs.',
    },
    {
      name: '3v3 Mini Volley',
      durationMins: 18,
      cues: [
        'Three contacts every time — pass, set, attack or over',
        'Talk between every single contact — "mine", "yours", "help"',
        'Celebrate every rally — high-fives build chemistry',
        'Coach: rotate teams every 5 points so everyone plays together',
      ],
      description: 'Small-sided game across a lower net (or rope). Three-hit rule enforced.',
    },
  ],
};

const VOLLEYBALL_U16: PracticeTemplate = {
  id: 'vball-u16-60',
  name: 'Volleyball Competition Prep',
  sport: 'volleyball',
  ageLabel: 'Ages 13–18',
  totalMins: 60,
  description: 'Serve receive, attack combinations, blocking, and competitive scrimmage.',
  tags: ['intermediate', 'competitive', 'long'],
  drills: [
    {
      name: 'Dynamic Warm-Up',
      durationMins: 5,
      cues: [
        'Shuffle laterally — you will do this a hundred times tonight',
        'Arm circles and shoulder rolls — protect your joints',
        'Talk to each other even during warm-up — build the habit now',
      ],
      description: 'Jog the court perimeter, lateral shuffles, arm swings, and light ball pepper in pairs.',
    },
    {
      name: 'Serve Receive Passing',
      durationMins: 12,
      cues: [
        'Read the server\'s toss before the ball crosses the net',
        'Move your feet first — platform is the last thing you set, not the first',
        'Target: setter\'s hands, every single pass. Aim for consistency not perfection',
        'Call the ball every time, even when it\'s obviously yours',
      ],
      description: 'Server serves from the service line; back-row players pass to a setter target position.',
    },
    {
      name: 'Setting & Attacking Combos',
      durationMins: 13,
      cues: [
        'Attackers: three-step approach outside-right-left, explode off both feet',
        'Arm swing starts from behind the ear — full extension through contact',
        'Setters: release the ball at the peak of your jump set, not on the way down',
        'Read the block — line shot when the block is outside, angle when it\'s in',
      ],
      description: 'Setter runs a quick-set to middle and an outside combination. Attackers rotate through both positions.',
    },
    {
      name: 'Blocking Footwork',
      durationMins: 10,
      cues: [
        'Start square to the net — never get caught sideways',
        'Lead with a shuffle step, not a cross-step, when moving one spot',
        'Jump straight up — don\'t float into the net',
        'Penetrate the hands over the net on contact — take their angle away',
      ],
      description: 'Middle blocker closes to outside in 2-step, 3-step patterns. Ball tossed at the antenna for timing.',
    },
    {
      name: 'Competitive Scrimmage',
      durationMins: 15,
      cues: [
        'Play every point like the score is tied — compete on every rally',
        'Losing team: one lap or 5 push-ups — keep stakes real',
        'Coach: call timeout to fix a pattern you see repeated twice',
        'Finish with a team cheer — end on positive energy',
      ],
      description: '6v6 (or 4v4) full game to 15 points, rally scoring. Rotate servers each point.',
    },
    {
      name: 'Team Talk',
      durationMins: 5,
      cues: [
        'Name one thing the team did well today — be specific',
        'Name one thing to fix before the next match — just one',
        'Ask players: "What did you personally work on today?"',
        'Confirm next session time and what to expect',
      ],
      description: 'Bring the team in. Coach shares observations, players share wins and areas to improve.',
    },
  ],
};

// ─── Flag Football Templates ──────────────────────────────────────────────────

const FLAG_FOOTBALL_U8: PracticeTemplate = {
  id: 'ffb-u8-30',
  name: 'Flag Football Intro',
  sport: 'flagfootball',
  ageLabel: 'Ages 6–8',
  totalMins: 30,
  description: 'Flag pulling, throwing, catching, and a fun mini-game for brand-new players.',
  tags: ['beginner', 'fundamentals', 'short'],
  drills: [
    {
      name: 'Flag Freeze Tag',
      durationMins: 7,
      cues: [
        'Go for the flags — both hips, grab quick!',
        'Ball-carrier: change direction to escape, keep the flags on',
        'When your flag is pulled, freeze instantly — that\'s the rule in a game too',
        'Have fun — this is the most fun drill in flag football',
      ],
      description: 'Players wear flags. 2–3 "it" players try to pull everyone\'s flags. Tagged players freeze until freed by a teammate.',
    },
    {
      name: 'Throw & Catch Pairs',
      durationMins: 8,
      cues: [
        'Make a diamond with your thumbs and fingers — that\'s your catching frame',
        'Watch the ball all the way into your hands — eyes on the nose of the ball',
        'Thrower: step toward your target with your front foot as you release',
        'Short passes first — get the feel before you go deep',
      ],
      description: 'Partners 5 yards apart throwing and catching. Move back 2 yards every 3 successful catches.',
    },
    {
      name: 'Simple Routes',
      durationMins: 8,
      cues: [
        'Run hard off the line — make your defender think you\'re going deep',
        'Button hook: run out 5 steps, plant your outside foot, turn back for the ball',
        'Go route: run straight as fast as you can and look up over your shoulder',
        'QB: say "hike" clearly so your center knows when to snap',
      ],
      description: 'Walk through button hook and go route. Then QB snaps from center and throws to a receiver running one of the two routes.',
    },
    {
      name: '3v3 Mini Game',
      durationMins: 7,
      cues: [
        'Offense: spread out — give the QB targets to throw to',
        'Defense: one person rushes the QB after "three Mississippi", others cover',
        'No-run rule reminds: in flag football, we throw! No running with the ball after the snap',
        'Celebrate every TD AND every flag pull equally — both sides matter',
      ],
      description: '3v3 flag game across 30 yards. 4 downs to score, then switch possession.',
    },
  ],
};

const FLAG_FOOTBALL_U12: PracticeTemplate = {
  id: 'ffb-u12-45',
  name: 'Flag Football Fundamentals',
  sport: 'flagfootball',
  ageLabel: 'Ages 9–12',
  totalMins: 45,
  description: 'Route running, QB mechanics, coverage fundamentals, and competitive scrimmage.',
  tags: ['intermediate', 'fundamentals', 'medium'],
  drills: [
    {
      name: 'Dynamic Warm-Up',
      durationMins: 5,
      cues: [
        'High knees and butt kicks — get those hips warm',
        'Lateral shuffles: stay low, don\'t cross your feet',
        'Sprint 10 yards at 70% — not full speed yet, just awaken the muscles',
      ],
      description: 'Jog, high knees, lateral shuffle, and two short acceleration sprints.',
    },
    {
      name: 'Route Tree Intro',
      durationMins: 10,
      cues: [
        'Sell every route — run the same way for the first 3 steps no matter what route you\'re running',
        'Slant: 3 steps upfield, plant your outside foot, break 45° inside',
        'Out route: 5 steps upfield, plant, break sharp toward the sideline',
        'The break is where you beat the defender — make it clean and sudden',
      ],
      description: 'Walk-through then full-speed reps of slant, out, and comeback routes. QB tosses to each receiver after the break.',
    },
    {
      name: 'QB Drop & Receivers Combo',
      durationMins: 12,
      cues: [
        'QB 3-step drop: catch the snap, drop back three steps, plant, set your feet',
        'Eyes down the field — look off the defender before throwing to your real target',
        'Release quickly: flag football QBs don\'t have much protection, get rid of it',
        'Receivers: run to where the QB can throw you open, not where the QB is standing',
      ],
      description: 'Two receivers run different routes; QB reads primary vs secondary and throws within 3 seconds.',
    },
    {
      name: 'Flag Pulling Defense',
      durationMins: 8,
      cues: [
        'Stay between the ball-carrier and the end zone — position beats speed',
        'Two-hand grab on the flags — commit to both hips, not just one',
        'Don\'t dive early — wait until you\'re close enough to guarantee the pull',
        'After a pull: hold the flags up high so the ref sees the stop',
      ],
      description: '1-on-1 flag pulling. Carrier runs in a 10-yard corridor; defender approaches and pulls flags.',
    },
    {
      name: '4v4 Scrimmage',
      durationMins: 10,
      cues: [
        'Offense: run a real play from the huddle — no winging it',
        'Defense: communicate pre-snap — man or zone, point it out',
        'Every possession starts at midfield, 4 downs to score',
        'Coach: stop play to point out excellent decisions (not just big plays)',
      ],
      description: '4v4 game with full snap, routes, and flag pulling. Coach officiates and calls teaching moments.',
    },
  ],
};

const FLAG_FOOTBALL_U16: PracticeTemplate = {
  id: 'ffb-u16-60',
  name: 'Flag Football Game Prep',
  sport: 'flagfootball',
  ageLabel: 'Ages 13–18',
  totalMins: 60,
  description: 'Advanced route combinations, red zone execution, rush defense, and full competitive scrimmage.',
  tags: ['advanced', 'competitive', 'long'],
  drills: [
    {
      name: 'Warm-Up & Alignment Review',
      durationMins: 5,
      cues: [
        'Every rep starts with perfect alignment and a solid stance',
        'Review last session\'s one thing to fix — focus it before you rep it',
        'Dynamic stretch: leg swings, hip rotations, 3 acceleration bursts',
      ],
      description: 'Dynamic warm-up followed by a quick verbal review of the alignment schemes from last session.',
    },
    {
      name: 'Route Combinations',
      durationMins: 12,
      cues: [
        'Mesh route: inside receivers cross low, outside goes to vacated space — timing is everything',
        'Slant-flat combo: slant pulls the linebacker inside, flat route opens behind them',
        'Attack the part of the field the defense gives you — read pre-snap',
        'QB: go through your progression — look off the safety before committing',
      ],
      description: 'Run mesh and slant-flat combos at full speed. Focus on timing between QB release and receiver break.',
    },
    {
      name: 'Red Zone Execution',
      durationMins: 10,
      cues: [
        'Compressed field means tight windows — every route must be precise',
        'Fade to the back corner: run outside the corner\'s frame, don\'t round it',
        'Quick slant gets the ball out fast before the rush hits the QB',
        'If you score in practice, you\'ll score in the game — rep it to own it',
      ],
      description: 'Offense starts on the 15-yard line, 3 plays to score. Rotate offense and defense. Score = 1 point; stop = 1 point.',
    },
    {
      name: 'Rush Defense Reads',
      durationMins: 10,
      cues: [
        'Rusher: delay one step to see where the QB looks, then attack that side',
        'Coverage: when rush gets close, press your receiver — take away the easy throw',
        'Zone coverage: eyes on QB not receiver — break on the ball\'s flight path',
        'Trust your teammates — don\'t leave your zone to help or you open up a bigger gap',
      ],
      description: 'Defense practices 1-rusher stunts and zone adjustments. QB runs 3-step drops against the rush.',
    },
    {
      name: 'Full Scrimmage',
      durationMins: 18,
      cues: [
        'Play with full competitive intensity — this is game prep',
        'Offense: huddle between every play, call a real play',
        'Defense: communicate the coverage before every snap — no silent plays',
        'Coach: let it run without stopping unless you see a safety or repeated error',
      ],
      description: '5v5 or 6v6 full scrimmage from the 50-yard line. Complete offensive possessions, change on turnovers or scores.',
    },
    {
      name: 'Debrief & Game-Plan Preview',
      durationMins: 5,
      cues: [
        'Name two things the offense did well and one to clean up',
        'Name two things the defense did well and one to clean up',
        'Preview one play to install next session — give them something to think about',
        'Finish on energy — team chant or handshake',
      ],
      description: 'Bring the team in. Coach delivers observations, sets up the next session\'s focus.',
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

// ─── Template Registry ───────────────────────────────────────────────────────

export const PRACTICE_TEMPLATES: PracticeTemplate[] = [
  FIRST_PRACTICE,
  BASKETBALL_U8,
  BASKETBALL_U12,
  BASKETBALL_U16,
  SOCCER_U8,
  SOCCER_U12,
  VOLLEYBALL_U12,
  VOLLEYBALL_U16,
  FLAG_FOOTBALL_U8,
  FLAG_FOOTBALL_U12,
  FLAG_FOOTBALL_U16,
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
