-- Migration 045: drill_sequence_aggregates + coach_drill_signals.signal_type
-- (ticket 0044 — "when a coach thumbs-up a drill, suggest the next drill
-- other coaches in the same sport ran after it").
--
-- WHY now: ticket 0039 (migration 040) added `coach_drill_signals` — one
-- coach's thumbs-up/thumbs-down on one drill, server-side, cross-team. That
-- data already exists per-coach. The smallest meaningful unit of value that
-- extends it is a nightly aggregation ACROSS coaches into a per-sport
-- "coaches who liked drill A next liked drill B" table — surfaced on the
-- drill detail page as up to three rows, only when the (sport, A, B) pair
-- has crossed a k-anonymity floor of >=5 distinct coaches. No new data is
-- collected from any coach or any minor; the input is signals coaches
-- already volunteered.
--
-- COPPA / data minimization: this migration adds NO column that references
-- a player, an observation, a parent contact, a DOB, or any descriptive
-- minor field. The aggregate table carries NO coach reference at all —
-- `coach_count` is an INT, never a list of coach ids — so the table is
-- privacy-safe even ignoring the route-layer N>=5 floor. The companion
-- column-add on `coach_drill_signals` is an additive 'signal_type' text
-- column with a two-value CHECK ('rating' | 'dismiss_suggestion'); the
-- existing 'up'/'down' rows from 0039 keep working byte-identically
-- (default 'rating') and `buildCoachingSignature` continues to consume
-- them exactly as today.
--
-- Unique version prefix 045_ (next free after 044_plans_type_sideline_talking_points
-- from ticket 0046). LESSONS#0006 — the supabase CLI keys applied migrations
-- on the leading <version>_ token, so a duplicate prefix would cause a
-- schema_migrations pkey collision on a fresh CI DB.

create table if not exists drill_sequence_aggregates (
  sport             text        not null,
  drill_id          uuid        not null,
  next_drill_id     uuid        not null,
  coach_count       int         not null,
  last_refreshed_at timestamptz not null default now(),
  primary key (sport, drill_id, next_drill_id)
);

-- The hot read is (sport, drill_id) with a coach_count filter — the PK
-- already covers (sport, drill_id, next_drill_id) so a per-sport per-drill
-- scan walks the PK. No secondary indexes in v1; the read shape is bounded.

-- ── coach_drill_signals.signal_type ───────────────────────────────────────
-- The 0039 table persists 'up'/'down' RATINGS only. The 0044 dismiss action
-- (a coach hiding the suggestions for a specific drill) reuses the same
-- table — one row per (coach, drill) — but with a distinct signal_type.
-- Adding the column with a 'rating' default keeps every existing row valid
-- without a data migration; the new 'dismiss_suggestion' value is reserved
-- for the new dismiss POST.
alter table coach_drill_signals
  add column if not exists signal_type text not null default 'rating';

-- The CHECK is the v1 allow-list. Drop-and-recreate (the column-add may
-- have just landed without a constraint; this normalises the surface).
alter table coach_drill_signals
  drop constraint if exists coach_drill_signals_signal_type_check;

alter table coach_drill_signals
  add constraint coach_drill_signals_signal_type_check
  check (signal_type in ('rating', 'dismiss_suggestion'));
