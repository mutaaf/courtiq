-- Migration 033: Sports seeds for Baseball, Softball, Lacrosse, Swimming, Tennis, Gymnastics
-- P77-P82 added TypeScript templates/phrases for these sports but never created DB rows,
-- causing "Sport not found" (404) errors when coaches select them during onboarding.
-- Each sport gets a sports row + ~15 seed drills covering all drill categories.

-- ── Baseball ─────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'baseball',
  'Baseball',
  '⚾',
  '{"P","C","1B","2B","3B","SS","LF","CF","RF","DH","Flex"}',
  '{"Hitting","Fielding","Pitching","Throwing","Physical","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Hitting","Fielding","Throwing","Pitching","Baserunning","Conditioning","Team Play","Fun Games"}',
  '[{"key":"at_bats","label":"At-Bats","type":"number"},{"key":"hits","label":"Hits","type":"number"},{"key":"runs","label":"Runs","type":"number"},{"key":"rbi","label":"RBI","type":"number"},{"key":"strikeouts","label":"Strikeouts","type":"number"},{"key":"walks","label":"Walks","type":"number"}]',
  false,
  '{"at_bat":"At-Bat","rbi":"RBI","strikeout":"Strikeout","walk":"Walk","balk":"Balk","bunt":"Bunt","sacrifice":"Sacrifice","groundout":"Groundout","flyout":"Flyout","double_play":"Double Play"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;

-- HITTING (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Tee Work Fundamentals',
 'Every player works on their swing with a batting tee, focusing on stance, load, and contact point. Players hit 20 reps, adjusting tee height to inside, belt, and outside pitch locations. Coach watches hip rotation and head position.',
 'Hitting',
 '{"5-7","8-10","11-13","14-18"}',
 10, 1, 15,
 '{"batting tees","baseballs","batting helmets","bats"}',
 '{"Knob of the bat to the ball — lead with your hands","Hips rotate FIRST — hands follow the hips","Keep your head still and eyes on the contact point","Short stride, big rotation — power comes from your core"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Soft Toss Hitting Station',
 'Partner or coach kneels to the side and tosses balls underhand into the hitting zone from 6–8 feet. Batter hits 15 tosses, focusing on driving the ball to the opposite field first, then up the middle. Great for rhythm and timing.',
 'Hitting',
 '{"8-10","11-13","14-18"}',
 12, 2, 20,
 '{"baseballs","bats","batting helmets","L-screen or fence"}',
 '{"Let the ball travel deep into the zone — do not reach","Stay back and load — do not lunge at the ball","Top hand drives through contact toward the pitcher","Watch the ball hit the bat — every single swing"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Live BP Batting Practice',
 'Coach or player pitches from a short distance (30–40 feet for younger, full distance for older). Batters take 10–15 swings focusing on making contact. Rotate every set. All fielders in position. Great for game-situation repetitions.',
 'Hitting',
 '{"8-10","11-13","14-18"}',
 20, 5, 16,
 '{"baseballs","bats","batting helmets","gloves"}',
 '{"See the ball, hit the ball — track it all the way to contact","Short compact swing — stay inside the ball","Drive the back hip toward the pitcher","One approach — stay consistent from pitch to pitch"}',
 'seeded');

-- FIELDING (4 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Ground Ball Fundamentals',
 'Coach rolls or hits ground balls to players one at a time. Players charge the ball, field with two hands, and throw to first base. Work through: slow rollers, backhand balls, and hard shots up the middle. 5 reps per player per round.',
 'Fielding',
 '{"5-7","8-10","11-13","14-18"}',
 10, 2, 20,
 '{"baseballs","gloves"}',
 '{"Attack the ball — do not wait for it to come to you","Get your body in front: align your belly button with the ball","Field with two hands, glove fingers pointing down","Shuffle your feet into throwing position after the catch"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Fly Ball Tracking',
 'Coach hits or tosses pop-ups and fly balls to outfielders. Players work on drop step, route efficiency, and catching above the glove ear. Progress from easy routine catches to over-the-shoulder running catches.',
 'Fielding',
 '{"8-10","11-13","14-18"}',
 12, 2, 15,
 '{"baseballs","gloves","fungo bat"}',
 '{"First step is always a drop step — read the ball quickly","Get to the spot early, not late — camp under it","Squeeze with two hands at the peak of your reach","Call the ball: Mine! — communicate every fly ball"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Infield Around the Horn',
 'Infielders practice throwing the ball around the horn: 3B → 2B → SS → 1B → C and back. Focus on footwork, quick transfers, and accurate throws. Time each rotation. Progress to adding bounce-pass variations and tags.',
 'Fielding',
 '{"8-10","11-13","14-18"}',
 10, 4, 10,
 '{"baseballs","gloves"}',
 '{"Feet set before you throw — do not throw off-balance","Two-hand catch, one-hand throw — quick transfer","Step toward your target, not just your arm","Accuracy before speed — a bad throw wastes more time than a slow one"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Four-Corner Throwing',
 'Players stand at the four bases and throw in sequence: home → 3B → 1B → 2B → home. Each throw should be at game speed with proper footwork. Focus on crow-hops and step-and-throw mechanics. Gradually increase speed each round.',
 'Throwing',
 '{"8-10","11-13","14-18"}',
 8, 4, 12,
 '{"baseballs","gloves"}',
 '{"Crow-hop before every throw — never flat-footed","Point your glove-side shoulder toward the target","Release over the top or three-quarters — stay consistent","Follow through: your throwing arm finishes by your opposite hip"}',
 'seeded');

