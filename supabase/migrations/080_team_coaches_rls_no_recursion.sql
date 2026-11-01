-- Migration 080 — team_coaches RLS without recursion (the same fix as 079, for the other self-referencing policy).
--
-- team_coaches_select read team_coaches inside its own policy (`team_id IN (SELECT team_id FROM team_coaches WHERE
-- coach_id = auth.uid())`), so any read of teams (whose policies look at team_coaches) failed with 42P17
-- "infinite recursion detected in policy for relation team_coaches" (seen 2026-10-31 after 079: anon REST on
-- teams → 500). A scan of every policy in production found exactly two self-references: coaches (079) and this one.
--
-- Fix: the caller's teams come from a SECURITY DEFINER function; the policy compares against it. Same rows
-- visible: a coach sees their own rows and every row of the teams they coach. No table, column or data changes.

CREATE OR REPLACE FUNCTION public.current_coach_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT team_id FROM public.team_coaches WHERE coach_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_coach_team_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_coach_team_ids() TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "team_coaches_select" ON public.team_coaches;
CREATE POLICY "team_coaches_select" ON public.team_coaches
  FOR SELECT USING (coach_id = auth.uid() OR team_id IN (SELECT public.current_coach_team_ids()));

-- Service-role GRANTs (LESSONS#0094).
GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
