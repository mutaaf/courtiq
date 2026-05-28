-- Ticket 0054 — vanity coach handle.
--
-- One nullable, UNIQUE TEXT column on `coaches` so a coach can claim a
-- human-readable URL (sportsiq.app/coach/sarah-rodriguez) for the public
-- profile that 0026 already publishes at /coach/<token>. The handle is
-- ADDITIVE: the token URL keeps working forever; the handle is just a
-- cleaner alias.
--
-- COPPA: the handle is the coach's own opt-in choice on their OWN row. There
-- is no widening of `players` and no minor-scoped column added anywhere. The
-- CHECK regex constrains the handle to a small, public-URL-safe character
-- class (2–32 chars, lowercase alphanumeric + hyphens, no leading/trailing
-- hyphen). The same regex is enforced server-side by
-- src/lib/coach-handle-utils.ts so the DB constraint and the API validation
-- never disagree.
--
-- UNIQUE so two coaches cannot claim the same handle (claim route relies on
-- the constraint to reject the loser of a concurrent claim with SQLSTATE
-- 23505 → 409 'taken'; see src/app/api/coach-handle/claim/route.ts).
--
-- Version prefix `051_` chosen after verifying `ls supabase/migrations/`;
-- the previous shipped prefix is `050_coaches_last_seen_referral_count.sql`
-- (LESSONS#6 — unique version prefix).

alter table coaches
  add column if not exists handle text null;

-- The UNIQUE + CHECK constraints are added separately so an existing column
-- (from a re-run on a partially-applied DB) still gets both.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_handle_key'
  ) then
    alter table coaches
      add constraint coaches_handle_key unique (handle);
  end if;
end$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'coaches_handle_shape_check'
  ) then
    alter table coaches
      add constraint coaches_handle_shape_check
      check (handle is null or handle ~ '^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$');
  end if;
end$$;
