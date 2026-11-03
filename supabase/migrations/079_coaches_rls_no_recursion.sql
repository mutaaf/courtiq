-- Migration 079 — coaches RLS without recursion.
--
-- 002 defined coaches_select_org as `org_id IN (SELECT org_id FROM coaches WHERE id = auth.uid())`: a policy on
-- coaches that reads coaches, so Postgres re-applies the policy inside itself and fails with 42P17 "infinite
-- recursion detected in policy for relation coaches". Every other policy that looks up the caller's org through
-- coaches (organizations.coaches_own_org, ai_ledger, teams, …) inherits the failure whenever that branch is
-- evaluated (seen 2026-10-31: anon REST on organizations → 500).
--
-- Fix: the caller's org comes from a SECURITY DEFINER function that reads coaches without RLS (it only ever
-- returns the caller's own org_id), and the policy compares against it. Same rows visible as before: a coach
-- sees every coach in their org; anon sees none (auth.uid() is null → the function returns null).
-- No table, column or data changes.

CREATE OR REPLACE FUNCTION public.current_coach_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.coaches WHERE id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.current_coach_org_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_coach_org_id() TO authenticated, anon, service_role;

DROP POLICY IF EXISTS "coaches_select_org" ON public.coaches;
CREATE POLICY "coaches_select_org" ON public.coaches
  FOR SELECT USING (org_id = public.current_coach_org_id());

-- Service-role GRANTs (LESSONS#0094).
GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
