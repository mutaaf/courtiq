-- Basketball Drill Seeds (50 drills)
-- Covers all categories: Ball Handling, Passing, Shooting, Layups, Rebounding, Defense, Fast Break, Screening, Conditioning, Team Play, Fun Games

-- ============================================================
-- BALL HANDLING (7 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Zig-Zag Dribble',
 'Players dribble in a zig-zag pattern down the court, changing direction with a crossover at each cone. Focus on staying low, protecting the ball, and pushing off the outside foot.',
 'Ball Handling',
 '{"8-10","11-13","14-18"}',
 8, 1, 30,
 '{"basketballs","cones"}',
 '{"Stay low with bent knees","Push off the outside foot","Eyes up, not on the ball","Explode out of the crossover"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Stationary Ball Handling Series',
 'Players stand in place and perform a series of dribbling moves: right hand, left hand, crossover, between the legs, behind the back. 30 seconds each. Great warm-up drill.',
 'Ball Handling',
 '{"5-7","8-10","11-13","14-18"}',
 5, 1, 30,
 '{"basketballs"}',
 '{"Fingertip control, not palms","Keep the ball below your waist","Eyes up - look at the coach","Pound it hard into the floor"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Dribble Tag',
 'All players dribble inside the 3-point arc. Two taggers try to knock away other players'' balls while maintaining their own dribble. If your ball gets knocked away, do 5 ball slaps and return. Great for dribbling under pressure.',
 'Ball Handling',
 '{"5-7","8-10","11-13"}',
 6, 6, 20,
 '{"basketballs"}',
 '{"Protect the ball with your body","Keep your head up to see taggers","Use your off hand to shield","Change speeds to escape"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Full-Court Dribble Moves',
 'Players dribble full court performing a specific move at each cone: crossover at the first, between the legs at the second, behind the back at the third, spin at the fourth. Jog back and repeat with next move combo.',
 'Ball Handling',
 '{"11-13","14-18"}',
 8, 1, 15,
 '{"basketballs","cones"}',
 '{"Sell the move with your body","Change speed after each move","Keep the ball tight on spins","Attack with purpose after the move"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Cone Dribbling Course',
 'Set up 6-8 cones in various patterns. Players navigate the course using designated dribble moves at each cone. Time each player and challenge them to beat their personal best.',
 'Ball Handling',
 '{"8-10","11-13","14-18"}',
 10, 1, 15,
 '{"basketballs","cones"}',
 '{"Stay under control - speed comes later","Low and tight dribble around cones","Use both hands equally","Head up through the course"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Two-Ball Dribbling',
 'Players dribble two balls simultaneously. Start stationary (both together, then alternating), then walk, then jog. Advanced: crossovers and between the legs with two balls.',
 'Ball Handling',
 '{"11-13","14-18"}',
 6, 1, 15,
 '{"basketballs"}',
 '{"Start slow and controlled","Pound both balls at the same height","Stay in an athletic stance","Focus on the weaker hand"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Red Light Green Light Dribble',
 'Coach calls out commands while players dribble: Green Light = go, Red Light = stop and protect, Yellow Light = slow dribble. Players who lose their ball or move on red light go to the side for ball slaps.',
 'Ball Handling',
 '{"5-7","8-10"}',
 5, 4, 30,
 '{"basketballs"}',
 '{"Stop in triple threat on red light","Keep the ball alive when stopped","Quick burst on green light","Control the ball at all speeds"}',
 'seeded');

