-- ═══════════════════════════════════════════════════════
-- Row Level Security Policies
-- ═══════════════════════════════════════════════════════

alter table organizations enable row level security;
alter table coaches enable row level security;
alter table teams enable row level security;
alter table team_coaches enable row level security;
alter table players enable row level security;
alter table sessions enable row level security;
alter table observations enable row level security;
alter table recordings enable row level security;
alter table media enable row level security;
alter table ai_interactions enable row level security;
alter table plans enable row level security;
alter table drills enable row level security;
alter table parent_shares enable row level security;
alter table config_overrides enable row level security;
alter table config_audit_log enable row level security;

-- Coaches see their own org
create policy "coaches_own_org" on organizations
  for select using (id in (select org_id from coaches where id = auth.uid()));

-- Coaches see themselves
create policy "coaches_select_self" on coaches
  for select using (id = auth.uid());

create policy "coaches_select_org" on coaches
  for select using (org_id in (select org_id from coaches where id = auth.uid()));

create policy "coaches_update_self" on coaches
  for update using (id = auth.uid());

-- Teams: coach sees teams they're assigned to
create policy "teams_select" on teams
  for select using (
    id in (select team_id from team_coaches where coach_id = auth.uid())
    or org_id in (select org_id from coaches where id = auth.uid() and role in ('admin', 'head_coach', 'coordinator'))
  );

create policy "teams_insert" on teams
  for insert with check (
    org_id in (select org_id from coaches where id = auth.uid())
  );

create policy "teams_update" on teams
  for update using (
    id in (select team_id from team_coaches where coach_id = auth.uid())
    or org_id in (select org_id from coaches where id = auth.uid() and role in ('admin', 'head_coach'))
  );

-- Team coaches
create policy "team_coaches_select" on team_coaches
  for select using (coach_id = auth.uid() or team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "team_coaches_insert" on team_coaches
  for insert with check (
    team_id in (select id from teams where org_id in (
      select org_id from coaches where id = auth.uid() and role in ('admin', 'head_coach')
    ))
  );

-- Players: scoped to coach's teams
create policy "players_select" on players
  for select using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "players_insert" on players
  for insert with check (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "players_update" on players
  for update using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "players_delete" on players
  for delete using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

-- Sessions
create policy "sessions_select" on sessions
  for select using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "sessions_insert" on sessions
  for insert with check (coach_id = auth.uid());

create policy "sessions_update" on sessions
  for update using (coach_id = auth.uid());

-- Observations
create policy "observations_select" on observations
  for select using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "observations_insert" on observations
  for insert with check (coach_id = auth.uid());

create policy "observations_update" on observations
  for update using (coach_id = auth.uid());

-- Recordings
create policy "recordings_select" on recordings
  for select using (coach_id = auth.uid());

create policy "recordings_insert" on recordings
  for insert with check (coach_id = auth.uid());

-- Media
create policy "media_select" on media
  for select using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "media_insert" on media
  for insert with check (coach_id = auth.uid());

-- AI interactions: coach sees own, admin sees org-wide
create policy "ai_interactions_select" on ai_interactions
  for select using (
    coach_id = auth.uid()
    or team_id in (select id from teams where org_id in (
      select org_id from coaches where id = auth.uid() and role = 'admin'
    ))
  );

create policy "ai_interactions_insert" on ai_interactions
  for insert with check (coach_id = auth.uid());

-- Plans
create policy "plans_select" on plans
  for select using (team_id in (
    select team_id from team_coaches where coach_id = auth.uid()
  ));

create policy "plans_insert" on plans
  for insert with check (coach_id = auth.uid());

-- Drills: see org + system drills
create policy "drills_select" on drills
  for select using (
    org_id is null
    or org_id in (select org_id from coaches where id = auth.uid())
  );

create policy "drills_insert" on drills
  for insert with check (coach_id = auth.uid());

-- Parent shares: public read via share token handled in API
create policy "parent_shares_select" on parent_shares
  for select using (coach_id = auth.uid());

create policy "parent_shares_insert" on parent_shares
  for insert with check (coach_id = auth.uid());

create policy "parent_shares_update" on parent_shares
  for update using (coach_id = auth.uid());

-- Config overrides: admin only
create policy "config_overrides_select" on config_overrides
  for select using (org_id in (select org_id from coaches where id = auth.uid()));

create policy "config_overrides_modify" on config_overrides
  for all using (org_id in (
    select org_id from coaches where id = auth.uid() and role in ('admin', 'coordinator')
  ));

-- Config audit log
create policy "config_audit_select" on config_audit_log
  for select using (org_id in (
    select org_id from coaches where id = auth.uid() and role in ('admin', 'coordinator')
  ));