-- PITCHING (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Bullpen Session',
 'Pitchers throw from the mound to a catcher (or coach with target mitt) working through fastball location: inside, outside, up, down. 25–40 pitches per session depending on age and pitch count rules. Coach tracks location and mechanics.',
 'Pitching',
 '{"8-10","11-13","14-18"}',
 15, 2, 4,
 '{"baseballs","gloves","catcher gear","home plate"}',
 '{"Consistent balance point before every pitch — same every time","Drive off the rubber toward home plate — use your legs","Finish with your glove under your arm — protect yourself","Hit your spots: corners, not the middle of the plate"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Flat Ground Mechanics',
 'Pitchers work through their delivery on flat ground without the mound, focusing purely on mechanics: balance, hip drive, arm path, and follow-through. Pairs work at 30-40 feet. Great for warm-up and mechanical reinforcement.',
 'Pitching',
 '{"8-10","11-13","14-18"}',
 10, 2, 10,
 '{"baseballs","gloves"}',
 '{"Start with 50% effort — mechanics before velocity","Hip closed until foot plant — then explode open","Arm circles high and loose — not stiff","Finish over your front knee — full extension on every rep"}',
 'seeded');

-- BASERUNNING (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Baserunning Circuit',
 'Players sprint from home to first, rounding first toward second, then stopping at second. Then from first to third, then first to home on a single. Coach gives time feedback. Focus on efficient turns and reading the coach''s hand signals.',
 'Baserunning',
 '{"8-10","11-13","14-18"}',
 10, 2, 16,
 '{"bases"}',
 '{"Hit the inside corner of the base — cut the distance","Run through first on a single — stop past the bag","Touch the inside of each base on extra-base hits","Watch the third base coach — hands say go or stop"}',
 'seeded');

-- CONDITIONING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Base Sprint Challenges',
 'Timed base-to-base sprints with competition: home to first, first to second with a lead, and home-to-home full circuit. Players track their times and try to improve each week. Ends with light jog around the bases as cool-down.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 8, 2, 20,
 '{"bases","stopwatch"}',
 '{"Explode from the box — first three steps win the race","Run in a straight line — do not drift into the grass","Pump your arms, pump your legs — they work together","Your hustle on the bases forces the other team to make errors"}',
 'seeded');

-- FUN GAMES (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='baseball'),
 'Pickle (Rundown) Game',
 'Two defenders cover two bases 45 feet apart while a runner tries to reach either base safely. Runner has 4 attempts before switching. Defenders practice rundown mechanics: advance the ball, take the throw, make the tag. Everyone gets multiple reps as both runner and defender.',
 'Fun Games',
 '{"5-7","8-10","11-13","14-18"}',
 10, 3, 15,
 '{"baseballs","gloves","bases"}',
 '{"Runner: commit and go — do not fake endlessly","Defender: advance the ball quickly, throw late","Make the tag with the back of your glove","Communicate: your voice tells your partner where you are"}',
 'seeded');

-- ── Softball ─────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'softball',
  'Softball',
  '🥎',
  '{"P","C","1B","2B","3B","SS","LF","CF","RF","DP/Flex"}',
  '{"Hitting","Fielding","Pitching","Throwing","Physical","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Hitting","Fielding","Throwing","Pitching","Baserunning","Conditioning","Team Play","Fun Games"}',
  '[{"key":"at_bats","label":"At-Bats","type":"number"},{"key":"hits","label":"Hits","type":"number"},{"key":"runs","label":"Runs","type":"number"},{"key":"rbi","label":"RBI","type":"number"},{"key":"strikeouts","label":"Strikeouts","type":"number"},{"key":"walks","label":"Walks","type":"number"}]',
  false,
  '{"at_bat":"At-Bat","rbi":"RBI","circle_change":"Circle Change","rise_ball":"Rise Ball","drop_ball":"Drop Ball","screwball":"Screwball","windmill":"Windmill","bunt":"Slap Bunt","dp_flex":"DP/Flex"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;

-- HITTING (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Tee Work — Contact Zone',
 'Players work at a batting tee set to three heights: low-away, belt, and high-inside. 15 swings at each zone. Coach watches hip drive and hand path. Emphasis on staying through the ball rather than pulling off.',
 'Hitting',
 '{"5-7","8-10","11-13","14-18"}',
 10, 1, 15,
 '{"batting tees","softballs","batting helmets","bats"}',
 '{"Squish the bug — back foot pivots, do not step","Short quick hands to the ball — no long looping swing","Drive through the ball toward center field","Head still and down through contact — eyes stay on the ball"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Live Pitching BP',
 'Pitcher throws full-speed from the circle (or coach throws from a shorter distance for younger players). Batters take 10 live swings focusing on timing the windmill delivery. Rotate every set. All fielders in position.',
 'Hitting',
 '{"8-10","11-13","14-18"}',
 20, 5, 16,
 '{"softballs","bats","batting helmets","gloves"}',
 '{"Load early — your hands start back before the pitch is released","See the hip to read spin — react to what you see","Attack the strike zone, lay off balls — be selective","Trust your preparation — your body knows what to do"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Slap and Bunt Drill',
 'Players practice the slap bunt and push bunt techniques from both sides of the plate. Coach pitches underhanded. Focus on proper grip change, angling the bat, and placing the ball in the 1B or 3B gap. 10 reps each variation.',
 'Hitting',
 '{"11-13","14-18"}',
 12, 2, 15,
 '{"softballs","bats","batting helmets"}',
 '{"Angle the bat early — grip change before the pitch","Deaden the ball — soft hands absorb pace","Place it, do not slap it — control beats power on a bunt","Take off running as you make contact — head start wins the race"}',
 'seeded');

