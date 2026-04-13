import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { callAIWithJSON } from '@/lib/ai/client';
import type { GoalStatus, ProficiencyLevel } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoalSuggestion {
  skill: string;
  goal_text: string;
  target_level: ProficiencyLevel;
  rationale: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATUSES: GoalStatus[] = ['active', 'achieved', 'stalled', 'archived'];
const VALID_LEVELS: ProficiencyLevel[] = ['exploring', 'practicing', 'got_it', 'game_ready'];

// ─── GET /api/player-goals?player_id=xxx[&suggest=true] ──────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const playerId = searchParams.get('player_id');
    const suggest = searchParams.get('suggest') === 'true';

    if (!playerId) {
      return NextResponse.json({ error: 'player_id required' }, { status: 400 });
    }

    const admin = await createServiceSupabase();

    // Fetch existing goals
    const { data: goals, error } = await admin
      .from('player_goals')
      .select('*')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // If suggest=true, generate AI goal recommendations
    if (suggest) {
      // Gather context: player name, skills, recent needs-work observations
      const [playerRes, profRes, obsRes] = await Promise.all([
        admin.from('players').select('name').eq('id', playerId).single(),
        admin.from('player_skill_proficiency').select('skill, level, trend').eq('player_id', playerId),
        admin.from('observations')
          .select('skill, observation_text, sentiment, created_at')
          .eq('player_id', playerId)
          .eq('sentiment', 'needs-work')
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      const playerName = playerRes.data?.name ?? 'the player';
      const skills: { skill: string; level: string; trend: string }[] = profRes.data ?? [];
      const needsWork: { skill: string; text: string }[] = (obsRes.data ?? []).map(o => ({
        skill: o.skill ?? 'general',
        text: o.observation_text,
      }));

      const prompt = `You are a youth sports coaching assistant. Based on the data below, suggest 3 focused development goals for ${playerName}.

Current skill proficiency:
${skills.length > 0 ? skills.map(s => `- ${s.skill}: ${s.level} (${s.trend})`).join('\n') : '- No proficiency data yet'}

Recent needs-work observations:
${needsWork.length > 0 ? needsWork.map(o => `- [${o.skill}] ${o.text}`).join('\n') : '- No needs-work observations'}

Existing goals (don't duplicate these):
${(goals ?? []).filter(g => g.status === 'active').map(g => `- ${g.skill}: ${g.goal_text}`).join('\n') || '- None'}

Return a JSON array of exactly 3 goal suggestions. Each object must have:
- skill: string (skill/category name, e.g. "Dribbling" or "Defense")
- goal_text: string (specific, actionable, 1 sentence, starts with a verb, e.g. "Improve ball-handling confidence by executing successful dribble-drives in game situations")
- target_level: one of "exploring" | "practicing" | "got_it" | "game_ready"
- rationale: string (1 short sentence explaining why this goal, max 15 words)

Return only the JSON array, no other text.`;

      const suggestions = await callAIWithJSON<GoalSuggestion[]>(
        {
          coachId: user.id,
          teamId: '',
          interactionType: 'custom',
          systemPrompt: 'You are a helpful youth sports coaching assistant that outputs only valid JSON.',
          userPrompt: prompt,
        },
        admin,
      );

      return NextResponse.json({ goals: goals ?? [], suggestions: suggestions ?? [] });
    }

    return NextResponse.json({ goals: goals ?? [] });
  } catch (err) {
    console.error('[player-goals GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── POST /api/player-goals — create a goal ───────────────────────────────────

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { player_id, team_id, skill, goal_text, target_level, target_date, notes } = body;

    if (!player_id || !team_id || !skill || !goal_text) {
      return NextResponse.json({ error: 'player_id, team_id, skill, and goal_text are required' }, { status: 400 });
    }
    if (target_level && !VALID_LEVELS.includes(target_level)) {
      return NextResponse.json({ error: 'Invalid target_level' }, { status: 400 });
    }

    const admin = await createServiceSupabase();

    // Resolve coach id for this user
    const { data: coach } = await admin.from('coaches').select('id').eq('id', user.id).single();

    const { data: goal, error } = await admin
      .from('player_goals')
      .insert({
        player_id,
        team_id,
        coach_id: coach?.id ?? null,
        skill: skill.trim(),
        goal_text: goal_text.trim(),
        target_level: target_level ?? null,
        target_date: target_date ?? null,
        status: 'active',
        notes: notes?.trim() ?? null,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ goal }, { status: 201 });
  } catch (err) {
    console.error('[player-goals POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── PATCH /api/player-goals?id=xxx — update status / notes ──────────────────

export async function PATCH(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const body = await request.json();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      updates.status = body.status;
    }
    if (body.notes !== undefined) updates.notes = body.notes?.trim() ?? null;
    if (body.goal_text !== undefined) updates.goal_text = body.goal_text.trim();
    if (body.target_level !== undefined) {
      if (body.target_level && !VALID_LEVELS.includes(body.target_level)) {
        return NextResponse.json({ error: 'Invalid target_level' }, { status: 400 });
      }
      updates.target_level = body.target_level ?? null;
    }
    if (body.target_date !== undefined) updates.target_date = body.target_date ?? null;

    const admin = await createServiceSupabase();
    const { data: goal, error } = await admin
      .from('player_goals')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ goal });
  } catch (err) {
    console.error('[player-goals PATCH]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── DELETE /api/player-goals?id=xxx ─────────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const { error } = await admin.from('player_goals').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[player-goals DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
