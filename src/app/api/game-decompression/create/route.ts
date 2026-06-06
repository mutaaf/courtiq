import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { canAccess, type Tier } from '@/lib/tier';
import {
  buildCoachingSignature,
  type CoachPlanRow,
  type CoachingSignature,
} from '@/lib/coaching-signature-utils';
import {
  isGameLikeSessionType,
  isWithinDecompressionWindow,
  stripSurnameShape,
  validateDecompressionDuration,
  validateDecompressionTranscript,
} from '@/lib/game-decompression-utils';

// POST /api/game-decompression/create — turn ONE 30-second post-loss voice
// note (recorded on the drive home) into ONE persisted decompression row +
// ONE AI-recommended drill for the FIRST slot of the next practice plan
// (ticket 0069).
//
// AUTHENTICATED — self-enforces auth below; NOT in publicPaths.
//
// Tier gating (server side, the load-bearing gate per AGENTS.md): the
// `feature_game_decompression` key gates the AI step. A free coach can
// still RECORD AND SAVE the transcript (the voice-first promise is not
// gated), but the AI drill recommendation is replaced with a 402 so the
// client surfaces the <UpgradeGate> on the success state. A coach-tier
// (or above) coach gets the full path: persistence + AI + recommendation
// written back.
//
// Head-coach check via team_coaches (LESSONS#0057). Window check on
// session.type IN (game/scrimmage/tournament) AND session played in the
// last 24h via (date, start_time) since `sessions.started_at` does NOT
// exist (LESSONS#0096). Voice scan on the transcript via the shared
// AGENTS.md banned-token helper (LESSONS#0023).
export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { sessionId, transcript, durationSeconds } = body as {
    sessionId?: string;
    transcript?: unknown;
    durationSeconds?: unknown;
  };

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  // Validate transcript + duration BEFORE any DB work. The route returns
  // a typed `reason` so the client sheet can switch between "say it
  // shorter" and "say it as a coach, not a cheerleader" copy.
  let cleanTranscript: string;
  let cleanDuration: number;
  try {
    cleanTranscript = validateDecompressionTranscript(transcript);
  } catch (e) {
    const reason = e instanceof Error ? e.message : 'invalid';
    return NextResponse.json({ reason }, { status: 400 });
  }
  try {
    cleanDuration = validateDecompressionDuration(durationSeconds);
  } catch {
    return NextResponse.json({ reason: 'length' }, { status: 400 });
  }

  // Service role for all DB operations (bypasses RLS).
  const supabase = await createServiceSupabase();

  try {
    // Resolve the session. Explicit `.select()` allow-list (LESSONS#0036)
    // — never `*` — so a future widening on `sessions` (e.g. a coach-
    // private field) does not silently ride through this route.
    const { data: session } = await supabase
      .from('sessions')
      .select('id, team_id, type, date, start_time, created_at')
      .eq('id', sessionId)
      .single();

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (!isGameLikeSessionType(session.type)) {
      return NextResponse.json({ reason: 'type' }, { status: 400 });
    }

    if (!isWithinDecompressionWindow(session as { date?: string | null; start_time?: string | null; created_at?: string | null })) {
      return NextResponse.json({ reason: 'window' }, { status: 400 });
    }

    // Head-coach check via team_coaches (LESSONS#0057). Any role on the
    // team passes — head_coach, coach, assistant — because all three may
    // legitimately want to decompress after a bad loss.
    const { data: teamCoach } = await supabase
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', session.team_id)
      .eq('coach_id', user.id)
      .single();

    if (!teamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve the coach's tier. The AI step is tier-gated; persistence is
    // not. A free coach still gets the transcript saved.
    const { data: coach } = await supabase
      .from('coaches')
      .select('org_id')
      .eq('id', user.id)
      .single();
    const orgId = (coach as { org_id?: string } | null)?.org_id || '';

    let tier: Tier = 'free';
    if (orgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('tier')
        .eq('id', orgId)
        .single();
      const t = (org as { tier?: string } | null)?.tier;
      if (t === 'coach' || t === 'pro_coach' || t === 'organization') {
        tier = t;
      }
    }

    const aiAllowed = canAccess(tier, 'feature_game_decompression');

    // Upsert the decompression row on (session_id, coach_id). The DB's
    // UNIQUE constraint plus an explicit `onConflict` makes a re-record
    // REPLACE the prior row in place (idempotent — never piles up dead
    // rows for the same session).
    const { data: row, error: upsertErr } = await supabase
      .from('game_decompressions')
      .upsert(
        {
          session_id: session.id,
          coach_id: user.id,
          team_id: session.team_id,
          transcript: cleanTranscript,
          duration_seconds: cleanDuration,
          // The recommendation columns are written below ONLY when the
          // AI step runs (tier-gated). On a re-record we re-null them so
          // a stale recommendation never lingers next to a fresh transcript.
          recommended_drill_name: null,
          recommended_drill_setup: null,
          recommended_drill_why: null,
          consumed_at: null,
          consumed_plan_id: null,
        },
        { onConflict: 'session_id,coach_id' },
      )
      .select('id, session_id, coach_id, team_id, transcript, duration_seconds')
      .single();

    if (upsertErr || !row) {
      return NextResponse.json(
        { error: upsertErr?.message || 'persist failed' },
        { status: 500 },
      );
    }

    // Free tier short-circuits BEFORE the AI step. Persistence already
    // happened; the client surfaces the <UpgradeGate> on the success
    // state. The 402 with reason:'tier' is the load-bearing server
    // gate per AGENTS.md.
    if (!aiAllowed) {
      return NextResponse.json(
        {
          reason: 'tier',
          transcript: cleanTranscript,
          decompression: row,
        },
        { status: 402 },
      );
    }

    // Build the drill library + coaching signature inputs for the prompt.
    // Both are best-effort: a thin library or a cold-start coach degrades
    // to the AI's last-resort fallback (an invented drill, last preference).
    const [drillLibrary, coachingSignature] = await Promise.all([
      fetchTeamDrillLibrary(session.team_id, supabase),
      fetchCoachingSignature(user.id, supabase),
    ]);

    const prompt = PROMPT_REGISTRY.gameDecompressionToDrill({
      transcript: cleanTranscript,
      drillLibrary,
      coachingSignature,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any = null;
    try {
      const result = await callAIWithJSON(
        {
          coachId: user.id,
          teamId: session.team_id,
          interactionType: 'custom',
          systemPrompt: prompt.system,
          userPrompt: prompt.user,
          orgId,
        },
        supabase,
      );
      parsed = result.parsed;
    } catch {
      // A throwing AI step does not kill the save. The row is already
      // persisted; the client falls through to a "saved, no drill yet"
      // state. Same best-effort posture as the plan-route reads.
      parsed = null;
    }

    const drillName = stringOrNull(parsed?.drill_name);
    const setupLines = stringArrayOrNull(parsed?.setup_lines);
    // LESSONS#0061 — surname strip on the why line BEFORE persistence
    // so the saved row never carries a minor's last name even if the
    // model ignored the prompt's first-name-only instruction. Literal
    // space, never `\s+`.
    const why = parsed?.why ? stripSurnameShape(String(parsed.why)).slice(0, 160) : null;

    if (drillName) {
      const { data: updated } = await supabase
        .from('game_decompressions')
        .update({
          recommended_drill_name: drillName,
          recommended_drill_setup: setupLines,
          recommended_drill_why: why,
        })
        .eq('id', row.id)
        .select('id, session_id, coach_id, team_id, transcript, duration_seconds, recommended_drill_name, recommended_drill_setup, recommended_drill_why')
        .single();

      return NextResponse.json({
        transcript: cleanTranscript,
        decompression: updated ?? row,
        recommendation: {
          drillName,
          setupLines: setupLines ?? [],
          why: why ?? null,
        },
      });
    }

    return NextResponse.json({
      transcript: cleanTranscript,
      decompression: row,
      recommendation: null,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Game-decompression create error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

function stringArrayOrNull(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const item of v) {
    if (typeof item === 'string' && item.trim()) {
      out.push(item.trim().slice(0, 120));
      if (out.length >= 3) break;
    }
  }
  return out.length > 0 ? out : null;
}

/** Best-effort team drill library for the prompt. Explicit `.select()`
 *  allow-list — name + category only. Returns at most 30 entries. */
async function fetchTeamDrillLibrary(
  teamId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<Array<{ name: string; focus?: string | null; setup_lines?: string[] | null }>> {
  try {
    // Pull team's sport_id first, then drills in that sport. Two small
    // reads beat one giant join here; both are explicit allow-lists.
    const { data: team } = await admin
      .from('teams')
      .select('sport_id')
      .eq('id', teamId)
      .single();
    const sportId = (team as { sport_id?: string } | null)?.sport_id;
    if (!sportId) return [];

    const { data: drills } = await admin
      .from('drills')
      .select('name, category')
      .eq('sport_id', sportId)
      .limit(30);
    if (!drills) return [];

    return (drills as Array<{ name: string; category?: string | null }>)
      .filter((d) => typeof d.name === 'string' && d.name.length > 0)
      .map((d) => ({ name: d.name, focus: d.category ?? null }));
  } catch {
    return [];
  }
}

/** Best-effort coaching signature for the prompt — reuses the shared
 *  builder so the second-preference drill source matches the practice-
 *  plan path's signal exactly (ticket 0037 helper). Cold-start coach
 *  resolves to null and the prompt block is omitted. */
async function fetchCoachingSignature(
  coachId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
): Promise<CoachingSignature | null> {
  try {
    const { data: plans } = await admin
      .from('plans')
      .select('type, skills_targeted, content_structured')
      .eq('coach_id', coachId)
      .in('type', ['practice', 'practice_arc'])
      .order('created_at', { ascending: false })
      .limit(40);
    return buildCoachingSignature((plans ?? []) as CoachPlanRow[]);
  } catch {
    return null;
  }
}