-- FIELDING (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Short Hop Reaction Drill',
 'Players take turns in front of a net or wall. Coach throws short hops from 6 feet away. Player must field with two hands, staying square. Progress from easy rollers to hard short hops. Builds hand-eye reaction for the quick infield hops softball produces.',
 'Fielding',
 '{"8-10","11-13","14-18"}',
 8, 2, 20,
 '{"softballs","gloves","net or wall"}',
 '{"Stay low — field every ball out in front","Two hands every time — glove guides, throwing hand secures","Soft hands: give slightly on the catch","Stay square — your chest faces the ball all the way in"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Fly Ball Communication',
 'Two or three outfielders work together. Coach hits fly balls to the gaps between them. Players must call the ball (Mine!) early and the non-calling player must get out of the way and back them up. Teaches communication and collision prevention.',
 'Fielding',
 '{"8-10","11-13","14-18"}',
 10, 3, 15,
 '{"softballs","gloves","fungo bat"}',
 '{"First voice wins the ball — call Mine! immediately","Back up your teammate — move to the spot behind them","Center fielder has priority in the gaps — outfield rule","After catching, look to make a play — do not hold the ball"}',
 'seeded');

-- PITCHING (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Windmill Mechanics Drill',
 'Pitchers work through windmill delivery in stages: arm circle only, then with step, then full delivery. Slow motion to establish mechanics before adding speed. Partner or coach gives feedback on wrist snap and release point.',
 'Pitching',
 '{"8-10","11-13","14-18"}',
 12, 2, 6,
 '{"softballs","gloves"}',
 '{"K-position: arm parallel to ground at 9 o''clock before accelerating","Hip drives first — arm follows the hip","Wrist snap at the hip: K-wrist snap = spin and speed","Follow through across your body — finish strong"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Location and Control Bullpen',
 'Pitcher throws 25-30 pitches to a catcher working through target zones: low-away, low-inside, high-away. Track accuracy percentage per zone. Coach identifies the strongest location and reinforces it. Builds the pitcher''s go-to pitch.',
 'Pitching',
 '{"11-13","14-18"}',
 15, 2, 4,
 '{"softballs","gloves","catcher gear","home plate"}',
 '{"Pick a specific target on the catcher''s glove — not a zone","Release point is your accuracy key — repeat it every pitch","Breathe between pitches — never throw tense","Your best pitch thrown with confidence beats a fancy pitch thrown uncertain"}',
 'seeded');

-- CONDITIONING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Agility Base Drill',
 'Players sprint between bases in game-simulation patterns: home to first, first to third, lead and steal to second, tag-up from second. Coach gives go or stop signals at key points. Focus on reading signals and explosive first steps.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 10, 2, 20,
 '{"bases","stopwatch"}',
 '{"Your lead is your edge — get a good one on every pitch","First two steps are most important — explode, do not jog","Head up on the bases: always know the situation","Aggressive running creates pressure — force their errors"}',
 'seeded');

-- FUN GAMES (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='softball'),
 'Home Run Derby',
 'Two teams take turns at a tee or soft toss. Each player gets 5 swings. Balls hit past second base (in the outfield) count as singles; past the fence or a designated mark count as home runs. Team with most home runs wins the round. Builds confidence and power.',
 'Fun Games',
 '{"5-7","8-10","11-13","14-18"}',
 12, 4, 20,
 '{"softballs","bats","batting helmets","tees or tosser"}',
 '{"Swing big and swing through the ball","Get your hips into it — power comes from rotation","Stay balanced — a falling-over swing loses power","Cheer every teammate''s big hit — great energy wins practices"}',
 'seeded');

-- ── Lacrosse ─────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'lacrosse',
  'Lacrosse',
  '🥍',
  '{"Attack","Midfield","Defense","Goalkeeper","Long Stick Midfielder","Flex"}',
  '{"Stick Skills","Defense","Shooting","Athletic","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Stick Skills","Passing","Shooting","Defense","Ground Balls","Conditioning","Team Play","Fun Games"}',
  '[{"key":"goals","label":"Goals","type":"number"},{"key":"assists","label":"Assists","type":"number"},{"key":"ground_balls","label":"Ground Balls","type":"number"},{"key":"saves","label":"Saves","type":"number"},{"key":"shots","label":"Shots","type":"number"},{"key":"turnovers","label":"Turnovers","type":"number"}]',
  false,
  '{"cradle":"Cradle","ground_ball":"Ground Ball","clear":"Clear","ride":"Ride","dodge":"Dodge","feed":"Feed","set_pick":"Set Pick","face_off":"Face-Off","transition":"Transition","emd":"EMD"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;

