/**
 * Quick observation templates — pre-defined one-tap observations coaches can
 * log during practice or games without speaking or typing. Each template has a
 * fixed sentiment and skill category so no AI segmentation is required.
 *
 * Sport-specific sets are provided for basketball (default), soccer, volleyball,
 * flag football, baseball, softball, lacrosse, swimming, and tennis. Coaches see
 * templates relevant to their sport, improving category accuracy and making
 * one-tap capture feel tailored.
 */

export type TemplateSentiment = 'positive' | 'needs-work';

export interface ObservationTemplate {
  id: string;
  text: string;
  sentiment: TemplateSentiment;
  /** Matches the category values used by the AI segmentation endpoint */
  category: string;
  emoji: string;
}

// ── Basketball (generic default) ──────────────────────────────────────────────

export const OBSERVATION_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'pos-shooting',    text: 'Great shooting form',       sentiment: 'positive',    category: 'shooting',    emoji: '🎯' },
  { id: 'pos-defense',     text: 'Excellent defense',         sentiment: 'positive',    category: 'defense',     emoji: '🛡️' },
  { id: 'pos-dribbling',   text: 'Strong ball handling',      sentiment: 'positive',    category: 'dribbling',   emoji: '⚡' },
  { id: 'pos-passing',     text: 'Great passing',             sentiment: 'positive',    category: 'passing',     emoji: '🤝' },
  { id: 'pos-hustle',      text: 'Outstanding hustle',        sentiment: 'positive',    category: 'hustle',      emoji: '🔥' },
  { id: 'pos-awareness',   text: 'Smart court vision',        sentiment: 'positive',    category: 'awareness',   emoji: '👁️' },
  { id: 'pos-teamwork',    text: 'Great communication',       sentiment: 'positive',    category: 'teamwork',    emoji: '📣' },
  { id: 'pos-footwork',    text: 'Excellent footwork',        sentiment: 'positive',    category: 'footwork',    emoji: '👟' },
  { id: 'pos-attitude',    text: 'Coachable attitude',        sentiment: 'positive',    category: 'attitude',    emoji: '⭐' },
  { id: 'pos-leadership',  text: 'Showed leadership',         sentiment: 'positive',    category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'nw-shooting',     text: 'Shooting needs work',       sentiment: 'needs-work',  category: 'shooting',    emoji: '🎯' },
  { id: 'nw-defense',      text: 'Defensive positioning off', sentiment: 'needs-work',  category: 'defense',     emoji: '🛡️' },
  { id: 'nw-dribbling',    text: 'Ball handling struggles',   sentiment: 'needs-work',  category: 'dribbling',   emoji: '⚡' },
  { id: 'nw-passing',      text: 'Passing accuracy issues',   sentiment: 'needs-work',  category: 'passing',     emoji: '🤝' },
  { id: 'nw-hustle',       text: 'Needs more effort',         sentiment: 'needs-work',  category: 'hustle',      emoji: '🔥' },
  { id: 'nw-awareness',    text: 'Court awareness lacking',   sentiment: 'needs-work',  category: 'awareness',   emoji: '👁️' },
  { id: 'nw-teamwork',     text: 'Communication breakdown',   sentiment: 'needs-work',  category: 'teamwork',    emoji: '📣' },
  { id: 'nw-footwork',     text: 'Footwork needs attention',  sentiment: 'needs-work',  category: 'footwork',    emoji: '👟' },
  { id: 'nw-attitude',     text: 'Coachability concerns',     sentiment: 'needs-work',  category: 'attitude',    emoji: '⭐' },
  { id: 'nw-conditioning', text: 'Conditioning concerns',     sentiment: 'needs-work',  category: 'conditioning', emoji: '💪' },
];

// ── Soccer ────────────────────────────────────────────────────────────────────

