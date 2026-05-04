-- Volleyball Sport Seed + Drill Seeds
-- Adds volleyball as the 4th fully-supported sport so coaches can complete
-- onboarding and access a real drill library.

-- ── Sport seed ────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'volleyball',
  'Volleyball',
  '🏐',
  '{"OH","OPP","S","MB","L","DS","Flex"}',
  '{"Attack","Defense","Setting","Serving","Physical","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Serving","Platform Passing","Setting","Attacking","Blocking","Defense","Conditioning","Team Play","Fun Games"}',
  '[{"key":"kills","label":"Kills","type":"number"},{"key":"aces","label":"Aces","type":"number"},{"key":"assists","label":"Assists","type":"number"},{"key":"digs","label":"Digs","type":"number"},{"key":"blocks","label":"Blocks","type":"number"},{"key":"errors","label":"Errors","type":"number"}]',
  false,
  '{"bump":"Forearm Pass","dig":"Emergency Dig","set":"Overhead Set","kill":"Kill","ace":"Ace","stuff":"Stuff Block","seam":"Seam","pipe":"Pipe","overset":"Overset","libero":"Libero"}'
) on conflict (slug) do nothing;

-- ── Drill seeds — 26 drills across all categories ────────────────────────────

-- SERVING (4 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Underhand Serve Line Practice',
 'Players line up behind the service line and take turns serving underhand over the net. Coach adjusts the standing distance closer for younger or smaller players to ensure success. Focus on consistent contact and direction.',
 'Serving',
 '{"5-7","8-10"}',
 8, 1, 20,
 '{"volleyballs","net"}',
 '{"Hold the ball in your non-dominant hand at waist height","Swing your dominant arm like a pendulum — smooth, not slap","Step with your opposite foot as you swing","Follow through: point your hand toward the target"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Overhand Float Serve',
 'Players practice the overhand float serve from behind the end line. Toss slightly in front of the hitting shoulder, contact with a stiff flat palm. Coach marks a target zone near the back corners.',
 'Serving',
 '{"8-10","11-13","14-18"}',
 10, 1, 20,
 '{"volleyballs","net","cones"}',
 '{"Toss the ball slightly in front and above your hitting shoulder","Step with your non-dominant foot — use hip rotation for power","Contact at the highest point with a stiff flat wrist","Aim for the deep corners, not just over the net"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Zone Serve Targeting',
 'Divide the opposite court into six numbered zones with cones or tape. Coach calls a zone number just before the server tosses. Server tries to land in the called zone. Tracks success rate per player.',
 'Serving',
 '{"11-13","14-18"}',
 12, 1, 15,
 '{"volleyballs","net","cones"}',
 '{"Pick your target BEFORE you toss the ball","Consistent toss = consistent contact point","Bend your elbow on the backswing before exploding forward","Trust the process — accuracy comes before power"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Serving Pressure Game',
 'Split into two teams. Each serve that lands in bounds earns a point. Three consecutive errors resets that player''s score to zero. First team to 10 points wins. Simulates game pressure on every serve.',
 'Serving',
 '{"11-13","14-18"}',
 10, 4, 24,
 '{"volleyballs","net"}',
 '{"Pre-serve routine: two bounces, two deep breaths","Routine is what you control — focus on process","Serve aggressive — a weak serve is an easy platform pass","After a miss, reset mentally and physically"}',
 'seeded');