-- STICK SKILLS (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Stationary Cradling Warm-Up',
 'Players stand with feet shoulder-width apart and practice cradling the ball at three speeds: slow (exaggerate mechanics), medium, and game speed. Focus on wrist rotation, top-hand control, and keeping elbows away from the body. 60 seconds each speed.',
 'Stick Skills',
 '{"5-7","8-10","11-13","14-18"}',
 6, 1, 30,
 '{"lacrosse sticks","lacrosse balls"}',
 '{"Top hand does the work — rotate from the wrist, not the elbow","Bottom hand is the guide hand — light grip","Elbows away from your body — protect the pocket","Eyes up while you cradle — look at the field, not the stick"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Wall Ball — Passing Mechanics',
 'Players stand 5-10 feet from a wall (or rebounder) and throw and catch continuously. Work through: dominant hand only, weak hand only, alternating hands. 2 minutes each variation. Best individual skill development drill in lacrosse.',
 'Stick Skills',
 '{"8-10","11-13","14-18"}',
 8, 1, 30,
 '{"lacrosse sticks","lacrosse balls","wall or rebounder"}',
 '{"Step toward the wall with your opposite foot as you throw","Snap your top wrist — follow through at the target","Catch with soft hands — give a little as the ball arrives","Same rhythm: catch → cradle once → throw — no hesitation"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Cone Cradle Course',
 'Set up 6 cones in a zigzag pattern 5 yards apart. Players weave through the course while cradling, using inside and outside cuts. Progress to adding a defender shadowing without checking to simulate game pressure.',
 'Stick Skills',
 '{"8-10","11-13","14-18"}',
 8, 1, 20,
 '{"lacrosse sticks","lacrosse balls","cones"}',
 '{"Protect your stick with your body — keep it on the away side","Change speeds through the cones — slow to explode","Head up at all times — you cannot dodge what you cannot see","Quick feet through the cones — choppy steps win small spaces"}',
 'seeded');

-- PASSING (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Partner Passing — Moving',
 'Partners run parallel 10 yards apart and pass while moving in the same direction. Start slow, build to game speed. After 40 yards, pivot and come back. Focus on leading the receiver and accurate release. Both dominant and weak hand.',
 'Passing',
 '{"8-10","11-13","14-18"}',
 10, 2, 24,
 '{"lacrosse sticks","lacrosse balls"}',
 '{"Lead your receiver — throw where they are going, not where they are","Release on the run — do not stop your feet to throw","Finish your passing motion pointing at the target","Catch in stride — reach for the ball, cradle once, pass"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Triangle Passing Drill',
 'Three players in a triangle 10-15 yards apart pass in sequence, each player pivoting to pass to the next after receiving. Progress to: change direction, add a defender in the middle chasing passes, and one-touch passing.',
 'Passing',
 '{"8-10","11-13","14-18"}',
 10, 3, 18,
 '{"lacrosse sticks","lacrosse balls"}',
 '{"Receive and pivot in one motion — no standing and thinking","Call for the ball: name of your teammate before the pass","Hands ready — stick in receiving position before the ball arrives","Find the open player, not the covered one"}',
 'seeded');

-- SHOOTING (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Shooting from the Crease',
 'Players take turns receiving a feed from behind the net or from 12 meters out and shooting on goal. Focus on catching in stride, protecting the stick from defenders, and shooting low corners. 5 shots per player, rotate sides.',
 'Shooting',
 '{"8-10","11-13","14-18"}',
 12, 2, 16,
 '{"lacrosse sticks","lacrosse balls","goal"}',
 '{"Catch and shoot in one motion — do not catch and stall","Pick a corner: low post near, far post far — commit before the catch","Step into your shot — transfer your weight toward goal","Follow through at the target: hands finish at shoulder height"}',
 'seeded');

-- GROUND BALLS (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 '1v1 Ground Ball Competition',
 'Two players face each other 5 yards from a loose ball. Coach rolls the ball out. Players race to scoop the ground ball and protect possession. The player who scoops must keep the ball for 5 seconds. Track wins per player.',
 'Ground Balls',
 '{"8-10","11-13","14-18"}',
 8, 2, 20,
 '{"lacrosse sticks","lacrosse balls"}',
 '{"Attack the ball with your body low — get your hips down","Bend at the knees, not the waist — scoop through the ball","Use your body as a shield once you have possession","Call the ball: Mine! as you attack it — own your intent"}',
 'seeded');

-- CONDITIONING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 '4-Corner Transition Sprint',
 'Four cones set at the corners of a 20x20 yard box. Players sprint diagonally, then shuffle laterally, then backpedal, then sprint. Simulate the multi-direction movement of lacrosse. Carry a stick and ball through the whole circuit.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 8, 1, 20,
 '{"cones","lacrosse sticks","lacrosse balls"}',
 '{"Sprint means full speed — no jogging this drill","Keep your stick up and cradling even when you are tired","Transitions are game moments — practice them at game speed","Your conditioning is an opponent''s worst nightmare"}',
 'seeded');

