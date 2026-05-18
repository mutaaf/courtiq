export const SPORT_EMOJIS: Record<string, string> = {
  basketball:   '🏀',
  soccer:       '⚽',
  volleyball:   '🏐',
  flag_football:'🏈',
  baseball:     '⚾',
  softball:     '🥎',
  lacrosse:     '🥍',
  swimming:     '🏊',
  tennis:       '🎾',
  gymnastics:   '🤸',
};

export function getSportEmoji(sportSlug?: string | null): string {
  return SPORT_EMOJIS[sportSlug ?? ''] ?? '🏅';
}

/** Drill builder category labels per sport, shown in the AI drill builder form. */
export const SPORT_DRILL_BUILDER_CATEGORIES: Record<string, string[]> = {
  basketball:    ['Shooting', 'Defense', 'Dribbling', 'Passing', 'Offense', 'Conditioning', 'Fundamentals', 'Teamwork'],
  soccer:        ['Passing', 'Shooting', 'Defense', 'Dribbling', 'Positioning', 'Conditioning', 'Fundamentals', 'Teamwork'],
  volleyball:    ['Serving', 'Passing', 'Setting', 'Attacking', 'Blocking', 'Defense', 'Conditioning', 'Teamwork'],
  flag_football: ['Passing', 'Catching', 'Running Routes', 'Defense', 'Agility', 'Conditioning', 'Fundamentals', 'Teamwork'],
  baseball:      ['Hitting', 'Fielding', 'Throwing', 'Pitching', 'Baserunning', 'Conditioning', 'Fundamentals', 'Teamwork'],
  softball:      ['Hitting', 'Fielding', 'Throwing', 'Pitching', 'Baserunning', 'Conditioning', 'Fundamentals', 'Teamwork'],
  lacrosse:      ['Stick Skills', 'Passing', 'Shooting', 'Defense', 'Ground Balls', 'Conditioning', 'Fundamentals', 'Teamwork'],
  swimming:      ['Stroke Technique', 'Flip Turns', 'Race Starts', 'Kick Sets', 'Breathing', 'Relay', 'Conditioning', 'Fun Games'],
  tennis:        ['Serving', 'Groundstrokes', 'Volleys', 'Footwork', 'Rally Drills', 'Match Play', 'Conditioning', 'Fun Games'],
  gymnastics:    ['Tumbling', 'Balance', 'Bar Work', 'Flexibility', 'Body Form', 'Conditioning', 'Artistry', 'Fun Games'],
};

const DEFAULT_DRILL_BUILDER_CATEGORIES = ['Offense', 'Defense', 'Conditioning', 'Fundamentals', 'Passing', 'Shooting', 'Dribbling', 'Teamwork'];

export function getDrillBuilderCategories(sportSlug?: string | null): string[] {
  return SPORT_DRILL_BUILDER_CATEGORIES[sportSlug ?? ''] ?? DEFAULT_DRILL_BUILDER_CATEGORIES;
}

/**
 * Sport-specific example phrases for the onboarding voice capture demo.
 * Each phrase is a natural thing a volunteer coach would say about a player.
 */
export const SPORT_EXAMPLE_PHRASES: Record<string, string> = {
  basketball:    "Sarah's footwork looked sharp on closeouts today.",
  soccer:        "Jordan made great runs off the ball in the second half.",
  volleyball:    "Marcus had excellent serve accuracy, hitting the corners consistently.",
  flag_football: "Alex showed great route running on the corner routes today.",
  baseball:      "Tyler's fielding footwork improved a lot — charging the ball aggressively.",
  softball:      "Emma had outstanding pitching mechanics, staying tall through her release.",
  lacrosse:      "Jordan's cradling technique has really improved — protecting the ball well.",
  swimming:      "Alex had excellent flip turn execution, gaining a full body length off the wall.",
  tennis:        "Sarah's backhand cross-court has become really consistent under pressure.",
  gymnastics:    "Marcus held a perfect handstand position — body completely straight and tight.",
};

const DEFAULT_EXAMPLE_PHRASE = "Sarah's footwork looked sharp, and Jordan had great defensive positioning.";

export function getSportExamplePhrase(sportSlug?: string | null): string {
  return SPORT_EXAMPLE_PHRASES[sportSlug ?? ''] ?? DEFAULT_EXAMPLE_PHRASE;
}

/**
 * Sport-specific AI preambles injected into every AI system prompt via
 * `buildAIContext`. They tell the AI what vocabulary and terminology to use
 * so that generated text (player messages, practice plans, coaching briefs,
 * debriefs) sounds natural for the coach's sport instead of defaulting to
 * basketball language.
 */
