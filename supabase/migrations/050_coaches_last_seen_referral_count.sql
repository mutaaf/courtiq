-- Ticket 0047 — referral-conversion celebration card.
--
-- This column is a PER-COACH UI BOOKMARK for the home-feed celebration card.
-- It records the referral count the inviting coach has already SEEN, so when
-- their current count advances above this value we know to fire one card
-- ("Coach <first_name> you invited just joined SportsIQ") and a single
-- one-tap "Invite another coach" CTA — and we know to render NOTHING when
-- the seen count and the live count match.
--
-- COPPA: this primitive lives ONLY on `coaches`. There is no widening of
-- `players` or any minor-scoped table. There is no observation text, no
-- parent contact, no medical or photo data — only an integer bookmark on
-- the inviting coach's own row. The column is per-coach by construction
-- (the route writes the caller's own row), so a coach cannot read another
-- coach's value through this column.
--
-- NOT NULL DEFAULT 0 so existing rows start at zero. A coach with prior
-- conversions and a fresh 0-bookmark will see the anonymous-fallback card
-- exactly once on next /home load (the seen-POST advances the bookmark
-- immediately) — this is treated as a feature, not a bug, per the ticket.

alter table coaches
  add column if not exists last_seen_referral_count int not null default 0;