-- FUN GAMES (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='lacrosse'),
 'Ultimate Lacrosse',
 'No-contact small-sided game (4v4 or 5v5) on a short field. Score by completing a pass to a teammate standing in the end zone (no running into the end zone with the ball). 3 passes minimum before scoring. Teaches passing, spacing, and movement without the ball.',
 'Fun Games',
 '{"5-7","8-10","11-13","14-18"}',
 12, 4, 20,
 '{"lacrosse sticks","lacrosse balls","cones"}',
 '{"Move after you pass — do not stand and watch","Spread the field — give your teammate space and options","Three passes means find the open player, not the closest one","Score by working together: celebrate the assist as much as the goal"}',
 'seeded');

-- ── Swimming ─────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'swimming',
  'Swimming',
  '🏊',
  '{"Freestyle","Backstroke","Breaststroke","Butterfly","IM","Distance","Sprint","Relay"}',
  '{"Stroke","Turns","Starts","Conditioning","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Stroke Technique","Flip Turns","Race Starts","Kick Sets","Breathing","Relay","Conditioning","Fun Games"}',
  '[{"key":"time","label":"Time (seconds)","type":"number"},{"key":"laps","label":"Laps","type":"number"},{"key":"distance","label":"Distance (m)","type":"number"}]',
  false,
  '{"freestyle":"Freestyle","backstroke":"Backstroke","breaststroke":"Breaststroke","butterfly":"Butterfly","im":"Individual Medley","flip_turn":"Flip Turn","open_turn":"Open Turn","streamline":"Streamline","catch":"Catch","pull":"Pull","dolphin_kick":"Dolphin Kick","breakout":"Breakout"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;

-- STROKE TECHNIQUE (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Catch-Up Freestyle Drill',
 'Swimmers practice freestyle with a "catch-up" modification: the recovering arm waits at full extension until the pulling arm reaches forward to meet it before pulling. Slows down the stroke to emphasize body rotation and full extension. 4 x 25m at moderate effort.',
 'Stroke Technique',
 '{"8-10","11-13","14-18"}',
 10, 1, 20,
 '{"pool","lane ropes"}',
 '{"Full extension before the pull — reach as far as you can","Rotate from your hips — your shoulder leads each stroke","Head stays neutral — one goggle in, one goggle out to breathe","Pull all the way through to your hip — finish each stroke"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Kickboard Kick Sets',
 'Swimmers hold a kickboard and kick the length of the pool using freestyle kick, then backstroke kick. Focus on kick originating from the hip, not the knee. Toes pointed and ankles loose. 6 x 25m alternating strokes. Rest 20 seconds between lengths.',
 'Kick Sets',
 '{"5-7","8-10","11-13","14-18"}',
 12, 1, 20,
 '{"pool","kickboards"}',
 '{"Kick from your hip — your knee barely bends","Point your toes like a ballet dancer — ankles loose","Small quick kicks beat big slow ones — rhythm over power","Look forward slightly on freestyle kick — helps body position"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Pull Buoy Drill',
 'Swimmers use a pull buoy between their thighs to isolate arm stroke technique. No kicking. 4 x 50m focusing on high elbow catch, full extension, and body rotation. Coach watches from the deck and gives feedback between sets.',
 'Stroke Technique',
 '{"8-10","11-13","14-18"}',
 12, 1, 20,
 '{"pool","pull buoys"}',
 '{"High elbow on the catch: fingertips down before the pull begins","Long pull from shoulder to hip — no short-arming it","Rotate 45 degrees each stroke — reach under your body","Exhale underwater — inhale fast and explosively to the side"}',
 'seeded');

-- FLIP TURNS (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Flip Turn Progression',
 'Teach flip turns in stages: (1) somersault in place at the wall, (2) approach from 3 meters and flip without touching wall, (3) full flip turn with feet on wall, (4) streamline push-off. Coach watches for head position and foot placement. 15 reps per swimmer.',
 'Flip Turns',
 '{"8-10","11-13","14-18"}',
 12, 1, 16,
 '{"pool"}',
 '{"Tuck your chin to your chest — that starts the somersault","Feet hit the wall at hip height — not above or below","Explode off the wall: legs straight, toes pointed","Streamline: arms overhead, squeeze your head with your biceps"}',
 'seeded');

-- RACE STARTS (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Block Start Practice',
 'Swimmers practice starting positions (grab start or track start) from the block or pool edge for younger swimmers. Focus on reaction to the start signal, body angle at entry, and streamline position. 5-8 starts per swimmer with recovery time.',
 'Race Starts',
 '{"8-10","11-13","14-18"}',
 15, 1, 16,
 '{"pool","starting blocks or pool edge"}',
 '{"Load your legs: weight forward over your toes before the signal","Entry angle: 30-45 degrees — not too steep, not too flat","Arrow position in the air: body straight from fingers to toes","Hold your streamline until you start to slow — do not rush the first stroke"}',
 'seeded');