-- ============================================================
-- PASSING (5 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Partner Passing',
 'Partners face each other about 10 feet apart. Practice chest pass, bounce pass, and overhead pass. 10 reps of each type. Increase distance as players improve. Emphasize stepping into the pass.',
 'Passing',
 '{"5-7","8-10","11-13"}',
 6, 2, 30,
 '{"basketballs"}',
 '{"Step toward your target","Thumbs down on chest pass follow-through","Bounce pass hits 2/3 of the way","Snap the ball, don''t float it"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Star Passing',
 'Five players form a star pattern. Pass to the person two spots away (skip pass). After passing, follow your pass and take that spot. Rotate direction halfway through. Teaches passing accuracy and movement.',
 'Passing',
 '{"8-10","11-13","14-18"}',
 8, 5, 15,
 '{"basketballs"}',
 '{"Call the name of who you''re passing to","Lead the receiver","Move immediately after passing","Catch with two hands, pass with purpose"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Monkey in the Middle',
 'Three players: two on the outside, one defender in the middle. Outside players must make passes without the defender intercepting. Use fakes, pivots, and different pass types. Rotate after a steal or 30 seconds.',
 'Passing',
 '{"5-7","8-10","11-13"}',
 6, 3, 15,
 '{"basketballs"}',
 '{"Use pass fakes to move the defender","Don''t telegraph your passes","Pivot to create passing angles","Bounce pass is harder to intercept"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Outlet Pass Drill',
 'Rebounder grabs the ball off the backboard, pivots to the outside, and throws a crisp outlet pass to a guard on the wing. Guard catches and pushes the ball up the sideline. Rotate positions.',
 'Passing',
 '{"11-13","14-18"}',
 6, 3, 12,
 '{"basketballs"}',
 '{"Chin the ball after the rebound","Pivot away from traffic","Throw a baseball pass to the outlet","Hit the receiver in stride"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Circle Passing',
 'Players form a circle. One or two balls move around the circle with chest passes. On the whistle, reverse direction. Add a second ball for difficulty. Focus on quick hands and accurate passes.',
 'Passing',
 '{"5-7","8-10"}',
 5, 6, 20,
 '{"basketballs"}',
 '{"Ready hands - show a target","Quick catch and release","Step toward the next person","Call for the ball"}',
 'seeded');

-- ============================================================
-- SHOOTING (6 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Form Shooting',
 'Players stand 3-5 feet from the basket. Focus purely on shooting form: elbow in, follow through, hold the follow through (cookie jar). One hand only first, then add guide hand. 20 makes each spot.',
 'Shooting',
 '{"5-7","8-10","11-13","14-18"}',
 8, 1, 15,
 '{"basketballs"}',
 '{"Elbow under the ball, not out","Follow through - reach into the cookie jar","Ball on fingertips, not palm","Bend your knees for power"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Spot Shooting',
 'Five spots around the key. Players shoot from each spot, get their rebound, pass to the next shooter. Must make 3 from each spot before moving to the next. Track makes and misses.',
 'Shooting',
 '{"8-10","11-13","14-18"}',
 10, 2, 15,
 '{"basketballs"}',
 '{"Same form every time","Square up to the basket","Follow through and hold it","Get your feet set before shooting"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Catch and Shoot',
 'Partner feeds the ball to the shooter at various spots. Shooter catches, squares up, and shoots in one smooth motion. Emphasize footwork: 1-2 step or hop into the shot. 10 shots from each wing and top.',
 'Shooting',
 '{"11-13","14-18"}',
 10, 2, 12,
 '{"basketballs"}',
 '{"Hands ready before the catch","Feet squared on the catch","Shoot on the way up, not falling","Land in the same spot you jumped"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Free Throw Challenge',
 'Each player shoots 10 free throws. Track the results. Players must follow a consistent pre-shot routine: dribble a set number of times, deep breath, bend knees, shoot. Team goal: 70% combined.',
 'Shooting',
 '{"8-10","11-13","14-18"}',
 8, 2, 15,
 '{"basketballs"}',
 '{"Same routine every single time","Deep breath to relax","Bend your knees - legs create power","Focus on the front of the rim"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Around the World',
 'Players shoot from 5-7 spots in an arc around the basket. Make it and advance; miss and either stay or go back to the start (house rules). First player to complete the arc wins.',
 'Shooting',
 '{"8-10","11-13","14-18"}',
 10, 2, 10,
 '{"basketballs"}',
 '{"Good form even when competing","Balance before you shoot","Follow through every time","Be confident - see it go in"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Elbow Shooting',
 'Players line up at both elbows (free throw line extended). Shoot, get your own rebound, pass to the next person in line. Alternate sides. Focus on mid-range pull-up form. Make 5 from each elbow.',
 'Shooting',
 '{"11-13","14-18"}',
 8, 2, 12,
 '{"basketballs"}',
 '{"Stop on a dime, no drifting","Rise up, don''t fade away","Follow your shot for offensive rebounds","Consistent release point"}',
 'seeded');

