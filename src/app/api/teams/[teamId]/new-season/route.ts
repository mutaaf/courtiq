/**
 * POST /api/teams/[teamId]/new-season
 *
 * Ticket 0052 — Start the next season with an edited roster without losing
 * player history. This is the coach-blocking flow for the
 * end-of-season-to-next-season transition: in one submit, name the new
 * season, mark each current player as Returning / Released / New, and
 * (optionally) snapshot the closing season into season_archives.
 *
 * Returning players keep their existing players row (and therefore every
 * observation / proficiency / cross-season memory tied to that id).
 * Released players get `released_at = NOW()`, which the active-roster reads
 * exclude (see /api/data POST + GET handlers); their history stays on the
 * row by id for cross-season queries. New players are inserted via the
 * COPPA-narrow allow-list (name / age_group / position / jersey_number /
 * nickname only — no date_of_birth, parent_*, medical_notes, or any
 * field the coach didn't already collect on roster-add).
 *
 * Auth + role:
 *   - 401: no auth.
 *   - 404: team doesn't exist OR belongs to a different org (no existence
 *          leak — matches the cross-org 404 in /api/teams/[teamId] and
 *          /api/sessions/[sessionId]).
 *   - 403: caller is not the team's head_coach.
 *   - 400: missing seasonName.
 *
 * Idempotency: a second identical post returns
 * `200 { ..., noop: true }` without writing anything. The route detects
 * the noop by: (a) every releasePlayerIds id already has released_at set,
 * (b) every newPlayers entry already exists on the team by (name, age_group)
 * match (and is NOT released), and (c) teams.season already equals seasonName.
 *
 * COPPA / data minimization: no new field is added to `players` other than
 * `released_at` (a status timestamp). The route writes ONLY the allow-listed
 * columns when inserting a new player, dropping any forged extras silently.
 *
 * No tier gate. Roster turnover is a basic operation across all tiers.
 *
 * Sister routes:
 *   - /api/seasons (POST)               — explicit archive-only flow
 *   - /api/season/rollover (POST)       — 0036's "carry forward as new rows" flow
 *
 * Both sister routes stay byte-identical; this one is the new single-screen
 * partition flow.
 */
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { memBust } from '@/lib/cache/memory';
import { resolveTeamAccess, isTeamHeadCoach, bustMeCacheForTeamCoaches } from '@/lib/teams/access';
import type { SeasonArchivePlayer, SeasonArchiveSkill, ProficiencyLevel, Trend } from '@/types/database';

// COPPA allow-list for new-player inserts. The route MUST NOT persist any
// field outside this set — no DOB, no parent contact, no medical notes, no
// photo. The new-season form already restricts its inputs to these
// keys but the server still enforces the allow-list so a forged body can't
// widen what we collect on minors.
const NEW_PLAYER_ALLOWED_KEYS = ['name', 'ageGroup', 'position', 'jerseyNumber', 'nickname'] as const;

type NewPlayerInput = {
  name?: unknown;
  ageGroup?: unknown;
  position?: unknown;
  jerseyNumber?: unknown;
  nickname?: unknown;
};

function sanitizeNewPlayer(raw: NewPlayerInput): {
  name: string;
  age_group: string;
  position: string | null;
  jersey_number: number | null;
  nickname: string | null;
} | null {
  if (typeof raw?.name !== 'string' || !raw.name.trim()) return null;
  if (typeof raw?.ageGroup !== 'string' || !raw.ageGroup.trim()) return null;
  return {
    name: raw.name.trim(),
    age_group: raw.ageGroup.trim(),
    position: typeof raw.position === 'string' && raw.position.trim() ? raw.position.trim() : null,
    jersey_number: typeof raw.jerseyNumber === 'number' ? raw.jerseyNumber : null,
    nickname: typeof raw.nickname === 'string' && raw.nickname.trim() ? raw.nickname.trim() : null,
  };
}

