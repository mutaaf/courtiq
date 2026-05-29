-- Ticket 0050 — parent-to-program-director referral audit table.
--
-- A parent reading their kid's report on /share/[token] taps "Send this to our
-- program director" and the new POST /api/share/[token]/program-referral route
-- inserts one row here, then emails the director with a link back to the same
-- report carrying a signed `pr` parameter. The 30-day dedup query reads
-- (share_token, director_email_hash) so a re-submit by the same parent to the
-- same director within 30 days does NOT re-send. The director-side claim flow
-- stamps claimed_at + claimed_org_id on the same row when the verified token
-- matches.
--
-- COPPA posture: this table holds NO minor data. There is NO player_id, NO
-- player_name, NO observation excerpt, NO age_group, NO position, NO
-- date-of-birth, NO medical note here. The share token IS already public (it
-- IS the parent portal URL the parent just chose to share); the director's
-- email IS volunteered by the parent on the form; the parent's first name +
-- optional email + optional one-line note are the only parent-side fields.
-- The director_email_hash exists so the dedup query never puts a raw email
-- into a WHERE clause. There is no FK to players or observations; the source
-- coach is resolved on read via parent_shares -> teams -> coaches at request
-- time, never copied here.
--
-- Migration prefix 052 was chosen after `ls supabase/migrations/`: the ticket
-- spec was written when 047 was the next free slot, but 047 has since shipped
-- (047_plans_type_postgame_parent_texts.sql) and 048-051 have followed.
-- LESSONS#0006 — version prefixes must be unique.

create table if not exists program_referrals (
  id uuid primary key default gen_random_uuid(),
  share_token text not null,
  parent_first_name text not null,
  parent_email text null,
  director_first_name text not null,
  director_email text not null,
  director_email_hash text not null,
  note text null,
  signed_director_id text not null,
  sent_at timestamptz not null default now(),
  claimed_at timestamptz null,
  claimed_org_id uuid null references organizations(id) on delete set null
);

-- Dedup query: a re-submit by the same parent to the same director within 30
-- days reads this index to short-circuit without firing a second email.
create index if not exists program_referrals_dedup_idx
  on program_referrals (share_token, director_email_hash, sent_at desc);

-- Claim-attribution reporting: list referrals that converted into a claimed
-- org. Sparse index (most rows are NULL until a director claims) keeps the
-- index small.
create index if not exists program_referrals_claimed_org_idx
  on program_referrals (claimed_org_id)
  where claimed_org_id is not null;