-- ============================================================
-- LAYUPS (5 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Layup Lines',
 'Classic two-line layup drill. Right side shoots layups, left side rebounds. After shooting, go to rebound line; after rebounding, go to shooting line. Switch to left side halfway through.',
 'Layups',
 '{"5-7","8-10","11-13","14-18"}',
 6, 4, 30,
 '{"basketballs"}',
 '{"Right side: right hand, left foot takeoff","Left side: left hand, right foot takeoff","Kiss it off the top corner of the square","Approach at a 45-degree angle"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Mikan Drill',
 'Standing under the basket, players alternate right-hand and left-hand layups without letting the ball touch the ground. Continuous motion: catch, step, lay it in, catch, step other side. Goal: 10 in a row.',
 'Layups',
 '{"8-10","11-13","14-18"}',
 5, 1, 15,
 '{"basketballs"}',
 '{"Soft touch off the glass","Keep the ball high - don''t bring it down","Quick feet, alternate sides","Use the backboard every time"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Euro Step Layup',
 'Players drive from the wing, take one step one direction, then a long step the other direction to finish at the rim. Start without a defender, then add a cone, then a live defender.',
 'Layups',
 '{"11-13","14-18"}',
 8, 1, 15,
 '{"basketballs","cones"}',
 '{"First step sells the fake","Second step is long and toward the rim","Protect the ball on the second step","Finish with the hand away from the defender"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Power Layup Drill',
 'Players receive a pass at the block, take one power dribble, jump off two feet, and finish strong at the rim. Emphasize going up strong through contact. Add a pad holder for contact simulation.',
 'Layups',
 '{"8-10","11-13","14-18"}',
 6, 2, 15,
 '{"basketballs"}',
 '{"Two-foot jump for power","Chin the ball - protect it","Go UP not out","Finish through contact"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Layup Gauntlet',
 'Players dribble full court and must make layups at both baskets. If you miss, you go to the back of the line and start over. First player to make layups at both ends wins. Use alternating hands.',
 'Layups',
 '{"8-10","11-13","14-18"}',
 8, 4, 20,
 '{"basketballs"}',
 '{"Full speed but under control","Slow down for the finish","Use the correct hand on each side","Eyes on the target, not the defender"}',
 'seeded');

-- ============================================================
-- REBOUNDING (4 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Box Out Battle',
 'Partners pair up. Coach shoots, one player boxes out while the other tries to get the rebound. Offensive player gets a point for each rebound; defensive player gets a point for each box out. Switch roles after 5 shots.',
 'Rebounding',
 '{"8-10","11-13","14-18"}',
 8, 4, 20,
 '{"basketballs"}',
 '{"Make contact first, then find the ball","Wide base, low center of gravity","Hit and stick - maintain contact","Pursue the ball after the box out"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Superman Rebounding',
 'Player stands under the basket. Coach throws the ball off the backboard. Player jumps, grabs the ball at the highest point, chins it, pivots, and outlets to a guard. Emphasize going up strong and grabbing with two hands.',
 'Rebounding',
 '{"8-10","11-13","14-18"}',
 5, 2, 10,
 '{"basketballs"}',
 '{"Jump and grab at the highest point","Chin the ball immediately","Rip through if needed to protect","Quick pivot and outlet"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Three-Player Rebounding',
 'Three offensive players vs three defensive players around the lane. Coach shoots, defense must box out and secure the rebound. If offense gets it, they try to score. Rotate groups after 5 possessions.',
 'Rebounding',
 '{"11-13","14-18"}',
 8, 6, 18,
 '{"basketballs"}',
 '{"Find your player before the shot goes up","Reverse pivot into the box out","Go get the ball after boxing out","Communicate - call out your assignment"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Tip Drill',
 'Player tips the ball off the backboard to themselves repeatedly. Must keep the ball alive without catching it - just tip it. Build up to 5, then 10 consecutive tips. Develops timing and hand-eye coordination.',
 'Rebounding',
 '{"11-13","14-18"}',
 5, 1, 10,
 '{"basketballs"}',
 '{"Fully extend your arms","Time your jump","Fingertip control","Stay balanced and keep jumping"}',
 'seeded');