const SOCCER_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'soccer-pos-touch',    text: 'Strong first touch',        sentiment: 'positive',   category: 'dribbling',   emoji: '⚡' },
  { id: 'soccer-pos-shot',     text: 'Accurate shot on goal',     sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'soccer-pos-defense',  text: 'Excellent defending',       sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'soccer-pos-runs',     text: 'Smart off-ball runs',       sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-pos-passing',  text: 'Great through ball',        sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'soccer-pos-hustle',   text: 'High work rate',            sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'soccer-pos-position', text: 'Excellent positioning',     sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-pos-teamwork', text: 'Great communication',       sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'soccer-pos-attitude', text: 'Coachable attitude',        sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'soccer-pos-leader',   text: 'Showed leadership',         sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'soccer-nw-touch',     text: 'First touch needs work',    sentiment: 'needs-work', category: 'dribbling',   emoji: '⚡' },
  { id: 'soccer-nw-shot',      text: 'Shot accuracy off',         sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'soccer-nw-defense',   text: 'Defensive shape off',       sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'soccer-nw-runs',      text: 'Off-ball movement',         sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-nw-passing',   text: 'Passing accuracy',          sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'soccer-nw-hustle',    text: 'Needs more effort',         sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'soccer-nw-position',  text: 'Positional sense',          sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'soccer-nw-teamwork',  text: 'Communication breakdown',   sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'soccer-nw-attitude',  text: 'Coachability concerns',     sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'soccer-nw-condition', text: 'Conditioning concerns',     sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Volleyball ───────────────────────────────────────────────────────────────

const VOLLEYBALL_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'vb-pos-serve',     text: 'Great serve',                sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'vb-pos-pass',      text: 'Clean pass/receive',         sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'vb-pos-set',       text: 'Excellent setting',          sentiment: 'positive',   category: 'passing',     emoji: '👁️' },
  { id: 'vb-pos-spike',     text: 'Powerful spike',             sentiment: 'positive',   category: 'shooting',    emoji: '⚡' },
  { id: 'vb-pos-block',     text: 'Strong block',               sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'vb-pos-dig',       text: 'Solid dig',                  sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'vb-pos-position',  text: 'Smart court positioning',    sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'vb-pos-teamwork',  text: 'Great communication',        sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'vb-pos-hustle',    text: 'Outstanding hustle',         sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'vb-pos-leader',    text: 'Showed leadership',          sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'vb-nw-serve',      text: 'Serve consistency',          sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'vb-nw-pass',       text: 'Passing needs work',         sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'vb-nw-set',        text: 'Setting accuracy off',       sentiment: 'needs-work', category: 'passing',     emoji: '👁️' },
  { id: 'vb-nw-spike',      text: 'Spike technique',            sentiment: 'needs-work', category: 'shooting',    emoji: '⚡' },
  { id: 'vb-nw-block',      text: 'Blocking timing off',        sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'vb-nw-dig',        text: 'Digging struggles',          sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'vb-nw-position',   text: 'Court positioning',          sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'vb-nw-teamwork',   text: 'Communication breakdown',    sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'vb-nw-hustle',     text: 'Needs more effort',          sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'vb-nw-footwork',   text: 'Footwork needs work',        sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
];

// ── Flag Football ─────────────────────────────────────────────────────────────

const FLAG_FOOTBALL_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'ff-pos-routes',    text: 'Great route running',        sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'ff-pos-flagpull',  text: 'Strong flag pull',           sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'ff-pos-throw',     text: 'Accurate throw',             sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'ff-pos-catch',     text: 'Excellent catch',            sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'ff-pos-read',      text: 'Smart play read',            sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'ff-pos-hustle',    text: 'Outstanding hustle',         sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'ff-pos-teamwork',  text: 'Great teamwork',             sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'ff-pos-footwork',  text: 'Excellent footwork',         sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'ff-pos-attitude',  text: 'Coachable attitude',         sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'ff-pos-leader',    text: 'Showed leadership',          sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'ff-nw-routes',     text: 'Route running needs work',   sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'ff-nw-flagpull',   text: 'Flag pull technique',        sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'ff-nw-throw',      text: 'Throw accuracy',             sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'ff-nw-catch',      text: 'Catching issues',            sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'ff-nw-read',       text: 'Reading defense',            sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'ff-nw-hustle',     text: 'More effort needed',         sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'ff-nw-teamwork',   text: 'Communication breakdown',    sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'ff-nw-footwork',   text: 'Footwork needs work',        sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'ff-nw-attitude',   text: 'Coachability concerns',      sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'ff-nw-condition',  text: 'Conditioning concerns',      sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Baseball / Softball ───────────────────────────────────────────────────────

