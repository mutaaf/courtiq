import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import {
  validateObserverToken,
  checkObserverRateLimit,
  isValidTemplateId,
  getTemplateById,
  buildObservationPayload,
} from '@/lib/observer-utils';

type Params = { params: Promise<{ token: string }> };

// ── GET — return session info + roster ────────────────────────────────────────

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params;
  const validated = validateObserverToken(token);
  if (!validated) {
    return NextResponse.json(
      { error: 'Invalid or expired observer link' },
      { status: 401 }
    );
  }

  const { sessionId } = validated;
  const supabase = await createServiceSupabase();

  const { data: session } = await supabase
    .from('sessions')
    .select('id, team_id, coach_id, type, date, location, opponent')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: team } = await supabase
    .from('teams')
    .select('name, age_group')
    .eq('id', session.team_id)
    .single();

  const { data: coach } = await supabase
    .from('coaches')
    .select('full_name')
    .eq('id', session.coach_id)
    .single();

  const { data: players } = await supabase
    .from('players')
    .select('id, name, nickname, jersey_number')
    .eq('team_id', session.team_id)
    .eq('is_active', true)
    .order('name');

  return NextResponse.json({
    session: {
      id: session.id,
      type: session.type,
      date: session.date,
      location: session.location,
      opponent: session.opponent,
    },
    team: team ?? null,
    coachName: coach?.full_name ?? null,
    players: players ?? [],
    teamId: session.team_id,
    coachId: session.coach_id,
  });
}

// ── POST — save a single template observation ─────────────────────────────────

export async function POST(request: Request, { params }: Params) {
  const { token } = await params;
  const validated = validateObserverToken(token);
  if (!validated) {
    return NextResponse.json(
      { error: 'Invalid or expired observer link' },
      { status: 401 }
    );
  }

  // IP-based rate limiting — 50 observations per hour
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  if (!checkObserverRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many observations. Please slow down.' },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { templateId, playerId } = body as {
    templateId?: string;
    playerId?: string;
  };

  if (!templateId || !playerId) {
    return NextResponse.json(
      { error: 'templateId and playerId are required' },
      { status: 400 }
    );
  }

  if (!isValidTemplateId(templateId)) {
    return NextResponse.json({ error: 'Invalid template' }, { status: 400 });
  }

  const { sessionId } = validated;
  const supabase = await createServiceSupabase();

  // Verify the session and player belong to the same team
  const { data: session } = await supabase
    .from('sessions')
    .select('team_id, coach_id')
    .eq('id', sessionId)
    .single();

  if (!session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: player } = await supabase
    .from('players')
    .select('id')
    .eq('id', playerId)
    .eq('team_id', session.team_id)
    .single();

  if (!player) {
    return NextResponse.json(
      { error: 'Player not found on this team' },
      { status: 404 }
    );
  }

  const template = getTemplateById(templateId)!;
  const payload = buildObservationPayload(
    template,
    playerId,
    sessionId,
    session.team_id,
    session.coach_id
  );

  const { data: obs, error } = await supabase
    .from('observations')
    .insert(payload)
    .select('id')
    .single();

  if (error) {
    console.error('Observer observation insert error:', error);
    return NextResponse.json({ error: 'Failed to save observation' }, { status: 500 });
  }

  return NextResponse.json({ id: obs.id }, { status: 201 });
}