-- ============================================================
-- DEFENSE (5 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Defensive Slide Drill',
 'Players start on the baseline in defensive stance. On the whistle, slide to the free throw line, then back, then to half court and back. Keep low, don''t cross feet, hands active. Race format for motivation.',
 'Defense',
 '{"5-7","8-10","11-13","14-18"}',
 5, 1, 30,
 '{}',
 '{"Stay low - butt down, chest up","Never cross your feet","Push off the trailing foot","Active hands - trace the ball"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Shell Drill',
 'Four offensive players around the perimeter, four defenders. Ball moves around the horn. Defenders must jump to the ball on every pass, maintain proper positioning (on-ball, deny, help). Coach corrects positioning in real time.',
 'Defense',
 '{"8-10","11-13","14-18"}',
 10, 8, 16,
 '{"basketballs"}',
 '{"Jump to the ball on every pass","On ball: mirror the dribbler","One pass away: deny position","Two passes away: help position, see ball and man"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Closeout Drill',
 'Defender starts at the rim. Coach passes to a shooter on the perimeter. Defender sprints out, breaks down with choppy steps, and contests the shot without fouling. Shooter can drive or shoot to keep defense honest.',
 'Defense',
 '{"8-10","11-13","14-18"}',
 8, 3, 12,
 '{"basketballs"}',
 '{"Sprint 3/4, chop steps the last 1/4","High hand to contest the shot","Don''t fly by - stay balanced","Force the driver to the baseline"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 '1-on-1 Contained',
 'Offensive player starts at the three-point line. Defender must stay between the ball and the basket. Play to one shot attempt. Offense gets a point for scoring, defense gets a point for a stop. First to 5.',
 'Defense',
 '{"8-10","11-13","14-18"}',
 8, 2, 12,
 '{"basketballs"}',
 '{"Stay between your player and the basket","Nose on the ball - stay centered","Move your feet, don''t reach","Force them to their weak hand"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Denial Drill',
 'Defender practices deny position on a player one pass away. Offensive player tries to get open with V-cuts and back-cuts. Passer on top tries to deliver the ball. Defender must maintain arm in the passing lane.',
 'Defense',
 '{"11-13","14-18"}',
 6, 3, 12,
 '{"basketballs"}',
 '{"Arm in the passing lane","See ball and man at all times","React to the back-cut - open up","Stay in a low athletic stance"}',
 'seeded');