export const SPORT_PREAMBLES: Record<string, string> = {
  basketball:    'Use basketball terminology. Players are on the court. Use terms like dribble, shoot, rebound, closeout, pick-and-roll, lane, paint.',
  soccer:        'Use soccer terminology. Players are on the pitch. Use terms like ball control, first touch, through-ball, pressing, goalkeeper, striker, possession.',
  volleyball:    'Use volleyball terminology. Players are on the court. Use terms like serve, pass/receive, set, spike, block, dig, rotation, libero.',
  flag_football: 'Use flag football terminology. Players are on the field. Use terms like route running, flag pull, snap, pocket awareness, receiver, quarterback.',
  baseball:      'Use baseball terminology. Players are on the field or diamond. Use terms like hitting, fielding, throwing arm, pitching, baserunning, plate discipline.',
  softball:      'Use softball terminology. Players are on the field or diamond. Use terms like hitting, fielding, pitching (windmill), batting, baserunning.',
  lacrosse:      'Use lacrosse terminology. Players are on the field. Use terms like cradling, passing, catching, shooting, ground balls, face-off, crease, stick skills.',
  swimming:      "Use swimming terminology. Always say 'swimmer' or 'athlete', NEVER 'player'. Athletes are in the pool. Use terms like stroke technique, flip turn, race start, kick, pull, streamline, breathing rhythm. Do NOT use 'court', 'field', 'shoot', or 'on the ball'.",
  tennis:        'Use tennis terminology. Players are on the court. Use terms like serve, return, forehand, backhand, volley, rally, split-step, approach shot, baseline.',
  gymnastics:    "Use gymnastics terminology. Always say 'gymnast' or 'athlete', NEVER 'player'. Athletes are on the floor, beam, bars, or vault. Use terms like tumbling, handstand, cartwheel, kip, cast, balance, body form, landing, dismount. Do NOT use 'court', 'field', 'dribble', or 'shoot'.",
};

const DEFAULT_SPORT_PREAMBLE = '';

export function getSportPreamble(sportSlug?: string | null): string {
  return SPORT_PREAMBLES[sportSlug ?? ''] ?? DEFAULT_SPORT_PREAMBLE;
}

/**
 * Sport-specific example prompts shown in the AI drill builder form.
 * Each triple matches the categories for that sport so coaches see
 * realistic examples, not basketball-only suggestions.
 */
export const SPORT_DRILL_BUILDER_EXAMPLES: Record<string, string[]> = {
  basketball:    [
    'A dribbling drill for beginners with cones, fun for ages 8-10',
    'Defensive footwork exercise using chairs, 10 minutes, intermediate level',
    'Fun shooting competition game for 8 players, ages 10-12',
  ],
  soccer:        [
    'A passing drill for 4-6 players that builds first touch and accuracy',
    'Defensive pressure exercise with cones, 10 minutes, intermediate level',
    'Fun dribbling competition through gates, ages 8-12',
  ],
  volleyball:    [
    'A serving accuracy drill targeting corners of the court, 10 minutes',
    'Passing and digging exercise for 6 players in pairs, beginner level',
    'Fun setting game for 4-8 players that improves hand placement',
  ],
  flag_football: [
    'A route-running drill for 3 receivers plus a QB, 10 minutes',
    'Flag-pulling defensive exercise with cones, intermediate level',
    'Fun catching competition for 6-8 players, ages 8-12',
  ],
  baseball:      [
    'A fielding ground-ball drill for 4 players, 10 minutes, beginner level',
    'Soft-toss hitting station for 2-3 players, intermediate level',
    'Fun baserunning relay race for 8 players, ages 8-12',
  ],
  softball:      [
    'A fielding ground-ball drill for 4 players, 10 minutes, beginner level',
    'Pitching mechanics warm-up for 2-3 players, intermediate level',
    'Fun batting competition game for 6-8 players, ages 8-12',
  ],
  lacrosse:      [
    'A cradling drill through cones for beginners, 10 minutes, ages 8-10',
    'Passing accuracy exercise for pairs, intermediate level',
    'Fun shooting game with small goals for 6 players',
  ],
  swimming:      [
    'A flip-turn technique drill for beginners, 15 minutes in shallow end',
    'Kick-set exercise with kickboards for 4-6 swimmers, 10 minutes',
    'Fun relay race game for 8 swimmers to build team spirit, ages 8-12',
  ],
  tennis:        [
    'A crosscourt forehand rally drill for 2 players, 10 minutes',
    'Serve placement exercise targeting service boxes, intermediate level',
    'Fun mini-tennis rally competition for 4 players, ages 8-12',
  ],
  gymnastics:    [
    'A handstand progressions drill for beginners using wall support, 10 minutes',
    'Balance beam walk exercise for 3-4 gymnasts, beginner level',
    'Fun cartwheel relay across the floor for 6 gymnasts, ages 6-10',
  ],
};

const DEFAULT_DRILL_BUILDER_EXAMPLES = [
  'A passing drill for 3-5 players that builds accuracy and communication',
  'Defensive footwork exercise using cones, 10 minutes, intermediate level',
  'Fun competition game for 8 players, ages 10-12',
];

export function getDrillBuilderExamples(sportSlug?: string | null): string[] {
  return SPORT_DRILL_BUILDER_EXAMPLES[sportSlug ?? ''] ?? DEFAULT_DRILL_BUILDER_EXAMPLES;
}