-- PLATFORM PASSING (4 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Bump Basics — Coach Toss',
 'Coach tosses a soft volleyball to each player from 8 feet away. Player practices the forearm pass (bump) sending the ball straight up to themselves, then to the coach. Work in small groups rotating every 5 hits.',
 'Platform Passing',
 '{"5-7","8-10"}',
 8, 2, 20,
 '{"volleyballs"}',
 '{"Make a flat platform: put fists together, arms straight and locked","Bend your knees and get LOW before the ball arrives","Let the ball come to you — do not swing your arms","Watch the ball hit your forearms every single time"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Partner Forearm Pass Series',
 'Partners face each other 15 feet apart and pass continuously using forearm technique. Progress through: stationary passes, one moving, both moving, adding angle passes. Count consecutive passes without the ball hitting the floor.',
 'Platform Passing',
 '{"8-10","11-13"}',
 10, 2, 24,
 '{"volleyballs"}',
 '{"Platform is your foundation — form it BEFORE the ball arrives","Angle your platform toward your target, not just at the ball","Use your legs to adjust height — platform stays locked","Call the ball before you contact it"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Pass to Target Drill',
 'Coach tosses randomly to the left, right, and center of each player''s zone. Player must pass to a specific target (setter position or cone). Progressively speed up the tosses. 10 passes per player, track accuracy to target.',
 'Platform Passing',
 '{"11-13","14-18"}',
 10, 1, 18,
 '{"volleyballs","cones"}',
 '{"Read the ball early — move feet, get behind the trajectory","Square your shoulders to your passing target, not to the server","Extend arms up through contact — finish passing motion","Communicate: call Mine! before every single touch"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Pepper Warm-Up',
 'Pairs work continuously through bump → set → spike (softly) in a rally sequence. Goal is to keep the ball going as long as possible without it hitting the floor. Classic volleyball warm-up that builds all three fundamental touches simultaneously.',
 'Platform Passing',
 '{"8-10","11-13","14-18"}',
 8, 2, 24,
 '{"volleyballs"}',
 '{"Platform passing: arms locked, platform flat, let the ball come","Set: hands above forehead, push not slap","Communicate every touch — call it out","Move your feet first — body behind ball before contact"}',
 'seeded');

-- SETTING (3 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Setting Form Foundations',
 'Players stand near the net and catch a tossed ball above their forehead, then release it in a controlled set. Progress from catching to one-contact set. Focus entirely on hand position and follow-through, not height or accuracy yet.',
 'Setting',
 '{"8-10"}',
 8, 1, 15,
 '{"volleyballs"}',
 '{"Hands form a triangle above your forehead before the ball arrives","Fingers spread wide — all ten fingers touch the ball","Push from your legs AND arms together","Follow through: extend arms fully in the direction of your target"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Wall Setting Series',
 'Players set to a target mark on a wall at net height, trying to maintain a consistent rhythm. 3 sets of 30 reps. Progresses to setting at different distances and angles. Great for individual repetition without a partner.',
 'Setting',
 '{"8-10","11-13"}',
 8, 1, 20,
 '{"volleyballs","wall"}',
 '{"Square your hips and shoulders to the wall target","Same hand position every single time — consistency is the goal","Stay light on your feet — be ready to move","Count your reps — try to beat your record each round"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Set to Attack Zone',
 'Setter at position 2 or 3, passer at zone 6. Coach serves, passer bumps to setter, setter delivers a high outside ball (zone 4) or a back set (zone 2). Rotate after 10 reps. Teaches setter footwork and decision-making under light pressure.',
 'Setting',
 '{"11-13","14-18"}',
 12, 3, 18,
 '{"volleyballs","net","cones"}',
 '{"Get to the setting position BEFORE the ball arrives","Face the outside hitter — square your hips to zone 4","Call the set type before you contact the ball","Consistent height gives your hitter time to approach"}',
 'seeded');