-- ============================================================
-- FAST BREAK (4 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 '3-Man Weave',
 'Three players run the length of the court passing and weaving behind each other. The player who passes goes behind the receiver. Finish with a layup at the other end. No dribbling allowed. Focus on timing and crisp passes.',
 'Fast Break',
 '{"8-10","11-13","14-18"}',
 8, 3, 30,
 '{"basketballs"}',
 '{"Sprint wide to the sideline after passing","Chest pass on the run - lead your target","Go behind the person you pass to","Finish strong at the rim"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 '2-on-1 Fast Break',
 'Two offensive players vs one defender in transition. Offense pushes the ball up the court and reads the defender. If defender commits to the ball, pass to the open player. If defender sags, pull up for the shot.',
 'Fast Break',
 '{"8-10","11-13","14-18"}',
 8, 3, 15,
 '{"basketballs"}',
 '{"Ball handler attacks the defender''s hip","Wide spacing - fill the lanes","Read the defender, don''t predetermine","Finish quickly before help arrives"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 '3-on-2 / 2-on-1 Continuous',
 'Three offensive players attack two defenders. After the possession, the two defenders become offense going back the other way against one of the original offensive players. Continuous rotation keeps intensity high.',
 'Fast Break',
 '{"11-13","14-18"}',
 10, 7, 15,
 '{"basketballs"}',
 '{"Offense: fill all three lanes","Top defender takes the ball","Bottom defender takes first pass","Transition quickly from offense to defense"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Rebound and Outlet',
 'Coach shoots, designated player rebounds, pivots, and outlets to a guard on the wing. Guard pushes the ball to half court, hits the trailer or finishes. Emphasize speed of the outlet and filling lanes.',
 'Fast Break',
 '{"8-10","11-13","14-18"}',
 6, 4, 12,
 '{"basketballs"}',
 '{"Rebounder: chin and pivot quickly","Outlet to the sideline, not the middle","Wings: sprint wide, don''t wait","Push in 3 dribbles or less"}',
 'seeded');

-- ============================================================
-- SCREENING (3 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Screen Setting Fundamentals',
 'Players practice setting screens on a cone or coach. Focus on mechanics: feet wide, hands crossed on chest, hold still until contact is made. Then add a ball handler who uses the screen.',
 'Screening',
 '{"8-10","11-13","14-18"}',
 6, 2, 15,
 '{"basketballs","cones"}',
 '{"Feet shoulder-width apart","Arms crossed on your chest","Sprint to the screen spot, then be still","Screen the defender, not the air"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Pick and Roll / Pick and Pop',
 'Screener sets a ball screen. Ball handler uses the screen and reads the defense. Screener either rolls to the basket (pick and roll) or pops out for a jumper (pick and pop). 2-on-0 first, then add defenders.',
 'Screening',
 '{"11-13","14-18"}',
 10, 2, 12,
 '{"basketballs"}',
 '{"Ball handler: set up the screen by going away first","Screener: roll hard with hands ready","Read the defense together","Ball handler makes the decision based on the screener''s defender"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Down Screen and Flare',
 'Post player sets a down screen for a guard. Guard reads the defender: if defender goes under, curl to the basket; if defender goes over, fade to the corner. Start 2-on-0, progress to 2-on-2.',
 'Screening',
 '{"11-13","14-18"}',
 8, 2, 12,
 '{"basketballs"}',
 '{"Set up the cut by going low first","Use the screener''s body - run shoulder to shoulder","Read your defender to decide curl or fade","Screener: open up to the ball after screening"}',
 'seeded');

-- ============================================================
-- CONDITIONING (4 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Suicide Sprints (Lines)',
 'Players sprint to the free throw line and back, half court and back, far free throw line and back, full court and back. Touch each line. Rest 30 seconds between sets. 3-4 sets total.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 6, 1, 30,
 '{}',
 '{"Touch every line with your hand","Explode out of each turn","Stay low on the turn - don''t stand up","Compete against yourself"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Full-Court Transition Sprints',
 'Players line up on baseline. Sprint to half court and back on the whistle. 10 seconds rest. Sprint full court on the next whistle. 10 seconds rest. Repeat for 3 minutes. Simulates game transition.',
 'Conditioning',
 '{"11-13","14-18"}',
 5, 1, 30,
 '{}',
 '{"Game speed every rep","Stay on your toes","Swing your arms","Mental toughness - push through the burn"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Defensive Slide Circuit',
 'Combine defensive slides with sprints: slide baseline to corner, sprint to half court, slide across half, sprint to far corner, slide across baseline. 2 laps = 1 set. Great basketball-specific conditioning.',
 'Conditioning',
 '{"8-10","11-13","14-18"}',
 5, 1, 30,
 '{}',
 '{"Stay low during slides","Quick feet, don''t cross over","Sprint at max effort","Transition smoothly between slides and sprints"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Dribble Relay Races',
 'Teams line up on the baseline. First player dribbles to half court and back, hands off to the next player. All players must use their weak hand on the way back. Dropped ball = start that leg over. First team done wins.',
 'Conditioning',
 '{"5-7","8-10","11-13"}',
 6, 6, 30,
 '{"basketballs"}',
 '{"Control the ball at full speed","Clean handoffs","Use your weak hand on the return","Encourage your teammates"}',
 'seeded');

