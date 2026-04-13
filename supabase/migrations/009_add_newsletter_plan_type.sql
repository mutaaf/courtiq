-- Allow 'newsletter' as a plan type
ALTER TABLE plans DROP CONSTRAINT IF EXISTS plans_type_check;

ALTER TABLE plans ADD CONSTRAINT plans_type_check CHECK (type IN (
  'practice', 'gameday', 'weekly', 'development_card',
  'parent_report', 'report_card', 'custom', 'newsletter'
));
