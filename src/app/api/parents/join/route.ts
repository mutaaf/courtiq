import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import {
  verifyContactToken,
  normalizePhone,
  isValidPhone,
  matchPlayer,
} from '@/lib/parent-contact-utils';

// ─── GET /api/parents/join?token=xxx ─────────────────────────────────────────
// Returns public team info and anonymised player list for the join page.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token') ?? '';

  const payload = verifyContactToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 400 });
  }

  const admin = await createServiceSupabase();

  const { data: team } = await admin
    .from('teams')
    .select('id, name, age_group, coaches(full_name)')
    .eq('id', payload.teamId)
    .single();

  if (!team) {
    return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
  }

  const { data: players } = await admin
    .from('players')
    .select('id, name, jersey_number')
    .eq('team_id', payload.teamId)
    .eq('is_active', true)
    .order('name');

  const coachName = (team as any).coaches?.full_name ?? null;
  const coachFirst = coachName ? coachName.split(' ')[0] : null;

  return NextResponse.json({
    teamName: team.name,
    ageGroup: team.age_group,
    coachFirstName: coachFirst,
    players: (players || []).map((p) => ({
      firstName: p.name.split(' ')[0],
      jerseyNumber: p.jersey_number,
    })),
  });
}

// ─── POST /api/parents/join ───────────────────────────────────────────────────
// Parent submits their contact info. Fuzzy-matches player, updates record.
export async function POST(request: Request) {
  let body: {
    token?: string;
    jerseyNumber?: string;
    playerFirstName?: string;
    parentName?: string;
    parentPhone?: string;
    parentEmail?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const { token = '', jerseyNumber, playerFirstName, parentName, parentPhone, parentEmail } = body;

  const payload = verifyContactToken(token);
  if (!payload) {
    return NextResponse.json({ error: 'Invalid or expired link.' }, { status: 400 });
  }

  if (!parentName?.trim()) {
    return NextResponse.json({ error: 'Your name is required.' }, { status: 422 });
  }

  if (!parentPhone || !isValidPhone(parentPhone)) {
    return NextResponse.json({ error: 'A valid phone number is required.' }, { status: 422 });
  }

  if (!jerseyNumber && !playerFirstName) {
    return NextResponse.json({ error: 'Provide your child\'s jersey number or first name.' }, { status: 422 });
  }

  const admin = await createServiceSupabase();

  const { data: players } = await admin
    .from('players')
    .select('id, name, jersey_number')
    .eq('team_id', payload.teamId)
    .eq('is_active', true);

  if (!players?.length) {
    return NextResponse.json({ error: 'No players found on this team.' }, { status: 404 });
  }

  const matched = matchPlayer(players, jerseyNumber, playerFirstName);
  if (!matched) {
    return NextResponse.json(
      {
        error:
          jerseyNumber
            ? `No player with jersey #${jerseyNumber} found. Try their first name instead.`
            : `No player named "${playerFirstName}" found. Double-check the spelling or try their jersey number.`,
      },
      { status: 422 },
    );
  }

  const normalizedPhone = normalizePhone(parentPhone);

  const { error: updateErr } = await admin
    .from('players')
    .update({
      parent_name: parentName.trim(),
      parent_phone: normalizedPhone,
      parent_email: parentEmail?.trim() || null,
    })
    .eq('id', matched.id);

  if (updateErr) {
    console.error('[parents/join] update error:', updateErr);
    return NextResponse.json({ error: 'Failed to save. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    playerFirstName: matched.name.split(' ')[0],
  });
}