-- ============================================================
-- TEAM PLAY (4 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 '5-on-0 Motion Offense',
 'Five players run the motion offense without defenders. Focus on spacing, cutting, screening, and ball movement. Coach walks through reads and rotations. Every player touches the ball before a shot.',
 'Team Play',
 '{"11-13","14-18"}',
 10, 5, 15,
 '{"basketballs"}',
 '{"Maintain spacing - 12-15 feet apart","Cut with purpose","Screen away from the ball","Pass and move - never stand still"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 '3-on-3 Half Court',
 'Three offensive players vs three defenders, half court. Offense must make at least 2 passes before shooting. Defense communicates and switches or helps on screens. Play to 5 points, losers run.',
 'Team Play',
 '{"8-10","11-13","14-18"}',
 10, 6, 18,
 '{"basketballs","pinnies"}',
 '{"Move without the ball","Talk on defense","Set screens for teammates","Share the ball - the open shot is the best shot"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Give and Go',
 'Two players practice the give and go: pass to your teammate, make a hard cut to the basket, receive the return pass, finish with a layup. Start at the wing and top of key. Add a defender once the timing is right.',
 'Team Play',
 '{"8-10","11-13","14-18"}',
 6, 2, 12,
 '{"basketballs"}',
 '{"Make a hard pass then explode to the basket","Cut in a straight line - no rounding","Receiver: hit the cutter in stride","Change pace to lose your defender"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Pass-Pass-Shoot',
 'Three players. Player 1 passes to Player 2, gets it back, passes to Player 3, gets it back, and shoots. Emphasizes ball movement and catch-and-shoot. Rotate positions after each sequence.',
 'Team Play',
 '{"5-7","8-10","11-13"}',
 6, 3, 15,
 '{"basketballs"}',
 '{"Quick ball movement - don''t hold it","Ready to catch with hands up","Move to an open spot after passing","Catch and shoot in rhythm"}',
 'seeded');

-- ============================================================
-- FUN GAMES (3 drills)
-- ============================================================

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Knockout',
 'Players line up at the free throw line. First two players have balls. First player shoots. If the second player makes it before the first, the first player is out. After shooting, rebound and score before the person behind you. Last player standing wins.',
 'Fun Games',
 '{"5-7","8-10","11-13","14-18"}',
 10, 4, 20,
 '{"basketballs"}',
 '{"Make your free throw to stay safe","Quick follow-up shot if you miss","Put the pressure on the person ahead","Have fun but compete hard"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Lightning',
 'Similar to Knockout but with a twist: players shoot from the free throw line, and if you miss, you must get the rebound and score from wherever you get it. If the person behind you scores first, you''re struck by lightning and you''re out.',
 'Fun Games',
 '{"5-7","8-10","11-13","14-18"}',
 10, 4, 20,
 '{"basketballs"}',
 '{"Focus on the free throw - make it first try","Scramble for the rebound if you miss","Putbacks from anywhere count","Cheer for your friends"}',
 'seeded');

insert into drills (sport_id, name, description, category, age_groups, duration_minutes, player_count_min, player_count_max, equipment, teaching_cues, source) values
((select id from sports where slug='basketball'),
 'Sharks and Minnows',
 'One or two sharks stand at half court without a ball. All other players (minnows) must dribble from one baseline to the other without getting their ball knocked away. If your ball is knocked away, you become a shark. Last minnow wins.',
 'Fun Games',
 '{"5-7","8-10","11-13"}',
 8, 6, 30,
 '{"basketballs"}',
 '{"Protect your ball with your body","Keep your head up to see the sharks","Change speed and direction to escape","Use moves you practiced today"}',
 'seeded');
