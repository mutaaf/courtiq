/**
 * Bulk-create past sessions + retroactively run AI segmentation on per-session
 * notes. Used by the "Catch up your season" flow at /sessions/backfill.
 *
 * Body: {
 *   teamId: string;
 *   sessions: Array<{
 *     date: string;            // YYYY-MM-DD, must be today or earlier
 *     type: SessionType;
 *     opponent?: string;       // games/scrimmages/tournaments only
 *     location?: string;
 *     notes?: string;          // free-form recap; AI-segments into observations
 *     curriculum_week?: number;
 *   }>;
 * }
 *
 * Response: { sessions: Array<{ id, date, type, observations_created }>, errors }
 *
 * Behavior:
 *  - All session inserts run first; partial success is reported in `errors`
 *  - Notes are segmented one session at a time so a transient AI failure on
 *    session 3 doesn't sink sessions 4–N.
 *  - The endpoint is idempotency-friendly only at the row level — re-running
 *    will create duplicate sessions for the same date. We don't dedupe on
 *    purpose: a coach legitimately may have had two practices the same day.
 */

import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { buildAIContext } from '@/lib/ai/context-builder';
import { PROMPT_REGISTRY } from '@/lib/ai/prompts';
import { callAIWithJSON } from '@/lib/ai/client';
import { findPlayerByName } from '@/lib/player-match';
import type { SessionType } from '@/types/database';

interface BackfillSession {
  date: string;
  type: SessionType;
  opponent?: string;
  location?: string;
  notes?: string;
  curriculum_week?: number;
}

const VALID_TYPES = new Set<SessionType>(['practice', 'game', 'scrimmage', 'tournament', 'training']);
const MAX_SESSIONS_PER_REQUEST = 30;
const MAX_NOTES_LENGTH = 5000;

function validateDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T12:00:00');
  if (Number.isNaN(d.getTime())) return false;
  // Cap at end-of-today UTC — backfill is for past sessions only.
  const tomorrow = new Date();
  tomorrow.setUTCHours(0, 0, 0, 0);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return d.getTime() < tomorrow.getTime();
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const teamId: string | undefined = body?.teamId;
  if (!teamId) return NextResponse.json({ error: 'teamId required' }, { status: 400 });

  const rawSessions: BackfillSession[] = Array.isArray(body?.sessions) ? body.sessions : [];
  if (rawSessions.length === 0) return NextResponse.json({ error: 'sessions array required' }, { status: 400 });
  if (rawSessions.length > MAX_SESSIONS_PER_REQUEST) {
    return NextResponse.json(
      { error: `Maximum ${MAX_SESSIONS_PER_REQUEST} sessions per request` },
      { status: 400 },
    );
  }

  // Validate
  const sanitized: BackfillSession[] = [];
  const errors: Array<{ index: number; reason: string }> = [];
  rawSessions.forEach((s, i) => {
    if (!s || typeof s !== 'object') {
      errors.push({ index: i, reason: 'invalid session object' });
      return;
    }
    if (!validateDate(s.date)) {
      errors.push({ index: i, reason: 'date must be YYYY-MM-DD and not in the future' });
      return;
    }
    if (!VALID_TYPES.has(s.type)) {
      errors.push({ index: i, reason: 'invalid type' });
      return;
    }
    sanitized.push({
      date: s.date,
      type: s.type,
      opponent: typeof s.opponent === 'string' ? s.opponent.trim().slice(0, 120) || undefined : undefined,
      location: typeof s.location === 'string' ? s.location.trim().slice(0, 120) || undefined : undefined,
      notes: typeof s.notes === 'string' ? s.notes.trim().slice(0, MAX_NOTES_LENGTH) || undefined : undefined,
      curriculum_week:
        typeof s.curriculum_week === 'number' && s.curriculum_week >= 1 && s.curriculum_week <= 52
          ? s.curriculum_week
          : undefined,
    });
  });

  if (sanitized.length === 0) {
    return NextResponse.json({ error: 'No valid sessions to insert', errors }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  // Verify the coach owns this team
  const { data: teamCoach } = await admin
    .from('team_coaches')
    .select('team_id')
    .eq('coach_id', user.id)
    .eq('team_id', teamId)
    .limit(1)
    .single();
  if (!teamCoach) return NextResponse.json({ error: 'Team not found or not yours' }, { status: 404 });

  // Insert sessions
  const rows = sanitized.map((s) => ({
    team_id: teamId,
    coach_id: user.id,
    type: s.type,
    date: s.date,
    location: s.location ?? null,
    opponent:
      s.type === 'game' || s.type === 'scrimmage' || s.type === 'tournament' ? s.opponent ?? null : null,
    curriculum_week: s.curriculum_week ?? null,
  }));

  const { data: insertedSessions, error: insertErr } = await admin
    .from('sessions')
    .insert(rows)
    .select('id, date, type');

  if (insertErr || !insertedSessions) {
    return NextResponse.json({ error: insertErr?.message || 'Insert failed' }, { status: 500 });
  }

  // Pre-fetch coach + players + AI context (used per-session below).
  const [{ data: coach }, { data: players }, aiContext] = await Promise.all([
    admin.from('coaches').select('org_id').eq('id', user.id).single(),
    admin
      .from('players')
      .select('id, name, nickname, name_variants')
      .eq('team_id', teamId)
      .eq('is_active', true),
    buildAIContext(teamId, admin, { lightweight: true }),
  ]);

  const result: Array<{
    id: string;
    date: string;
    type: SessionType;
    observations_created: number;
  }> = [];

  // Segment notes per session (sequential to keep AI failures localized)
  for (let i = 0; i < insertedSessions.length; i++) {
    const session = insertedSessions[i];
    const sourceNote = sanitized[i].notes;
    if (!sourceNote || sourceNote.length < 10) {
      result.push({ id: session.id, date: session.date, type: session.type, observations_created: 0 });
      continue;
    }

    let observationsCreated = 0;
    try {
      const prompt = PROMPT_REGISTRY.segmentTranscript({ ...aiContext, transcript: sourceNote }) as {
        system: string;
        user: string;
        cacheableContext?: string;
      };
      const aiResult = await callAIWithJSON<{
        observations?: Array<{
          player_name?: string;
          category?: string;
          sentiment?: string;
          text?: string;
          skill_id?: string | null;
        }>;
      }>(
        {
          coachId: user.id,
          teamId,
          orgId: coach?.org_id,
          interactionType: 'segment_transcript',
          systemPrompt: prompt.system,
          userPrompt: prompt.user,
          cacheableContext: prompt.cacheableContext,
        },
        admin,
      );
      const parsed = aiResult.parsed;

      const obs = (parsed?.observations || []).filter((o) => o.text && o.text.trim().length > 2);
      if (obs.length > 0) {
        const obsRows = obs.map((o) => ({
          team_id: teamId,
          coach_id: user.id,
          session_id: session.id,
          player_id: o.player_name ? findPlayerByName(o.player_name, (players || []) as any) : null,
          category: o.category || 'General',
          sentiment: (o.sentiment as any) || 'neutral',
          text: (o.text as string).trim(),
          raw_text: sourceNote,
          source: 'import',
          ai_parsed: true,
          coach_edited: false,
          skill_id: o.skill_id || null,
          is_synced: true,
        }));
        const { error: obsErr } = await admin.from('observations').insert(obsRows);
        if (!obsErr) observationsCreated = obsRows.length;
        else errors.push({ index: i, reason: `obs insert: ${obsErr.message}` });
      }
    } catch (err) {
      errors.push({
        index: i,
        reason: `AI segmentation: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }

    result.push({
      id: session.id,
      date: session.date,
      type: session.type,
      observations_created: observationsCreated,
    });
  }

  return NextResponse.json({ sessions: result, errors });
}
