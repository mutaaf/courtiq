-- Flag Football Sport Seed
insert into sports (slug, name, icon, default_positions, default_categories, default_age_groups, drill_categories, stat_fields, curriculum_enabled, terminology, plan_templates, default_curriculum_config) values (
  'flag_football',
  'Flag Football',
  '🏈',
  '{"QB","RB","WR","C","DE","LB","CB","S","Flex"}',
  '{"Offense","Defense","IQ","Effort","Coachability","Special Teams","General"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Passing","Catching","Route Running","Flag Pulling","Rushing","Coverage","Scramble Drills","Conditioning","Team Play","Fun Games"}',
  '[{"key":"touchdowns","label":"Touchdowns","type":"number"},{"key":"passing_yards","label":"Passing Yards","type":"number"},{"key":"receptions","label":"Receptions","type":"number"},{"key":"flags_pulled","label":"Flags Pulled","type":"number"},{"key":"interceptions","label":"Interceptions","type":"number"},{"key":"sacks","label":"Sacks","type":"number"}]',
  true,
  '{"pick_play":"Pick Play","flag_pull":"Flag Pull","scramble":"Scramble","zone_coverage":"Zone Coverage","man_coverage":"Man Coverage","play_action":"Play Action","screen_pass":"Screen Pass","hitch_route":"Hitch Route","slant_route":"Slant Route","go_route":"Go Route"}',
  '{}',
  '{}'
) on conflict (slug) do nothing;
