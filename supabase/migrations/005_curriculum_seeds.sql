-- Default Basketball Curriculum
insert into curricula (sport_id, name, description, is_default, config) values (
  (select id from sports where slug='basketball'),
  'YMCA Youth Basketball',
  'Standard youth basketball development curriculum with age-appropriate skill progression',
  true,
  '{"program_id":"ymca_youth_basketball","version":"1.0"}'
);

-- Curriculum Skills
-- Mini Ballers (5-7)
insert into curriculum_skills (curriculum_id, skill_id, name, category, age_groups, intro_week, teaching_script, progression_levels, sort_order) values
((select id from curricula where name='YMCA Youth Basketball'), 'stationary_dribble', 'Stationary Dribble', 'ball_handling', '{"5-7","8-10"}', 1,
 'Keep your eyes up! Push the ball down with your fingertips, not your palm. The ball is your friend - keep it close!',
 '{"exploring":{"min_success_rate":0.25,"description":"Learning to dribble in place"},"practicing":{"min_success_rate":0.50,"description":"Can dribble without losing the ball"},"got_it":{"min_success_rate":0.75,"description":"Consistent dribble with eyes up"},"game_ready":{"min_success_rate":0.50,"context":"game_only","description":"Uses dribble effectively in games"}}',
 1),

((select id from curricula where name='YMCA Youth Basketball'), 'chest_pass_partner', 'Chest Pass (Partner)', 'passing', '{"5-7","8-10"}', 2,
 'Step and push! Thumbs down on the follow-through. Hit your partner right in the chest.',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 2),

((select id from curricula where name='YMCA Youth Basketball'), 'layup_form', 'Layup Form', 'shooting', '{"5-7","8-10"}', 3,
 'Right side: right hand, right foot, left knee up. Think: step, step, UP! Kiss the ball off the backboard.',
 '{"exploring":{"min_success_rate":0.20},"practicing":{"min_success_rate":0.40},"got_it":{"min_success_rate":0.65},"game_ready":{"min_success_rate":0.45,"context":"game_only"}}',
 3),

-- Fundamentals (8-10)
((select id from curricula where name='YMCA Youth Basketball'), 'dribble_with_eyes_up', 'Dribble with Eyes Up', 'ball_handling', '{"8-10","11-13"}', 1,
 'Your eyes are your superpower! If you''re looking at the ball, you can''t see the open teammate. Dribble by feel.',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 10),

((select id from curricula where name='YMCA Youth Basketball'), 'bounce_pass', 'Bounce Pass', 'passing', '{"8-10","11-13"}', 2,
 'Aim for two-thirds of the distance. The ball should bounce up to your partner''s waist. Step into the pass!',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 11),

((select id from curricula where name='YMCA Youth Basketball'), 'triple_threat', 'Triple Threat Position', 'offense', '{"8-10","11-13"}', 3,
 'Catch the ball and get into triple threat: you can shoot, pass, or drive. Feet shoulder-width, ball on your hip, knees bent. Be a threat!',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 12),

((select id from curricula where name='YMCA Youth Basketball'), 'pass_and_cut', 'Pass and Cut', 'off_ball_movement', '{"8-10","11-13","14-18"}', 4,
 'When you pass the ball, your job isn''t done. Think: pass, then EXPLODE to the basket. Your defender will relax when you pass - that''s when you go!',
 '{"exploring":{"min_success_rate":0.25,"cv_criteria":[{"metric":"displacement_toward_rim_after_pass","threshold":">1ft within 3s"}]},"practicing":{"min_success_rate":0.50,"cv_criteria":[{"metric":"displacement_toward_rim_after_pass","threshold":">3ft within 2s"}]},"got_it":{"min_success_rate":0.75,"cv_criteria":[{"metric":"displacement_toward_rim_after_pass","threshold":">3ft within 2s"}]},"game_ready":{"min_success_rate":0.50,"context":"game_only","cv_criteria":[{"metric":"displacement_toward_rim_after_pass","threshold":">3ft within 2s"}]}}',
 13),

((select id from curricula where name='YMCA Youth Basketball'), 'help_defense_position', 'Help Defense Position', 'defense', '{"8-10","11-13"}', 5,
 'See ball, see man! Point one hand at the ball and one at your player. If your teammate gets beat, you''re the help. Slide over and take the charge!',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 14),

-- Competitive Prep (11-13)
((select id from curricula where name='YMCA Youth Basketball'), 'ball_handling_combo_moves', 'Ball Handling Combo Moves', 'ball_handling', '{"11-13","14-18"}', 1,
 'Chain your moves together: crossover to behind-the-back, hesitation to spin. The best ball handlers have 2-3 go-to combos.',
 '{"exploring":{"min_success_rate":0.20},"practicing":{"min_success_rate":0.45},"got_it":{"min_success_rate":0.70},"game_ready":{"min_success_rate":0.45,"context":"game_only"}}',
 20),

((select id from curricula where name='YMCA Youth Basketball'), 'pick_and_roll_basic', 'Pick and Roll (Basic)', 'team_offense', '{"11-13","14-18"}', 3,
 'Screener: set your feet, be wide and strong. Ball handler: use the screen, read the defense. If they go over, drive. If they go under, shoot.',
 '{"exploring":{"min_success_rate":0.20},"practicing":{"min_success_rate":0.40},"got_it":{"min_success_rate":0.65},"game_ready":{"min_success_rate":0.40,"context":"game_only"}}',
 21),

((select id from curricula where name='YMCA Youth Basketball'), 'fast_break_lanes', 'Fast Break Lanes', 'transition', '{"11-13","14-18"}', 4,
 'Three lanes: ball handler middle, wings wide to the 3-point line. Sprint! The first 3 seconds after a rebound decide the break.',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 22),

((select id from curricula where name='YMCA Youth Basketball'), 'closeout_defense', 'Closeout Defense', 'defense', '{"11-13","14-18"}', 5,
 'Sprint to the ball, chop your feet at the end. High hands, low stance. Don''t fly by - controlled closeout. Contest the shot without fouling.',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.75},"game_ready":{"min_success_rate":0.50,"context":"game_only"}}',
 23),

((select id from curricula where name='YMCA Youth Basketball'), 'free_throw_routine', 'Free Throw Routine', 'shooting', '{"11-13","14-18"}', 6,
 'Build a routine: dribble, deep breath, bend knees, follow through. Same routine every time. Muscle memory is everything.',
 '{"exploring":{"min_success_rate":0.25},"practicing":{"min_success_rate":0.50},"got_it":{"min_success_rate":0.70},"game_ready":{"min_success_rate":0.55,"context":"game_only"}}',
 24);