-- ATTACKING (3 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Arm Swing Mechanics',
 'Players practice the arm swing in stages without the ball: elbow high → snap through → follow through. Then with a ball held by partner, then tossed, then set. Slow motion reps before speed. Fixes the most common attack errors.',
 'Attacking',
 '{"8-10","11-13"}',
 10, 1, 20,
 '{"volleyballs"}',
 '{"Draw your elbow back high before you swing — like pulling a bow","Snap through with your wrist at contact — hand finishes down","Contact the top of the ball — you want it going DOWN into the court","Land on both feet balanced — no reaching or leaning"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Approach and Attack Off the Set',
 'Outside hitters take their 3- or 4-step approach and attack a high outside ball set by the setter. Rotate attackers every 5 swings. Coach tracks net errors, out-of-bounds, and kills. Progress to setting varying heights.',
 'Attacking',
 '{"11-13","14-18"}',
 12, 3, 15,
 '{"volleyballs","net"}',
 '{"Approach: left-right-left for right-handers (right-left-right for lefties)","Arm swing starts on your final step — timing is everything","Jump into the ball — do not let the ball drop below your shoulder","Read the block: if they seal the line, swing cross-court"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Down Ball and Tip Repertoire',
 'From the attack approach position, practice three shots: full attack, controlled down-ball (straight arm contact), and tactical tip. Coach calls the shot type 1 second before the hitter contacts the set. Builds complete offensive range.',
 'Attacking',
 '{"11-13","14-18"}',
 10, 3, 15,
 '{"volleyballs","net"}',
 '{"Read the block EARLY — commit to your shot before you jump","Tip: use the pads of your fingers, place it precisely","Down-ball: straight arm, push over the block","Attack with intention — every ball has a destination"}',
 'seeded');

-- BLOCKING (2 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Footwork and Block Basics',
 'Without a ball, players practice the block footwork: step-close-jump for left-to-right movement, shuffle-step for small adjustments, and the jump-reach motion with hands above the net. Slow, then full speed. Add shadow blocking with a coach pointing.',
 'Blocking',
 '{"8-10","11-13"}',
 8, 1, 20,
 '{"net"}',
 '{"Hands above the net BEFORE you jump — do not reach","Push hands over the net toward the attacker","See the ball through the net — track the hitter''s arm","Land balanced — immediately transition to defense"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Double Block Wall',
 'Two blockers work together on the outside pin. Coach or tosser attacks from various approach angles. Blockers practice: communication (who takes line vs. angle), closing the block seam, and transitioning off the net after each block attempt.',
 'Blocking',
 '{"11-13","14-18"}',
 10, 3, 18,
 '{"volleyballs","net"}',
 '{"Outside blocker: take line by default, inside blocker closes","Call out the blocker''s name before you move — communicate!","Both hands seal the seam — no gaps between you","After the block attempt, turn and find the ball immediately"}',
 'seeded');

-- DEFENSE (3 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Defensive Ready Position Drill',
 'Players hold their defensive ready position (knees bent, weight on balls of feet, arms out) for 30-second intervals. Coach tosses unpredictably left or right. Players dive, roll, or sprawl to dig the ball up. Emphasizes low body positioning and reaction speed.',
 'Defense',
 '{"8-10","11-13"}',
 8, 1, 20,
 '{"volleyballs"}',
 '{"Stay low before EVERY play — you cannot dig from standing up","Weight on the balls of your feet, not your heels","Dive through your shoulder, not your elbows or stomach","One dig is good — two digs is great — three digs scores a point"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Butterfly Defense Drill',
 'Players rotate through a continuous defensive circuit: player 1 digs to target, sprints to back of line, player 2 enters. Coach attacks or tosses hard balls from the net. Full team moves through in rapid succession. Excellent for conditioning + defense.',
 'Defense',
 '{"11-13","14-18"}',
 12, 4, 20,
 '{"volleyballs","net"}',
 '{"Move to the ball — do not wait for it to come to you","Platform angle controls direction — angle toward your target","After digging, sprint immediately — next player is waiting","Keep your hips low — never dig from a standing position"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Serve Receive Formation',
 'Full team runs serve receive passing patterns (W-formation or 3-passer system). Server serves to different zones. Passers call the ball early, execute the forearm pass to the setter. Run 20 serves per rotation, then rotate positions.',
 'Defense',
 '{"11-13","14-18"}',
 15, 6, 20,
 '{"volleyballs","net"}',
 '{"Call MINE! as early as possible — the ball is not yours until you call it","Move to the ball in a curved arc — approach from behind","Pass target: 10 feet inside the antenna at net height","After you pass, immediately get ready for the next ball"}',
 'seeded');

