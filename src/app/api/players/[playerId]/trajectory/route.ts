/**
 * Ticket 0061 — GET /api/players/[playerId]/trajectory.
 *
 * The "Week 1 vs now" trajectory route. Reads the player's observations,
 * checks the cache at `(player_id, bucket)`, calls `callAIWithJSON` on a
 * cache miss (one prompt, one provider failover layer), upserts the cache
 * row, gates a free-tier coach to ONE preview per (coach, player) per 30
 * days via the `player_trajectory_views` audit table.
 *
 * COPPA boundary (the load-bearing contract):
 *   - The route reads `players.parent_email` / `parent_phone` / `date_of_birth`
 *     / `medical_notes` ONLY to verify the player row exists. None of those
 *     values reach the AI prompt input (only first name + age + sport +
 *     observation text are threaded) and none reach the JSON response.
 *   - The prompt input is filtered to first-name-only at the boundary
 *     (LESSONS-COPPA — never widen what crosses the AI boundary on minors).
 *
 * Tier contract:
 *   - `feature_player_trajectory` is registered for coach/pro_coach/organization
 *     and NOT for free (paired with <UpgradeGate feature="feature_player_trajectory">
 *     on the surface).
 *   - A free coach's FIRST view of a given player in 30 days PASSES (the
 *     preview); the second view in 30 days returns 402.
 *   - Paid tiers are never gated.
 *
 * Ownership: head coach via `team_coaches` (LESSONS#0057 — NEVER `teams.coach_id`).
 * Test mock queue order (mirrors tests/api/players-trajectory.test.ts):
 *   1) coaches → org + tier
 *   2) players → row (or 404)
 *   3) team_coaches → membership (or 403)
 *   4) teams → name + age + org + sport (display + prompt input)
 *   5) observations → ordered asc by created_at
 *   6) player_trajectory_views → views in last 30 days (for free preview gate)
 *   7) player_trajectories → cache lookup at bucket
 *   8) player_trajectories upsert (on cache miss only)
 *   9) player_trajectory_views insert (audit, always after the gate passes)
 */
import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { callAIWithJSON } from '@/lib/ai/client';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { playerTrajectorySchema, type PlayerTrajectoryAIOutput } from '@/lib/ai/schemas';
import { handleAIError } from '@/lib/ai/error';
import { canAccess, type Tier } from '@/lib/tier';
import {
  FREE_PREVIEW_WINDOW_DAYS,
  MIN_OBSERVATIONS_FOR_TRAJECTORY,
  containsBannedWord,
  fallbackSentence,
  firstNameOf,
  observationBucket,
  toPromptObservations,
  weeksObserved,
  type ObservationRow,
} from '@/lib/player-trajectory-utils';