-- BREATHING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Bilateral Breathing Drill',
 'Swimmers practice alternating breathing sides every 3 strokes. 8 x 25m with strict bilateral breathing pattern. Builds comfort breathing on both sides, improves stroke symmetry, and helps swimmers track competitors in races.',
 'Breathing',
 '{"8-10","11-13","14-18"}',
 10, 1, 20,
 '{"pool"}',
 '{"Breathe early in the rotation — do not wait until you need it","Ear stays on the water surface — you are not looking at the ceiling","Exhale the whole time underwater — quick big inhale above","Count your strokes: 1-2-breathe, 1-2-breathe — find your rhythm"}',
 'seeded');

-- RELAY (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Relay Exchange Practice',
 'Teams of 4 practice relay exchanges. Next swimmer on the block watches the swimmer approaching, times the take-off so they leave just as the incoming swimmer touches the wall. Goal: legal exchange with maximum momentum transfer. 5 exchanges per team.',
 'Relay',
 '{"8-10","11-13","14-18"}',
 15, 4, 24,
 '{"pool","starting blocks"}',
 '{"Watch your teammate''s stroke count in — anticipate the touch","Leave at the last instant before the touch — tenths of seconds add up","Your start is your contribution to the team — make it count","Cheer your teammate in: noise gives them speed"}',
 'seeded');

-- CONDITIONING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Ladder Set',
 'Swimmers complete a distance pyramid: 25m, 50m, 75m, 100m, 75m, 50m, 25m with 20-30 second rest between intervals. Focus on consistent pace and maintaining stroke technique as fatigue builds. Coaches track times and call out encouragement.',
 'Conditioning',
 '{"11-13","14-18"}',
 20, 1, 20,
 '{"pool","stopwatch"}',
 '{"Pace yourself: the 100 in the middle is the hardest — conserve early","Technique does not break down because you are tired — focus more","Long strokes when fatigued — resist the urge to go short and choppy","The last 25 is a gift: everything you have left, leave it in the pool"}',
 'seeded');

-- FUN GAMES (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='swimming'),
 'Underwater Challenge',
 'Teams compete in underwater distance challenges: who can go the farthest off the wall in streamline, who can do the most underwater dolphin kicks in one breath, underwater relay race. Builds lung capacity and streamline technique while keeping practice fun.',
 'Fun Games',
 '{"8-10","11-13","14-18"}',
 10, 2, 20,
 '{"pool"}',
 '{"Big breath in, slow breath out — do not panic underwater","Tight streamline: arms squeezed around your head, hands stacked","Dolphin kick from your core — hips drive the wave","Underwater speed is a superpower — practice it every day"}',
 'seeded');

-- ── Tennis ─────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'tennis',
  'Tennis',
  '🎾',
  '{"Singles","Doubles Ad Court","Doubles Deuce Court","Flex"}',
  '{"Groundstrokes","Serve","Net Play","Movement","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Serving","Groundstrokes","Volleys","Footwork","Rally Drills","Match Play","Conditioning","Fun Games"}',
  '[{"key":"aces","label":"Aces","type":"number"},{"key":"double_faults","label":"Double Faults","type":"number"},{"key":"winners","label":"Winners","type":"number"},{"key":"unforced_errors","label":"Unforced Errors","type":"number"}]',
  false,
  '{"forehand":"Forehand","backhand":"Backhand","volley":"Volley","serve":"Serve","overhead":"Overhead","lob":"Lob","drop_shot":"Drop Shot","approach":"Approach Shot","rally":"Rally","baseline":"Baseline","net":"Net Position","deuce":"Deuce","ad":"Advantage"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;

-- SERVING (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Trophy Position Serve Drill',
 'Players work through the serve in stages: (1) trophy position only — arms up, weight loaded, knee bent; (2) add the toss — consistent toss to the same spot above the hitting shoulder; (3) full serve motion at 50% speed. 10 reps each stage.',
 'Serving',
 '{"8-10","11-13","14-18"}',
 10, 1, 20,
 '{"tennis rackets","tennis balls","net"}',
 '{"Trophy position: both arms up at the same time — like a Y shape","Toss to 1 o''clock above your leading shoulder — not too far forward","Scratch your back with your racket before exploding upward","Pronate: roll your wrist over at contact — that creates spin and control"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Target Serving',
 'Place cones or ball cans in the service boxes as targets. Players attempt to hit each target with their serve. Track makes out of 10 serves per target. Progress: wide serve, T serve, body serve. Builds tactical serving from early in development.',
 'Serving',
 '{"11-13","14-18"}',
 12, 1, 12,
 '{"tennis rackets","tennis balls","net","cones"}',
 '{"See the target before you set up — do not just aim generally","Same routine every serve: bounce the ball, deep breath, toss","Your first serve should be aggressive — second serve consistent","Serve placement beats serve speed at every level of youth tennis"}',
 'seeded');

