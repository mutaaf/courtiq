-- Migration 040: coach_drill_signals (ticket 0039)
--
-- Per-coach-per-drill rating state, server-side, so the coach's thumbs-up /
-- thumbs-down on the break screen travels across phones, teams, and seasons —
-- today it lives in localStorage (`drill-rating:${teamId}:${drillId}`) and
-- evaporates with the browser cache, cannot feed the coaching signature, and is
-- per-team rather than per-coach.
--
-- One rating fact per (coach, drill). No team_id — the signal is COACH-private
-- and cross-team by design (the picker should sort by the coach's lifetime
-- preference, not the current team only). No reference to a `players` row, no
-- observation text, no parent contact. The only fields are who rated, which
-- drill, the rating, when it was last set, and a best-effort run count.
--
-- COPPA / data minimization: this collects NO data ABOUT a minor. It is one
-- coach's opinion of one drill, with a count of how many times the coach has
-- run the drill (sourced from the existing local drill-run-history, never from
-- player observations). The structured-coach-artifact moat is deepened without
-- widening what we collect on `players` (AGENTS.md non-negotiable 2).
--
-- ON DELETE CASCADE on coach_id matches every other coach-scoped table — if a
-- coach row is deleted, their drill signals go with them.
--
-- Unique version prefix 040 (next free after 039_player_prior_player_link); the
-- supabase CLI keys applied migrations on the leading <version>_ token, so a
-- unique prefix avoids the schema_migrations duplicate-key class of failure
-- (LESSONS.md 2026-05-20 re: 031 collisions).

CREATE TABLE IF NOT EXISTS coach_drill_signals (
  coach_id      UUID        NOT NULL REFERENCES coaches(id) ON DELETE CASCADE,
  drill_id      UUID        NOT NULL,
  rating        TEXT        NOT NULL CHECK (rating IN ('up', 'down')),
  run_count     INT         NOT NULL DEFAULT 0,
  last_rated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (coach_id, drill_id)
);

-- The hot read is "all signals for this coach" (the picker's lifetime sort);
-- the PK already covers (coach_id, drill_id), so a coach scan walks the PK.
-- A secondary index on drill_id helps any future "how many coaches rated this
-- drill" cross-cut, but we don't add it in v1 — the leaderboard is out of
-- scope per the ticket and we keep the table footprint minimal.