-- CONDITIONING (2 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Volleyball Footwork Ladder',
 'Set up an agility ladder or use tape on the floor. Players work through volleyball-specific footwork patterns: shuffle steps, crossover steps, block footwork, and defensive lateral movement. 3 rounds of the ladder, rest between each.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 8, 1, 20,
 '{"agility ladder or tape"}',
 '{"Stay low throughout — bend those knees","Quick light feet — imagine the floor is hot","Eyes up even during the ladder — not at your feet","The same footwork wins you points in a game"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Defensive Circuit',
 'Four stations, 90 seconds each: (1) lateral shuffles sideline to sideline, (2) sprawl-and-recover from knees, (3) dive-roll practice on mat, (4) plank hold. Rotate through all stations twice. Builds the physical foundation for defensive play.',
 'Conditioning',
 '{"11-13","14-18"}',
 15, 4, 24,
 '{"volleyballs","mat"}',
 '{"Technique first, speed second — sloppy fast is slower than clean slow","Breathe on every rep — do not hold your breath","Push through the last 20 seconds of every station","This is what keeps your team on the floor in the fifth set"}',
 'seeded');

-- TEAM PLAY (3 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 '3-Touch Rally Challenge',
 'Two groups of 3 face each other across the net. The goal is to keep the rally alive using exactly 3 touches every time: bump → set → attack (softly) over the net. Coach tracks longest rally per round. Mandatory 3 touches teaches the core pattern.',
 'Team Play',
 '{"8-10","11-13"}',
 10, 4, 20,
 '{"volleyballs","net"}',
 '{"Goal is to keep the rally going — help your teammates!","Call Mine! every single ball — no guessing","Setter: get to the net position as soon as the ball goes over","After the point, talk about what worked"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Serve-Pass-Set-Attack System',
 'Full 6-on-0 team run-through. Server serves, back-row players handle serve receive, setter runs a quick offense, outside/opposite hitter attacks. No defense — repetitions focused on the offensive system running cleanly. 20 serves then rotate.',
 'Team Play',
 '{"11-13","14-18"}',
 15, 6, 18,
 '{"volleyballs","net"}',
 '{"Setter: call the set type as you approach the ball","Hitters: start your approach on the setter''s second step","Passers: target line is your setter''s path — don''t make them chase","After each rally, one player names one thing that went right"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Controlled 6v6 Scrimmage',
 '6v6 scrimmage with coaching interruptions every 5 points. Coach stops play to address one specific technique or team pattern, then resumes. Focus on consistent execution of what was practiced rather than score. Rotate players through positions every 5 points.',
 'Team Play',
 '{"8-10","11-13","14-18"}',
 20, 6, 24,
 '{"volleyballs","net"}',
 '{"Three touches every time unless a kill is there","Communicate on every ball — silence loses rallies","After a point, huddle one second: what did we do well?","Play aggressive — mistakes made trying are learning moments"}',
 'seeded');

-- FUN GAMES (2 drills)

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'Balloon Rally Challenge',
 'Each player (or pair) with a balloon, keep it in the air as long as possible using flat hands together (mimicking the platform pass). Count total hits. Try to beat the team record. Great introduction to ball-tracking and hand-eye coordination before switching to a volleyball.',
 'Fun Games',
 '{"5-7","8-10"}',
 5, 2, 24,
 '{"balloons"}',
 '{"Keep the balloon in the air — focus on hitting it UP, not across","Use both hands flat together when you hit it","Move your feet to get under the balloon before you hit","Count your hits out loud — try to beat your record!"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='volleyball'),
 'King of the Court',
 'One team of 3 starts on the "king" side. Challenger teams of 3 rotate in from the other side. First team to score 3 points wins and stays on the king side. Losing team rotates out. First team to hold the king position for 3 rallies wins the round. High energy and competitive.',
 'Fun Games',
 '{"8-10","11-13","14-18"}',
 12, 4, 24,
 '{"volleyballs","net"}',
 '{"Three touches every rally — no exceptions","Communicate loudly — the noise level tells the coach how hard you''re competing","Win the first ball — serve pressure wins championships","Cheer for every point, yours or theirs — good volleyball is good volleyball"}',
 'seeded');