-- GROUNDSTROKES (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Cross-Court Forehand Rally',
 'Partners rally cross-court forehand to forehand from the baseline. Goal is to sustain the rally as long as possible, keeping the ball deep in the court (past the service line). Coach tracks longest rally per pair and gives feedback between sets.',
 'Groundstrokes',
 '{"8-10","11-13","14-18"}',
 10, 2, 20,
 '{"tennis rackets","tennis balls","net"}',
 '{"Split step as your partner contacts the ball — be ready","Unit turn: shoulders and racket go back together as the ball comes","Swing low-to-high to create topspin — brush up the back of the ball","Aim two feet over the net — height gives you margin"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Backhand Groundstroke Feed',
 'Coach feeds balls from a basket to the player''s backhand side. Player hits 15 backhands cross-court, then 15 down the line. Both one-handed and two-handed techniques are valid. Focus on consistent contact point and follow-through.',
 'Groundstrokes',
 '{"8-10","11-13","14-18"}',
 12, 1, 12,
 '{"tennis rackets","tennis balls","net","ball basket"}',
 '{"Contact point in front of your body — not beside or behind","Two-hander: lead with the non-dominant arm on follow-through","One-hander: stay sideways longer, extend through the ball","Finish your swing high — racket ends above your shoulder"}',
 'seeded');

-- VOLLEYS (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Punch Volley Drill',
 'Players stand at the net while coach feeds balls at different heights. Player practices forehand and backhand volleys with a short punching motion. Focus on no backswing — just block and redirect. 15 volleys each side, alternate.',
 'Volleys',
 '{"8-10","11-13","14-18"}',
 10, 1, 16,
 '{"tennis rackets","tennis balls","net"}',
 '{"No backswing — catch the ball and push it forward","Hold your racket firmly — do not let the ball push your racket back","Step forward into the volley — close the net after each one","Watch the ball hit your strings — do not look at your target early"}',
 'seeded');

-- FOOTWORK (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Spider Drill',
 'Place 5 balls at corners of the service box, center baseline, and both sides of the net. From the center mark, player sprints to each ball, touches it or picks it up, then returns to center after each. Timed. Simulates the multi-directional movement of a tennis point.',
 'Footwork',
 '{"8-10","11-13","14-18"}',
 8, 1, 20,
 '{"tennis balls","cones"}',
 '{"Split step before every direction change — never flat-footed","Short choppy steps as you close in on the ball","Crossover step is faster than shuffling on long distances","Push off explosively from center — that is your engine"}',
 'seeded');

-- CONDITIONING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Side-to-Side Baseline Sprints',
 'Player starts at center baseline and sprints to a cone at the singles sideline, touches it, sprints back past center to the other sideline, touches that cone, and returns to center. 10 reps, rest 30 seconds, repeat 3 sets. Simulates wide ball recovery.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 8, 1, 20,
 '{"cones"}',
 '{"Low recovery position: bend knees to get back to center","First step is your fastest — it wins the point","Use small recovery steps to brake near the cone","Breathing: inhale on recovery jog, exhale on the sprint"}',
 'seeded');

-- FUN GAMES (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='tennis'),
 'Mini-Tennis King of the Court',
 'Players compete in half-court mini-tennis (service boxes only). Scoring is regular: first to 7 points wins. Winner stays, next player enters. First player to beat 3 consecutive opponents wins the round. Lower net tension (use a string across the posts) reduces errors for beginners.',
 'Fun Games',
 '{"5-7","8-10","11-13","14-18"}',
 12, 2, 16,
 '{"tennis rackets","tennis balls","net or string"}',
 '{"Consistency beats power in mini-tennis — keep it in","Play to the open space, not right at your opponent","After every point: reset stance, bounce on your toes","Losing is just practice for winning — stay competitive and have fun"}',
 'seeded');

-- ── Gymnastics ─────────────────────────────────────────────────────────────────

