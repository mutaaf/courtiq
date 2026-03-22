-- Basketball Sport Seed
insert into sports (slug, name, icon, default_positions, default_categories, default_age_groups, drill_categories, stat_fields, curriculum_enabled, terminology, plan_templates, default_curriculum_config) values (
  'basketball',
  'Basketball',
  '🏀',
  '{"PG","SG","SF","PF","C","Flex"}',
  '{"Offense","Defense","IQ","Effort","Coachability","Physical","General"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Ball Handling","Passing","Shooting","Layups","Rebounding","Defense","Fast Break","Screening","Conditioning","Team Play","Fun Games"}',
  '[{"key":"points","label":"Points","type":"number"},{"key":"rebounds","label":"Rebounds","type":"number"},{"key":"assists","label":"Assists","type":"number"},{"key":"steals","label":"Steals","type":"number"},{"key":"blocks","label":"Blocks","type":"number"},{"key":"turnovers","label":"Turnovers","type":"number"}]',
  true,
  '{"pick_and_roll":"Pick and Roll","fast_break":"Fast Break","help_defense":"Help-Side Defense","box_out":"Box Out","spacing":"Spacing","ball_movement":"Ball Movement","transition":"Transition","triple_threat":"Triple Threat","closeout":"Close Out"}',
  '{}',
  '{}'
);

-- Soccer Sport Seed (placeholder)
insert into sports (slug, name, icon, default_positions, default_categories, default_age_groups, drill_categories, stat_fields, curriculum_enabled, terminology) values (
  'soccer',
  'Soccer',
  '⚽',
  '{"GK","CB","FB","CDM","CM","CAM","LW","RW","ST","Flex"}',
  '{"Attack","Defense","Technique","Tactical","Physical","Mental"}',
  '{"5-7","8-10","11-13","14-18"}',
  '{"Dribbling","Passing","Shooting","Defending","Set Pieces","Conditioning","Small-Sided Games"}',
  '[{"key":"goals","label":"Goals","type":"number"},{"key":"assists","label":"Assists","type":"number"},{"key":"shots","label":"Shots","type":"number"},{"key":"saves","label":"Saves","type":"number"}]',
  false,
  '{}'
);
