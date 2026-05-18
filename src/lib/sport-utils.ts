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
