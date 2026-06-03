-- Migration 059: drill_shares + drill_share_clones (ticket 0064)
--
-- The single-drill publish-and-clone primitive. Two new tables:
--
-- 1) drill_shares — maps a public token to ONE drill the publishing coach
--    chose to share + an optional caption explaining why it worked for their
--    team. The public page at /drill/<token> renders the drill name + setup
--    + the caption + a one-tap "Save to my library" button. Mirrors the
--    048_practice_plan_shares pattern with three differences:
--      • drill_id is a UUID FK to drills(id) (drills are a real DB table,
--        not a static-content surface — see src/app/(dashboard)/drills/
--        for the resolution path).
--      • UNIQUE(coach_id, drill_id) makes re-publish IDEMPOTENT — a second
--        POST on the same drill UPDATEs the caption + updated_at on the
--        same row (and reuses the same share_token), so the publisher's
--        previously-shared link never goes stale on a re-tap of Publish.
--      • The clone destination is the existing 0039 drill_favorites
--        primitive on the cloning coach's coaches.preferences row — NOT a
--        fresh plans row, so no plans.source_plan_id-style attribution
--        column is added.
--
-- 2) drill_share_clones — one row per (drill_share, cloner_coach). UNIQUE
--    keeps the clone route idempotent (a second clone of the same drill is
--    a no-op) and is the source of the publisher's clone count surfaced on
--    their authed coach-profile dashboard.
--
-- COPPA: neither table references a player, a parent, a session, a team,
-- or any minor identifier. drill_shares carries (coach_id, drill_id,
-- share_token, caption, is_active). drill_share_clones carries
-- (drill_share_id, cloner_coach_id, cloned_at). The header comment above
-- documents what is DELIBERATELY NOT here; the no-banned-token scan in
-- the migration test strips `--` comment lines (LESSONS#0088) so the
-- documentation does not collide with the linter.
--
-- Tier gating: neither publishing nor cloning a single drill is tier-gated
-- (free coaches can publish + clone). The publish primitive is universal
-- so the graph remains open — same posture as 0049 / 0055 / 0063.
--
-- Migration prefix uniqueness: 058 was claimed by coach_follows before this
-- ticket landed. 059 is the next free prefix at pickup time (LESSONS#0006).
-- The migration test asserts the prefix is unique without pinning the
-- literal number.

CREATE TABLE IF NOT EXISTS drill_shares (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  drill_id     UUID        NOT NULL REFERENCES drills(id) ON DELETE CASCADE,
  share_token  TEXT        NOT NULL UNIQUE,
  caption      TEXT        NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotent re-publish: a second POST on (coach_id, drill_id) UPDATEs
  -- the caption + updated_at on the same row, never mints a second token.
  UNIQUE (coach_id, drill_id)
);

-- Publisher's "drills I have published" listing — most-recent-first.
CREATE INDEX IF NOT EXISTS idx_drill_shares_coach
  ON drill_shares (coach_id, created_at DESC);

-- Follower-feed read path (the 0063 "From coaches you follow" section will
-- read this in a future ticket): active shares per coach, most-recent first.
CREATE INDEX IF NOT EXISTS idx_drill_shares_coach_active
  ON drill_shares (coach_id, is_active, created_at DESC);

CREATE TABLE IF NOT EXISTS drill_share_clones (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_share_id  UUID        NOT NULL REFERENCES drill_shares(id) ON DELETE CASCADE,
  cloner_coach_id UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  cloned_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotent clone: a second clone of the same share by the same coach
  -- raises a unique violation, which the clone route catches and
  -- translates to `{ alreadyFavorited: true }`.
  UNIQUE (drill_share_id, cloner_coach_id)
);

-- Publisher's clone-count rollup ("how many coaches saved this drill").
CREATE INDEX IF NOT EXISTS idx_drill_share_clones_share
  ON drill_share_clones (drill_share_id, cloned_at DESC);
