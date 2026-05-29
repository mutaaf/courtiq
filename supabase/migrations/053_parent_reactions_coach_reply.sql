-- Ticket 0056 — coach-side reciprocation of a parent reaction.
--
-- TWO new nullable columns on parent_reactions so the coach can one-tap-reply
-- to a parent who left a note (heart / message). The reply itself rides on
-- the existing `team_announcements` channel (migration 022) scoped to ONE
-- parent recipient — no new email channel, no new sender, no new auth path.
--
--   coach_reply_at TIMESTAMPTZ NULL
--     server-stamped the moment the coach taps Send. Acts as the
--     idempotency guard: a second send to the same reaction returns 409
--     with the SAME coach_reply_id (see /api/parent-reactions/[id]/send-reply).
--
--   coach_reply_id UUID NULL REFERENCES team_announcements(id)
--                            ON DELETE SET NULL
--     points at the row that carries the actual thank-you text. SET NULL on
--     cascade so a coach who later deletes the announcement (via the
--     existing team_announcements admin path) does NOT lose the reply-
--     happened bookmark; the timestamp stays.
--
-- ── COPPA approval trail (LESSONS#0088 — strip `--` comments before scanning
-- DDL for banned tokens) ────────────────────────────────────────────────────
--
-- NEITHER new column is a descriptive minor field. They are:
--   - a server-stamped timestamp; and
--   - an FK to an existing coach-owned table (team_announcements) that has
--     its own RLS posture and is already addressable from the coach surface.
--
-- This migration adds NO new column on `players`. It adds NO new column
-- describing the child. There is no name-similarity, dob-match, biometric,
-- or photo-match data here — only the timestamp + the announcement FK. The
-- parent_reactions table itself joins to players via player_id (existing,
-- migration 023); the new columns do NOT widen what is captured about the
-- minor on that join.
--
-- ── Migration prefix coordination (LESSONS#0006 / #0009) ────────────────────
--
-- Prefix `053_` chosen after `ls supabase/migrations/`: the ticket spec was
-- written when 050 was the next free slot, but 051 (0054 coaches_handle) and
-- 052 (0050 program_referrals) have shipped since. The next unique prefix is
-- 053. Same family as LESSONS#0096 — schema wins over the ticket's prose.

alter table parent_reactions
  add column if not exists coach_reply_at timestamptz null;

alter table parent_reactions
  add column if not exists coach_reply_id uuid null;

-- The FK is added separately so an existing column (from a partially-applied
-- DB) still gets the constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'parent_reactions_coach_reply_id_fkey'
  ) then
    alter table parent_reactions
      add constraint parent_reactions_coach_reply_id_fkey
      foreign key (coach_reply_id) references team_announcements(id) on delete set null;
  end if;
end$$;

-- An index on (coach_id, coach_reply_at) helps the rate-limiter query the
-- send-reply route runs (counting the coach's same-day replies). Partial on
-- non-NULL replies so the index stays small for the dominant "unreplied"
-- working set.
create index if not exists parent_reactions_coach_reply_at_idx
  on parent_reactions (coach_id, coach_reply_at)
  where coach_reply_at is not null;
