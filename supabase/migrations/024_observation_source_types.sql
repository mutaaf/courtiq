-- 024_observation_source_types.sql
-- Extend valid observation sources to include 'template' (quick-capture one-tap)
-- and 'observer' (guest observer mode via shared link).

ALTER TABLE observations
  DROP CONSTRAINT IF EXISTS observations_source_check;

ALTER TABLE observations
  ADD CONSTRAINT observations_source_check
  CHECK (source IN (
    'voice', 'typed', 'photo', 'video', 'cv',
    'import', 'debrief', 'template', 'observer'
  ));
