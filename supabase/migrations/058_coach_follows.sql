-- Migration 058: coach_follows (ticket 0063)
--
-- The named, persistent coach-to-coach edge in the content graph. After a
-- coach clones another coach's published practice plan (0049 + 0055), they
-- can tap "Follow Coach <Name>" to mark the publisher as someone whose next
-- drops should land at the top of the cloning coach's league feed. The
-- table is COACH-TO-COACH only: no player, parent, or minor reference.
--
-- Why this layer ships now: 0049 shipped the publish-and-clone artifact, 0055
-- shipped in-program discovery, 0044 shipped the anonymous drill-sequence
-- aggregate. Together those three are the coach-to-coach CONTENT GRAPH, but
-- every edge in that graph is ANONYMOUS and TRANSIENT (one clone, one event).
-- A `coach_follows` row is a STANDING edge that re-fires every time the
-- followee publishes a new plan; the loop's compounding shifts from N events
-- per N clones to N x M events as each follow accumulates more publishes.
--
-- COPPA: this table is COACH-TO-COACH only. There is no name-similarity, no
-- dob-match, no biometric, no photo-match data here — only the two coach FKs
-- and the created_at timestamp. The header comment above documents what is
-- DELIBERATELY NOT here; the no-banned-token scan in the migration test
-- strips `--` comment lines (LESSONS#0088) so the documentation does not
-- collide with the linter.
--
-- Migration prefix uniqueness: 056 was claimed by parent_initiated_invites
-- and 057 by player_trajectories before this ticket landed. 058 is the next
-- free prefix at pickup time (LESSONS#0006). The migration test asserts the
-- prefix is unique without pinning the literal number.

CREATE TABLE IF NOT EXISTS coach_follows (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  followee_id  UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Idempotent follow: a second POST for the same (follower, followee) pair
  -- raises a unique violation, which the route catches and translates to a
  -- 200 with { alreadyFollowing: true }.
  UNIQUE (follower_id, followee_id),
  -- A coach cannot follow themselves. The route returns 400 explicitly; this
  -- check is the structural backstop.
  CHECK (follower_id <> followee_id)
);

-- The cloning coach's "who I follow" lookup (the source of the /plans
-- "From coaches you follow" section). Newest-first so the section reads
-- naturally without an extra sort.
CREATE INDEX IF NOT EXISTS idx_coach_follows_follower
  ON coach_follows (follower_id, created_at DESC);

-- The publisher's follower-side reads: the home-card notification (filtered
-- by created_at > preferences.last_seen_follow_count bookmark) and the
-- /coach-profile/followers list.
CREATE INDEX IF NOT EXISTS idx_coach_follows_followee
  ON coach_follows (followee_id, created_at DESC);