insert into sports (
  slug, name, icon,
  default_positions, default_categories, default_age_groups,
  drill_categories, stat_fields,
  curriculum_enabled, terminology,
  plan_templates, default_curriculum_config
) values (
  'gymnastics',
  'Gymnastics',
  '🤸',
  '{"Floor","Vault","Uneven Bars","Balance Beam","All-Around","Trampoline","Acro","Flex"}',
  '{"Tumbling","Apparatus","Strength","Flexibility","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Tumbling","Balance","Bar Work","Flexibility","Body Form","Conditioning","Artistry","Fun Games"}',
  '[{"key":"score","label":"Score","type":"number"},{"key":"deductions","label":"Deductions","type":"number"}]',
  false,
  '{"handstand":"Handstand","cartwheel":"Cartwheel","round_off":"Round-Off","back_handspring":"Back Handspring","back_walkover":"Back Walkover","front_walkover":"Front Walkover","kip":"Kip","cast":"Cast","dismount":"Dismount","layout":"Layout","tuck":"Tuck","pike":"Pike","arabesque":"Arabesque","relevé":"Relevé"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;

-- TUMBLING (3 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Forward Roll Progressions',
 'Build forward rolls from simplest to complex: (1) tuck roll from hands and knees, (2) tuck roll from standing, (3) straddle roll, (4) pike roll. Each athlete does 3 repetitions of each level before progressing. Coach spots and provides feedback.',
 'Tumbling',
 '{"5-7","8-10","11-13"}',
 10, 1, 15,
 '{"gymnastics mats"}',
 '{"Chin tucked — always look at your belly button","Round your back like a ball — no flat back rolling","Push off with your legs to control the roll","Land seated, then stand — do not rush out of the roll"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Handstand Kick-Up Practice',
 'Athletes kick up to a handstand against the wall and hold for 3-5 seconds. Focus on tight body position, stacked shoulders over wrists, and pointed toes. Progress from wall support to free-standing kick-up attempts with a coach spot.',
 'Tumbling',
 '{"5-7","8-10","11-13","14-18"}',
 12, 1, 20,
 '{"gymnastics mats","wall"}',
 '{"Lunge forward with confidence — commit to the kick","Wrists under shoulders under hips — everything stacked","Squeeze your glutes and abs — body is one straight line","Pointed toes finish the shape — sloppy feet lose points"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Cartwheel to Round-Off',
 'Athletes practice the cartwheel mechanics then transition to the round-off: the key difference is turning the second hand to land facing the direction you came from. Coach marks the floor with tape for hand placement. 5 reps each athlete.',
 'Tumbling',
 '{"8-10","11-13","14-18"}',
 10, 1, 15,
 '{"gymnastics mats","floor tape"}',
 '{"Arms overhead before the lunge — do not reach to the floor","Hips square over your hands at the peak — not sideways","On the round-off: bring your feet together as they land","Snap down through the floor — that energy powers the next skill"}',
 'seeded');

-- BALANCE (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Balance Beam Walk and Poses',
 'Athletes walk across a low practice beam (or floor beam) performing: walking forward, walking backward, arabesque holds, scale holds, and relevé walks. Coach spots and watches for tight core, focused eyes, and controlled movements.',
 'Balance',
 '{"5-7","8-10","11-13"}',
 10, 1, 12,
 '{"low balance beam or floor beam","gymnastics mats"}',
 '{"Eyes fixed on a point straight ahead — not looking at the beam","Tight core: squeeze your stomach like you expect a punch","Soft bent knees — not locked — for balance absorption","Slow and controlled beats fast and falling every time"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Single-Leg Balance Series',
 'Athletes stand on one leg and hold a series of positions for 5 seconds each: parallel, arabesque, passé (foot to knee), attitude (bent arabesque). Switch legs. Progress to eyes closed, then on a folded mat to increase surface instability.',
 'Balance',
 '{"5-7","8-10","11-13","14-18"}',
 8, 1, 20,
 '{"gymnastics mats"}',
 '{"Squeeze your standing leg muscles — create a strong base","Micro-adjustments with your ankle — do not fight every wobble","Breathe — holding your breath tightens everything up","Focus point: pick a spot and stare at it — that anchors your balance"}',
 'seeded');

-- FLEXIBILITY (2 drills)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Split Flexibility Progression',
 'Structured split stretching with coach supervision: lunge stretch (60s each leg), half split (45s each), straddle stretch with forward fold (45s), and full split attempt with blocks or folded mats for support. Never force — breathe through each hold.',
 'Flexibility',
 '{"5-7","8-10","11-13","14-18"}',
 12, 1, 20,
 '{"gymnastics mats","yoga blocks or folded mats"}',
 '{"Flexibility comes from consistency, not from forcing","Breathe out as you go deeper — exhaling releases muscles","Keep your hips square — do not rotate for a fake split","Celebrate every millimeter of progress — it adds up over weeks"}',
 'seeded');

-- BODY FORM (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Body Shapes Station Work',
 'Athletes rotate through four body shape stations: (1) hollow body hold on floor — 20 seconds; (2) arch hold face-down — 20 seconds; (3) tuck shape — squeeze knees to chest for 10 seconds; (4) straddle shape — seated with wide legs, hands pressing into the floor. Focus on tight consistent shapes.',
 'Body Form',
 '{"5-7","8-10","11-13","14-18"}',
 10, 1, 20,
 '{"gymnastics mats"}',
 '{"Hollow: press your lower back to the floor — no gap","Arch: squeeze your glutes and look forward, not down","Tuck: chin to chest, heels to bottom — round as a ball","All shapes work in every skill — your coach can see them from across the gym"}',
 'seeded');

-- CONDITIONING (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Gymnastics Conditioning Circuit',
 'Four stations, 45 seconds each: (1) hollow-body rocks; (2) push-ups with pointed toes; (3) calf raises on a mat edge in relevé; (4) candlestick to pike-up. Two full rotations. Builds the core, shoulder, and calf strength used in all gymnastics events.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 12, 1, 20,
 '{"gymnastics mats"}',
 '{"Tight body position even when you are tired — bad habits stick","Quality reps beat quantity reps — 5 perfect is better than 20 sloppy","Breathing: exhale on the hard part, inhale on the recovery","This conditioning is what lets you do the fun skills — earn it"}',
 'seeded');

-- FUN GAMES (1 drill)
insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='gymnastics'),
 'Gymnastics Simon Says',
 'Coach calls gymnastics body shapes and positions: "Simon says — tuck!", "Simon says — relevé!", "Simon says — arabesque!", without Simon Says is a trap. Players must hold each correct position for 2 seconds. Eliminated players become spotters. Teaches quick body awareness in a fun competitive format.',
 'Fun Games',
 '{"5-7","8-10","11-13"}',
 8, 3, 20,
 '{"gymnastics mats"}',
 '{"React fast AND correctly — both matter","Hold your shape still — freeze like a statue","Spotters: look for tight toes and good body form","The gymnast who knows their shapes best wins this game"}',
 'seeded');
