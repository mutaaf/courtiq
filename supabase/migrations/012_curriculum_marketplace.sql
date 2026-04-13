-- Curriculum Marketplace: allow orgs to publish curricula for others to import

ALTER TABLE curricula
  ADD COLUMN IF NOT EXISTS is_public      boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publisher_name text        NULL,
  ADD COLUMN IF NOT EXISTS import_count   integer     NOT NULL DEFAULT 0;

-- Index for fast marketplace browse queries
CREATE INDEX IF NOT EXISTS curricula_is_public_idx ON curricula (is_public)
  WHERE is_public = true;