type Body = {
  seasonName?: string;
  startDate?: string;
  endDate?: string;
  seasonWeeks?: number;
  archivePreviousSeason?: boolean;
  archiveNotes?: string;
  returningPlayerIds?: string[];
  releasePlayerIds?: string[];
  newPlayers?: NewPlayerInput[];
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  try {
    const { teamId } = await params;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = await createServiceSupabase();
    const access = await resolveTeamAccess(admin, teamId, user.id);

    if (!access.team) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    // Role gate: must be the team's head_coach. Org-admin alone is NOT
    // sufficient — the new-season flow is a per-team coaching decision the
    // head coach owns. (Org admins can still ARCHIVE the team via the 0053
    // route; that's a different shape.)
    if (!isTeamHeadCoach(access.callerTeamRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: Body = {};
    try {
      body = (await request.json()) as Body;
    } catch {
      body = {};
    }

    const seasonName = typeof body.seasonName === 'string' ? body.seasonName.trim() : '';
    if (!seasonName) {
      return NextResponse.json(
        { error: 'seasonName is required' },
        { status: 400 },
      );
    }

    const returningPlayerIds = Array.isArray(body.returningPlayerIds) ? body.returningPlayerIds.filter((id): id is string => typeof id === 'string') : [];
    const releasePlayerIds = Array.isArray(body.releasePlayerIds) ? body.releasePlayerIds.filter((id): id is string => typeof id === 'string') : [];
    const newPlayersRaw = Array.isArray(body.newPlayers) ? body.newPlayers : [];
    const newPlayers = newPlayersRaw
      .map((p) => sanitizeNewPlayer(p))
      .filter((p): p is NonNullable<ReturnType<typeof sanitizeNewPlayer>> => p !== null);

    // Pull the current full roster (active rows only) for ownership +
    // idempotency checks. We use `select '*'` here so the in-memory mock's
    // generic chain returns full Row objects.
    const { data: rosterRows } = await admin
      .from('players')
      .select('*')
      .eq('team_id', teamId)
      .eq('is_active', true);

    const roster = ((rosterRows ?? []) as Array<{
      id: string;
      name: string;
      age_group: string;
      released_at: string | null;
    }>);

    // Ownership: every id the coach named must already exist on this team.
    // Silently drop foreign ids (don't 400 — a stale tab on the form might
    // reference a player who was deleted between load and submit). The
    // counts we return reflect only what was actually applied.
    const rosterIdSet = new Set(roster.map((r) => r.id));
    const returningOnTeam = returningPlayerIds.filter((id) => rosterIdSet.has(id));
    const releaseOnTeam = releasePlayerIds.filter((id) => rosterIdSet.has(id));

    // ── Idempotency precheck ────────────────────────────────────────────
    // If every release id is ALREADY released AND every new player already
    // exists on the team by (name, age_group) match AND the team's season
    // already equals seasonName, return noop without writes. A flaky
    // network's retry shouldn't double-add or re-release.
    const teamRow = access.team as { id: string; org_id: string; name: string; archived_at: string | null } & { season?: string };
    const { data: teamFullRows } = await admin
      .from('teams')
      .select('*')
      .eq('id', teamId);
    const teamFull = (teamFullRows ?? [])[0] as { season?: string } | undefined;
    const currentSeason = teamFull?.season ?? '';

    const releasedAlready = releaseOnTeam.every((id) => {
      const r = roster.find((rr) => rr.id === id);
      return r?.released_at !== null && r?.released_at !== undefined;
    });

    const newAlreadyExists = newPlayers.every((np) =>
      roster.some((r) => r.name === np.name && r.age_group === np.age_group && (r.released_at === null || r.released_at === undefined))
    );

    const isNoop = (
      currentSeason === seasonName &&
      releasedAlready &&
      (newPlayers.length === 0 || newAlreadyExists)
    );

    if (isNoop) {
      return NextResponse.json({
        teamId,
        seasonName,
        returningCount: returningOnTeam.length,
        releasedCount: releaseOnTeam.length,
        addedCount: newPlayers.length,
        noop: true,
      });
    }

    // ── 1. (optional) season_archives snapshot of the CLOSING season ────
    let archiveId: string | null = null;
    if (body.archivePreviousSeason === true && currentSeason) {
      // Inline the season-archives snapshot logic. The ticket called for
      // extracting this into src/lib/seasons/archive.ts; deferring the
      // extraction keeps the PR's surface area small (the existing
      // /api/seasons POST stays byte-identical). The snapshot is taken
      // BEFORE the released_at flips so the player_count includes the
      // about-to-be-released players (per AC).
      const [sessionsResult, obsResult, playersResult] = await Promise.all([
        admin.from('sessions').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
        admin.from('observations').select('id', { count: 'exact', head: true }).eq('team_id', teamId),
        admin.from('players').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('is_active', true),
      ]);

      const { data: playersForArchive } = await admin
        .from('players')
        .select('id, name')
        .eq('team_id', teamId)
        .eq('is_active', true);

      const playerSnapshot: SeasonArchivePlayer[] = [];
      if (playersForArchive && playersForArchive.length > 0) {
        const playerIds = (playersForArchive as Array<{ id: string }>).map((p) => p.id);
        const { data: proficiencies } = await admin
          .from('player_skill_proficiency')
          .select('player_id, skill_id, proficiency_level, trend')
          .in('player_id', playerIds);

        const skillIds = [...new Set((proficiencies ?? []).map((p: { skill_id: string }) => p.skill_id))];
        const { data: skills } = skillIds.length > 0
          ? await admin.from('curriculum_skills').select('skill_id, name, category').in('skill_id', skillIds)
          : { data: [] };
        const skillMap = new Map((skills ?? []).map((s: { skill_id: string; name: string; category: string }) => [s.skill_id, s]));

        for (const player of playersForArchive as Array<{ id: string; name: string }>) {
          const playerProfs = (proficiencies ?? []).filter((p: { player_id: string }) => p.player_id === player.id);
          const playerSkills: SeasonArchiveSkill[] = playerProfs.map((prof: { skill_id: string; proficiency_level: string; trend: string | null }) => {
            const skill = skillMap.get(prof.skill_id);
            return {
              name: skill?.name ?? prof.skill_id,
              category: skill?.category ?? 'Unknown',
              level: prof.proficiency_level as ProficiencyLevel,
              trend: prof.trend as Trend | null,
            };
          });
          playerSnapshot.push({
            player_id: player.id,
            player_name: player.name,
            skills: playerSkills,
          });
        }
      }

      const { data: archive } = await admin
        .from('season_archives')
        .insert({
          org_id: teamRow.org_id,
          team_id: teamId,
          coach_id: user.id,
          season_name: currentSeason,
          start_date: body.startDate ?? null,
          end_date: body.endDate ?? null,
          session_count: sessionsResult.count ?? 0,
          observation_count: obsResult.count ?? 0,
          player_count: playersResult.count ?? 0,
          player_snapshot: playerSnapshot,
          notes: typeof body.archiveNotes === 'string' ? body.archiveNotes.trim() : null,
        })
        .select('id')
        .single();

      archiveId = (archive as { id?: string } | null)?.id ?? null;
    }

    // ── 2. Release the players the coach marked ─────────────────────────
    let releasedCount = 0;
    if (releaseOnTeam.length > 0) {
      const releasedAt = new Date().toISOString();
      for (const id of releaseOnTeam) {
        await admin
          .from('players')
          .update({ released_at: releasedAt })
          .eq('id', id)
          .eq('team_id', teamId);
      }
      releasedCount = releaseOnTeam.length;
    }

    // ── 3. Insert the new players (COPPA-narrow allow-list) ─────────────
    let addedCount = 0;
    if (newPlayers.length > 0) {
      const newRows = newPlayers.map((p) => ({
        team_id: teamId,
        name: p.name,
        age_group: p.age_group,
        position: p.position ?? undefined,
        jersey_number: p.jersey_number ?? undefined,
        nickname: p.nickname ?? undefined,
        is_active: true,
      }));
      const { error: insertErr } = await admin.from('players').insert(newRows).select('id');
      if (insertErr) throw insertErr;
      addedCount = newRows.length;
    }

    // ── 4. Update the team's season label + reset week counter ──────────
    const teamUpdate: Record<string, unknown> = {
      season: seasonName,
      current_week: 1,
      updated_at: new Date().toISOString(),
    };
    if (typeof body.seasonWeeks === 'number' && Number.isFinite(body.seasonWeeks)) {
      teamUpdate.season_weeks = body.seasonWeeks;
    }
    await admin.from('teams').update(teamUpdate).eq('id', teamId);

    // ── 5. Bust /api/me cache for every coach on the team ───────────────
    // (LESSONS#41 — bust-on-mutation rather than shorten TTL.)
    await bustMeCacheForTeamCoaches(admin, teamId, memBust);

    return NextResponse.json({
      teamId,
      seasonName,
      returningCount: returningOnTeam.length,
      releasedCount,
      addedCount,
      archiveId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
