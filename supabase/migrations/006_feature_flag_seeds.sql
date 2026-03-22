insert into feature_flags (flag_key, name, description, default_enabled, enabled_tiers) values
  ('cv_processing', 'Computer Vision Video Analysis', 'Process game film with AI to extract player observations', false, '{"pro_coach","program","organization"}'),
  ('parent_portal', 'Parent Sharing Portal', 'Share player progress reports with parents via link', true, '{"coach","pro_coach","program","organization"}'),
  ('skill_challenges', 'Interactive Skill Challenges', 'Gamified skill challenges for players using their own footage', false, '{"pro_coach","program","organization"}'),
  ('curriculum_engine', 'Curriculum & Skill Progression', 'Track skill progression against a structured curriculum', true, '{"coach","pro_coach","program","organization"}'),
  ('multi_coach', 'Multi-Coach & Roles', 'Multiple coaches per team with role-based permissions', false, '{"program","organization"}'),
  ('admin_dashboard', 'Program Admin Dashboard', 'Organization-wide analytics and coach management', false, '{"program","organization"}'),
  ('custom_branding', 'Custom Branding & White Label', 'Custom logos, colors, and branding for the platform', false, '{"program","organization"}'),
  ('ai_prompt_customization', 'AI Prompt Customization', 'Customize AI behavior with custom instructions and templates', false, '{"program","organization"}'),
  ('highlight_generation', 'Automated Highlight Reels', 'Auto-generate highlight clips from game film', false, '{"pro_coach","program","organization"}'),
  ('config_export_import', 'Configuration Export/Import', 'Export and import organization configuration as JSON', false, '{"organization"}');