const BASEBALL_SOFTBALL_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'bb-pos-hitting',     text: 'Strong at-bat',              sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'bb-pos-throw',       text: 'Accurate throw to base',     sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'bb-pos-fielding',    text: 'Great glove work',           sentiment: 'positive',   category: 'defense',     emoji: '🛡️' },
  { id: 'bb-pos-baserunning', text: 'Smart baserunning',          sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'bb-pos-hustle',      text: 'Outstanding hustle',         sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'bb-pos-position',    text: 'Excellent field position',   sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'bb-pos-pitching',    text: 'Strong pitching effort',     sentiment: 'positive',   category: 'shooting',    emoji: '⚡' },
  { id: 'bb-pos-teamwork',    text: 'Great team support',         sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'bb-pos-attitude',    text: 'Coachable attitude',         sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'bb-pos-leader',      text: 'Showed leadership',          sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'bb-nw-hitting',      text: 'Batting mechanics',          sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'bb-nw-throw',        text: 'Throwing accuracy',          sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'bb-nw-fielding',     text: 'Fielding needs work',        sentiment: 'needs-work', category: 'defense',     emoji: '🛡️' },
  { id: 'bb-nw-baserunning',  text: 'Baserunning decisions',      sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'bb-nw-hustle',       text: 'Needs more effort',          sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'bb-nw-position',     text: 'Field positioning',          sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'bb-nw-pitching',     text: 'Pitching mechanics',         sentiment: 'needs-work', category: 'shooting',    emoji: '⚡' },
  { id: 'bb-nw-teamwork',     text: 'Communication breakdown',    sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'bb-nw-attitude',     text: 'Coachability concerns',      sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'bb-nw-condition',    text: 'Conditioning concerns',      sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Lacrosse ──────────────────────────────────────────────────────────────────

const LACROSSE_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'la-pos-cradle',     text: 'Smooth cradling in traffic',  sentiment: 'positive',   category: 'dribbling',    emoji: '🥍' },
  { id: 'la-pos-pass',       text: 'Accurate pass',               sentiment: 'positive',   category: 'passing',      emoji: '🤝' },
  { id: 'la-pos-catch',      text: 'Clean catch under pressure',  sentiment: 'positive',   category: 'passing',      emoji: '👐' },
  { id: 'la-pos-shot',       text: 'Strong shot on goal',         sentiment: 'positive',   category: 'shooting',     emoji: '🎯' },
  { id: 'la-pos-defense',    text: 'Excellent defensive check',   sentiment: 'positive',   category: 'defense',      emoji: '🛡️' },
  { id: 'la-pos-groundball', text: 'Won the ground ball',         sentiment: 'positive',   category: 'hustle',       emoji: '🔥' },
  { id: 'la-pos-dodge',      text: 'Great dodge move',            sentiment: 'positive',   category: 'footwork',     emoji: '👟' },
  { id: 'la-pos-position',   text: 'Smart field positioning',     sentiment: 'positive',   category: 'awareness',    emoji: '👁️' },
  { id: 'la-pos-teamwork',   text: 'Great communication',         sentiment: 'positive',   category: 'teamwork',     emoji: '📣' },
  { id: 'la-pos-leader',     text: 'Showed leadership',           sentiment: 'positive',   category: 'leadership',   emoji: '🏆' },
  // Needs work
  { id: 'la-nw-cradle',      text: 'Cradling under pressure',     sentiment: 'needs-work', category: 'dribbling',    emoji: '🥍' },
  { id: 'la-nw-pass',        text: 'Passing accuracy',            sentiment: 'needs-work', category: 'passing',      emoji: '🤝' },
  { id: 'la-nw-catch',       text: 'Catching needs work',         sentiment: 'needs-work', category: 'passing',      emoji: '👐' },
  { id: 'la-nw-shot',        text: 'Shooting mechanics',          sentiment: 'needs-work', category: 'shooting',     emoji: '🎯' },
  { id: 'la-nw-defense',     text: 'Defensive positioning off',   sentiment: 'needs-work', category: 'defense',      emoji: '🛡️' },
  { id: 'la-nw-groundball',  text: 'Ground ball effort',          sentiment: 'needs-work', category: 'hustle',       emoji: '🔥' },
  { id: 'la-nw-dodge',       text: 'Dodging technique',           sentiment: 'needs-work', category: 'footwork',     emoji: '👟' },
  { id: 'la-nw-position',    text: 'Field awareness',             sentiment: 'needs-work', category: 'awareness',    emoji: '👁️' },
  { id: 'la-nw-teamwork',    text: 'Communication breakdown',     sentiment: 'needs-work', category: 'teamwork',     emoji: '📣' },
  { id: 'la-nw-condition',   text: 'Conditioning concerns',       sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Swimming ──────────────────────────────────────────────────────────────────

const SWIMMING_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'sw-pos-stroke',      text: 'Strong stroke technique',    sentiment: 'positive',   category: 'shooting',    emoji: '🏊' },
  { id: 'sw-pos-turn',        text: 'Clean flip turn',             sentiment: 'positive',   category: 'footwork',    emoji: '🔄' },
  { id: 'sw-pos-start',       text: 'Great race start',            sentiment: 'positive',   category: 'hustle',      emoji: '⚡' },
  { id: 'sw-pos-breathing',   text: 'Excellent breathing rhythm',  sentiment: 'positive',   category: 'conditioning', emoji: '💪' },
  { id: 'sw-pos-kick',        text: 'Powerful leg kick',           sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'sw-pos-pull',        text: 'Strong arm pull',             sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'sw-pos-streamline',  text: 'Perfect streamline',          sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'sw-pos-hustle',      text: 'Outstanding effort',          sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'sw-pos-teamwork',    text: 'Great relay teamwork',        sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'sw-pos-leader',      text: 'Showed leadership',           sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'sw-nw-stroke',       text: 'Stroke mechanics',            sentiment: 'needs-work', category: 'shooting',    emoji: '🏊' },
  { id: 'sw-nw-turn',         text: 'Flip turn timing',            sentiment: 'needs-work', category: 'footwork',    emoji: '🔄' },
  { id: 'sw-nw-start',        text: 'Dive entry needs work',       sentiment: 'needs-work', category: 'hustle',      emoji: '⚡' },
  { id: 'sw-nw-breathing',    text: 'Breathing pattern',           sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
  { id: 'sw-nw-kick',         text: 'Kick technique',              sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'sw-nw-pull',         text: 'Arm pull efficiency',         sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'sw-nw-streamline',   text: 'Streamline position',         sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'sw-nw-hustle',       text: 'Needs more effort',           sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'sw-nw-teamwork',     text: 'Communication breakdown',     sentiment: 'needs-work', category: 'teamwork',    emoji: '📣' },
  { id: 'sw-nw-condition',    text: 'Conditioning concerns',       sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Tennis ────────────────────────────────────────────────────────────────────

const TENNIS_TEMPLATES: ObservationTemplate[] = [
  // Positive
  { id: 'tn-pos-serve',       text: 'Great serve placement',       sentiment: 'positive',   category: 'shooting',    emoji: '🎾' },
  { id: 'tn-pos-forehand',    text: 'Strong forehand',             sentiment: 'positive',   category: 'shooting',    emoji: '🎯' },
  { id: 'tn-pos-backhand',    text: 'Solid backhand',              sentiment: 'positive',   category: 'shooting',    emoji: '⚡' },
  { id: 'tn-pos-volley',      text: 'Clean volley at net',         sentiment: 'positive',   category: 'passing',     emoji: '🤝' },
  { id: 'tn-pos-footwork',    text: 'Excellent footwork',          sentiment: 'positive',   category: 'footwork',    emoji: '👟' },
  { id: 'tn-pos-position',    text: 'Smart court positioning',     sentiment: 'positive',   category: 'awareness',   emoji: '👁️' },
  { id: 'tn-pos-hustle',      text: 'Outstanding hustle',          sentiment: 'positive',   category: 'hustle',      emoji: '🔥' },
  { id: 'tn-pos-composure',   text: 'Great mental composure',      sentiment: 'positive',   category: 'attitude',    emoji: '⭐' },
  { id: 'tn-pos-teamwork',    text: 'Great doubles teamwork',      sentiment: 'positive',   category: 'teamwork',    emoji: '📣' },
  { id: 'tn-pos-leader',      text: 'Showed leadership',           sentiment: 'positive',   category: 'leadership',  emoji: '🏆' },
  // Needs work
  { id: 'tn-nw-serve',        text: 'Serve consistency',           sentiment: 'needs-work', category: 'shooting',    emoji: '🎾' },
  { id: 'tn-nw-forehand',     text: 'Forehand mechanics',          sentiment: 'needs-work', category: 'shooting',    emoji: '🎯' },
  { id: 'tn-nw-backhand',     text: 'Backhand needs work',         sentiment: 'needs-work', category: 'shooting',    emoji: '⚡' },
  { id: 'tn-nw-volley',       text: 'Volley technique',            sentiment: 'needs-work', category: 'passing',     emoji: '🤝' },
  { id: 'tn-nw-footwork',     text: 'Footwork needs attention',    sentiment: 'needs-work', category: 'footwork',    emoji: '👟' },
  { id: 'tn-nw-position',     text: 'Court positioning',           sentiment: 'needs-work', category: 'awareness',   emoji: '👁️' },
  { id: 'tn-nw-hustle',       text: 'Needs more effort',           sentiment: 'needs-work', category: 'hustle',      emoji: '🔥' },
  { id: 'tn-nw-composure',    text: 'Mental composure',            sentiment: 'needs-work', category: 'attitude',    emoji: '⭐' },
  { id: 'tn-nw-consistency',  text: 'Shot consistency',            sentiment: 'needs-work', category: 'shooting',    emoji: '🎾' },
  { id: 'tn-nw-condition',    text: 'Conditioning concerns',       sentiment: 'needs-work', category: 'conditioning', emoji: '💪' },
];

// ── Sport lookup map ──────────────────────────────────────────────────────────

const SPORT_TEMPLATES: Record<string, ObservationTemplate[]> = {
  soccer: SOCCER_TEMPLATES,
  flag_football: FLAG_FOOTBALL_TEMPLATES,
  volleyball: VOLLEYBALL_TEMPLATES,
  baseball: BASEBALL_SOFTBALL_TEMPLATES,
  softball: BASEBALL_SOFTBALL_TEMPLATES,
  lacrosse: LACROSSE_TEMPLATES,
  swimming: SWIMMING_TEMPLATES,
  tennis: TENNIS_TEMPLATES,
  // basketball maps to the default OBSERVATION_TEMPLATES (handled in the function)
};

/** All templates across every sport — used for cross-sport lookups by ID. */
export const ALL_OBSERVATION_TEMPLATES: ObservationTemplate[] = [
  ...OBSERVATION_TEMPLATES,
  ...SOCCER_TEMPLATES,
  ...VOLLEYBALL_TEMPLATES,
  ...FLAG_FOOTBALL_TEMPLATES,
  ...BASEBALL_SOFTBALL_TEMPLATES,
  ...LACROSSE_TEMPLATES,
  ...SWIMMING_TEMPLATES,
  ...TENNIS_TEMPLATES,
];

// ── Public helpers ────────────────────────────────────────────────────────────

/**
 * Return only templates with the given sentiment, filtered for the coach's
 * sport. Falls back to the generic basketball templates when the sport is
 * not recognised or not provided.
 */
export function getTemplatesBySentiment(
  sentiment: TemplateSentiment,
  sportSlug?: string,
): ObservationTemplate[] {
  const pool = (sportSlug ? SPORT_TEMPLATES[sportSlug] : undefined) ?? OBSERVATION_TEMPLATES;
  return pool.filter((t) => t.sentiment === sentiment);
}

/** Look up a single template by its stable id, searching across all sports. */
export function findTemplateById(id: string): ObservationTemplate | undefined {
  return ALL_OBSERVATION_TEMPLATES.find((t) => t.id === id);
}
