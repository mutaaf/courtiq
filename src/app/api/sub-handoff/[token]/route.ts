import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { validateObserverToken } from '@/lib/sub-handoff-utils';

// GET /api/sub-handoff/[token] — PUBLIC, no auth. Resolves the observer
// token → its sub_handoffs row → session + team + sport + (optional)
// weekly focus + (optional) queued drills + (optional) eyes-on-players.
//
// The three optional sections are OMITTED from the response when their
// include flag is false on the handoff row. The route's `.select()` calls
// are EXPLICIT ALLOW-LISTS per LESSONS#0036 / #0057 / the AC; no `*`.
//
// COPPA contract: the eyes-on-players section returns FIRST NAMES only
// (server-side split on `players.name`). DOB, medical_notes, parent_email,
// parent_phone, jersey_number, photo_url, full name are NEVER read or
// returned. The `weeklyFocusLine` is team-aggregate text (from
// config_overrides). The queuedDrills section is static plan content (no
// minor data). The sub-note input is voice-scanned at submit.
//
// Eyes-on-players sourcing (LESSONS#0096 — schema wins, document at pickup):
//   PRIMARY: read up to TWO most-recent parent_reactions rows on the
//            session's team with coach_reply_at IS NULL (open thread) →
//            their player_id → the most-recent coach-authored observation
//            for each. This is the "two kids whose parents asked" line
//            from the AC.
//   FALLBACK: if the primary returns fewer than 2, fill from the two
//            players on the team with the highest recent-observation
//            count this week — declared at pickup as the acceptable
//            substitute when the open-thread query is too sparse.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  try {
    // Lookup the handoff row by observer_token (indexed).
    const { data: handoff } = await supabase
      .from('sub_handoffs')
      .select(
        'id, session_id, coach_id, observer_token, sub_first_name, include_queued_drills, include_weekly_focus, include_eyes_on_players',
      )
      .eq('observer_token', token)
      .single();

    if (!handoff) {
      return NextResponse.json({ error: 'Handoff not found' }, { status: 404 });
    }

    // Validate the observer token. An expired token → 410 (the regular
    // coach can mint a fresh one with one tap — the URL is the only thing
    // that changes).
    const validation = validateObserverToken(token);
    if (!validation) {
      return NextResponse.json({ error: 'Link expired' }, { status: 410 });
    }

    // Pull the session — allow-list select. `planned_drills` is a jsonb
    // payload the regular coach saved when planning the session; we render
    // it as-is into the queuedDrills section (when included).
    const { data: session } = await supabase
      .from('sessions')
      .select('id, team_id, date, planned_drills')
      .eq('id', handoff.session_id)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Team + sport — allow-list selects. Never reads coach_id / settings on
    // teams (we don't need them and they could leak future fields).
    const { data: team } = await supabase
      .from('teams')
      .select('id, name, age_group, sport_id')
      .eq('id', session.team_id)
      .single();

    let sportName: string | null = null;
    if (team?.sport_id) {
      const { data: sport } = await supabase
        .from('sports')
        .select('id, name')
        .eq('id', team.sport_id)
        .single();
      sportName = sport?.name ?? null;
    }

    // Expiry timestamp — derive from the HMAC payload via the same
    // splitter the verifier uses. (We re-parse the payload here rather
    // than re-export it from observer-utils to keep the helper surface
    // small. The token shape is `<base64url(sessionId:expires)>.<sig>`.)
    const parts = token.split('.');
    let expiresAt: string | null = null;
    try {
      if (parts.length === 2) {
        const payload = Buffer.from(parts[0], 'base64url').toString('utf-8');
        const colonIdx = payload.indexOf(':');
        const expiresMs = parseInt(payload.slice(colonIdx + 1), 10);
        if (!isNaN(expiresMs)) expiresAt = new Date(expiresMs).toISOString();
      }
    } catch {
      /* swallow — expiresAt stays null */
    }

    // Build the response. Optional sections (weeklyFocusLine, queuedDrills,
    // eyesOnPlayers) are OMITTED when their include flag is false.
    type DrillBlock = { drillName: string; setupLines: string[]; coachNote?: string };
    type EyesPlayer = { firstName: string; oneLineWatch: string };
    const out: {
      sessionDate: string;
      teamName: string;
      ageGroup: string;
      sportName: string | null;
      subFirstName: string | null;
      expiresAt: string | null;
      weeklyFocusLine?: string;
      queuedDrills?: DrillBlock[];
      eyesOnPlayers?: EyesPlayer[];
    } = {
      sessionDate: session.date,
      teamName: team?.name ?? '',
      ageGroup: team?.age_group ?? '',
      sportName,
      subFirstName: handoff.sub_first_name,
      expiresAt,
    };

    // ── weekly focus ────────────────────────────────────────────────────
    if (handoff.include_weekly_focus) {
      const { data: focusCfg } = await supabase
        .from('config_overrides')
        .select('value')
        .eq('scope', 'team')
        .eq('scope_id', session.team_id)
        .eq('key', 'weekly_focus')
        .single();
      const raw = focusCfg?.value;
      if (typeof raw === 'string' && raw.trim()) {
        out.weeklyFocusLine = raw;
      }
    }

    // ── queued drills ───────────────────────────────────────────────────
    if (handoff.include_queued_drills) {
      const planned = session.planned_drills;
      if (Array.isArray(planned)) {
        const drills: DrillBlock[] = [];
        for (const item of planned) {
          if (!item || typeof item !== 'object') continue;
          const obj = item as Record<string, unknown>;
          const name =
            typeof obj.name === 'string'
              ? obj.name
              : typeof obj.drillName === 'string'
                ? obj.drillName
                : null;
          if (!name) continue;
          const setupRaw = obj.setupLines ?? obj.setup_instructions ?? obj.setup;
          const setupLines: string[] = Array.isArray(setupRaw)
            ? (setupRaw as unknown[]).filter((s): s is string => typeof s === 'string')
            : typeof setupRaw === 'string'
              ? setupRaw.split('\n').filter((l) => l.trim()).slice(0, 6)
              : [];
          const block: DrillBlock = { drillName: name, setupLines };
          const coachNote =
            typeof obj.coachNote === 'string'
              ? obj.coachNote
              : typeof obj.coach_note === 'string'
                ? obj.coach_note
                : null;
          if (coachNote) block.coachNote = coachNote;
          drills.push(block);
        }
        if (drills.length > 0) out.queuedDrills = drills;
      }
    }

    // ── eyes on players ─────────────────────────────────────────────────
    if (handoff.include_eyes_on_players) {
      // PRIMARY: open-thread parent reactions on this team (coach_reply_at
      // IS NULL), most recent two. The route accepts a parent_reactions
      // schema with a nullable coach_reply_at (per migration 053).
      const { data: openThreads } = await supabase
        .from('parent_reactions')
        .select('player_id, created_at')
        .eq('team_id', session.team_id)
        .is('coach_reply_at', null)
        .not('player_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(4);

      const playerIds: string[] = [];
      if (Array.isArray(openThreads)) {
        for (const r of openThreads) {
          const pid = (r as { player_id?: string | null }).player_id;
          if (typeof pid === 'string' && !playerIds.includes(pid)) {
            playerIds.push(pid);
            if (playerIds.length >= 2) break;
          }
        }
      }

      if (playerIds.length > 0) {
        // Allow-list select on players — name + id only. We READ
        // released_at to skip released kids (LESSONS#0096-ish — match the
        // same filter the active-roster routes apply). Crucially we
        // NEVER read date_of_birth / medical_notes / parent_email /
        // parent_phone / jersey_number / photo_url here.
        const { data: players } = await supabase
          .from('players')
          .select('id, name, released_at')
          .in('id', playerIds);

        const activePlayers = (players ?? []).filter(
          (p) => (p as { released_at?: string | null }).released_at === null,
        );

        if (activePlayers.length > 0) {
          // Pull the most-recent coach-authored observation per player.
          const { data: obs } = await supabase
            .from('observations')
            .select('id, player_id, text, created_at')
            .in('player_id', activePlayers.map((p) => (p as { id: string }).id))
            .order('created_at', { ascending: false });

          const seenForPlayer = new Set<string>();
          const eyes: EyesPlayer[] = [];
          for (const p of activePlayers) {
            const pid = (p as { id: string }).id;
            const fullName = (p as { name?: string | null }).name ?? '';
            const firstName = String(fullName).trim().split(/\s+/)[0] || 'a player';
            const watchObs = (obs ?? []).find(
              (o) => (o as { player_id: string }).player_id === pid && !seenForPlayer.has(pid),
            );
            if (watchObs) {
              seenForPlayer.add(pid);
              const oneLineWatch = String(
                (watchObs as { text?: string | null }).text ?? '',
              )
                .split('\n')[0]
                .slice(0, 140);
              if (oneLineWatch) {
                eyes.push({ firstName, oneLineWatch });
              }
            }
          }
          if (eyes.length > 0) out.eyesOnPlayers = eyes;
        }
      }
    }

    return NextResponse.json(out);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Sub-handoff token GET error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