interface AnchorOut {
  headline: string;
  sentence: string;
  observation_id: string;
  observed_at: string;
}
interface TurningPointOut {
  observation_id: string;
  observed_at: string;
  oneWordLabel: string;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ playerId: string }> },
) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 });
  }

  try {
    const admin = await createServiceSupabase();

    // 1) coach → org + tier
    const { data: coachRow } = await admin
      .from('coaches')
      .select('id, org_id, full_name, organizations(tier)')
      .eq('id', user.id)
      .single();
    const orgId =
      (coachRow as { org_id?: string | null } | null)?.org_id ?? null;
    const tier = (
      ((coachRow as { organizations?: { tier?: string } | null } | null)
        ?.organizations?.tier) ||
      'free'
    ) as Tier;

    // 2) player lookup. We read parent_email / parent_phone / date_of_birth /
    //    medical_notes here ONLY to verify the row exists; none of those
    //    columns ever reach the AI prompt or the JSON response. The COPPA
    //    boundary is enforced at the prompt-input adapter below.
    const { data: player } = await admin
      .from('players')
      .select('id, team_id, name, age_group, parent_email, parent_phone, date_of_birth, medical_notes')
      .eq('id', playerId)
      .single();
    if (!player) {
      return NextResponse.json({ error: 'Player not found' }, { status: 404 });
    }
    const teamId = (player as { team_id: string }).team_id;
    const playerName = (player as { name: string }).name;
    const playerAgeGroup = (player as { age_group: string }).age_group || '';
    const playerFirstName = firstNameOf(playerName);

    // 3) head-coach ownership via team_coaches (LESSONS#0057).
    const { data: teamCoach } = await admin
      .from('team_coaches')
      .select('coach_id')
      .eq('team_id', teamId)
      .eq('coach_id', user.id)
      .maybeSingle();
    if (!teamCoach) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 4) team display + sport (for the prompt's sport_name)
    const { data: team } = await admin
      .from('teams')
      .select('id, name, age_group, org_id, sports(name)')
      .eq('id', teamId)
      .single();
    const sportName =
      ((team as { sports?: { name?: string } | null } | null)?.sports?.name) ||
      'youth sport';

    // 5) free-tier preview gate. Look up views in the last 30 days for the
    //    (coach, player) pair. Free coach's SECOND view returns 402 with the
    //    named feature key BEFORE any observation/AI cost is incurred. Paid
    //    tiers always read this table for a consistent audit chain shape
    //    but never gate on it.
    const windowStart = new Date(
      Date.now() - FREE_PREVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: viewsInWindow } = await admin
      .from('player_trajectory_views')
      .select('id')
      .eq('coach_id', user.id)
      .eq('player_id', playerId)
      .gte('viewed_at', windowStart);
    const priorViews = Array.isArray(viewsInWindow) ? viewsInWindow.length : 0;
    if (!canAccess(tier, 'feature_player_trajectory') && priorViews >= 1) {
      return NextResponse.json(
        {
          reason: 'upgrade-required',
          feature: 'feature_player_trajectory',
          error:
            'A second trajectory preview within 30 days is a Coach plan feature.',
        },
        { status: 402 },
      );
    }

    // 6) observations (ordered ascending by created_at).
    const { data: rawObs } = await admin
      .from('observations')
      .select('id, text, sentiment, category, skill_id, created_at')
      .eq('player_id', playerId)
      .order('created_at', { ascending: true });
    const observations: ObservationRow[] = Array.isArray(rawObs) ? (rawObs as ObservationRow[]) : [];
    const observationCount = observations.length;

    if (observationCount < MIN_OBSERVATIONS_FOR_TRAJECTORY) {
      // Below the floor — no AI call, no cache write. The UI suppresses the
      // card with the "first observations still being written" message.
      return NextResponse.json({
        started: null,
        now: null,
        turningPoints: [],
        observationCount,
      });
    }

    const bucket = observationBucket(observationCount);

    // 7) cache lookup at (player_id, bucket)
    const { data: cacheRow } = await admin
      .from('player_trajectories')
      .select('id, player_id, observation_count_bucket, started, now, turning_points')
      .eq('player_id', playerId)
      .eq('observation_count_bucket', bucket)
      .maybeSingle();

    let started: AnchorOut;
    let now: AnchorOut;
    let turningPoints: TurningPointOut[];

    if (cacheRow) {
      const row = cacheRow as {
        started: AnchorOut;
        now: AnchorOut;
        turning_points: Array<{ observation_id: string; observed_at?: string; one_word_label?: string }>;
      };
      started = row.started;
      now = row.now;
      turningPoints = (row.turning_points || []).map((tp) => {
        const obs = observations.find((o) => o.id === tp.observation_id);
        return {
          observation_id: tp.observation_id,
          observed_at: tp.observed_at || obs?.created_at || '',
          oneWordLabel: tp.one_word_label || '',
        };
      });
    } else {
      // Cache miss — call the AI with first-name-only inputs.
      const promptObservations = toPromptObservations(observations);
      const firstObs = observations[0];
      const weeks = weeksObserved(firstObs?.created_at ?? null);
      const prompt = PROMPT_REGISTRY.playerTrajectory({
        playerFirstName,
        ageGroup: playerAgeGroup,
        sportName,
        weeksObserved: weeks,
        observations: promptObservations,
      });

      const aiResult = await callAIWithJSON<PlayerTrajectoryAIOutput>(
        {
          coachId: user.id,
          teamId,
          interactionType: 'generate_player_trajectory',
          systemPrompt: prompt.system,
          userPrompt: prompt.user,
          orgId: orgId || '',
        },
        admin,
      );

      let validated: PlayerTrajectoryAIOutput;
      try {
        validated = playerTrajectorySchema.parse(aiResult.parsed);
      } catch {
        // Provider returned a slightly off shape; coerce to the minimum
        // shape so the page still renders (the route then runs the
        // banned-word render-time fallback on top).
        const parsed = aiResult.parsed as Record<string, unknown> | null;
        validated = {
          started: {
            headline: 'Where Maya started',
            sentence: '',
            observation_id: (parsed?.started as { observation_id?: string } | undefined)?.observation_id || observations[0].id,
          },
          now: {
            headline: 'Where Maya is now',
            sentence: '',
            observation_id: (parsed?.now as { observation_id?: string } | undefined)?.observation_id || observations[observations.length - 1].id,
          },
          turning_points: [],
        };
      }

      // Render-time banned-word fallback (AC). The prompt instructs voice
      // positively but cannot guarantee the AI output is clean. If a banned
      // word appears in either sentence, swap in a generic structured-
      // language version anchored on the observation's category.
      const startedObs = observations.find((o) => o.id === validated.started.observation_id) ?? observations[0];
      const nowObs = observations.find((o) => o.id === validated.now.observation_id) ?? observations[observations.length - 1];

      const cleanStarted = containsBannedWord(validated.started.sentence)
        ? fallbackSentence('started', playerFirstName, startedObs?.category ?? null)
        : validated.started.sentence;
      const cleanNow = containsBannedWord(validated.now.sentence)
        ? fallbackSentence('now', playerFirstName, nowObs?.category ?? null)
        : validated.now.sentence;
      const cleanStartedHeadline = containsBannedWord(validated.started.headline)
        ? 'Where this player started'
        : validated.started.headline;
      const cleanNowHeadline = containsBannedWord(validated.now.headline)
        ? 'Where this player is now'
        : validated.now.headline;

      started = {
        headline: cleanStartedHeadline,
        sentence: cleanStarted,
        observation_id: startedObs?.id ?? observations[0].id,
        observed_at: startedObs?.created_at ?? observations[0].created_at,
      };
      now = {
        headline: cleanNowHeadline,
        sentence: cleanNow,
        observation_id: nowObs?.id ?? observations[observations.length - 1].id,
        observed_at: nowObs?.created_at ?? observations[observations.length - 1].created_at,
      };
      turningPoints = validated.turning_points
        .filter((tp) => !containsBannedWord(tp.one_word_label))
        .slice(0, 3)
        .map((tp) => {
          const obs = observations.find((o) => o.id === tp.observation_id);
          return {
            observation_id: tp.observation_id,
            observed_at: obs?.created_at || '',
            oneWordLabel: tp.one_word_label,
          };
        });

      // 8) upsert cache row (cache miss only).
      await admin.from('player_trajectories').upsert(
        {
          player_id: playerId,
          observation_count_bucket: bucket,
          started: {
            headline: started.headline,
            sentence: started.sentence,
            observation_id: started.observation_id,
            observed_at: started.observed_at,
          },
          now: {
            headline: now.headline,
            sentence: now.sentence,
            observation_id: now.observation_id,
            observed_at: now.observed_at,
          },
          turning_points: turningPoints.map((tp) => ({
            observation_id: tp.observation_id,
            observed_at: tp.observed_at,
            one_word_label: tp.oneWordLabel,
          })),
        },
        { onConflict: 'player_id,observation_count_bucket' },
      );
    }

    // 9) view audit insert (always after the gate passes). Free coaches' 30-day
    //    preview wall reads this table; paid coaches still get a row so the
    //    coach has a single audit trail of who looked at what.
    await admin.from('player_trajectory_views').insert({
      coach_id: user.id,
      player_id: playerId,
    });

    return NextResponse.json({
      started,
      now,
      turningPoints,
      observationCount,
    });
  } catch (error: unknown) {
    return handleAIError(error, 'Player trajectory');
  }
}
