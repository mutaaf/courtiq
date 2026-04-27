import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import {
  buildEmailPayloads,
  buildParentEmailSubject,
  buildParentEmailHtml,
  type MessageEntry,
} from '@/lib/parent-email-utils';

const MAX_MESSAGES = 30;

export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = await createServiceSupabase();

  let body: { teamId?: string; messages?: MessageEntry[]; sessionLabel?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { teamId, messages, sessionLabel } = body;

  if (!teamId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'teamId and messages required' }, { status: 400 });
  }

  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json(
      { error: `Maximum ${MAX_MESSAGES} messages per request` },
      { status: 400 },
    );
  }

  // Fetch coach info
  const { data: coach } = await admin
    .from('coaches')
    .select('full_name, org_id')
    .eq('id', user.id)
    .single();

  // Fetch team — confirms the teamId resolves to a real team
  const { data: team } = await admin
    .from('teams')
    .select('name')
    .eq('id', teamId)
    .single();

  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Fetch active roster players with parent contact info
  const { data: players } = await admin
    .from('players')
    .select('id, name, nickname, name_variants, parent_email, parent_name')
    .eq('team_id', teamId)
    .eq('is_active', true);

  const roster = players ?? [];
  const coachName = coach?.full_name || 'Your Coach';
  const teamName = team.name;

  const payloads = buildEmailPayloads(messages, roster);

  let sent = 0;
  const errors: string[] = [];

  for (const payload of payloads) {
    const result = await sendEmail({
      to: payload.to,
      subject: buildParentEmailSubject(payload.playerName, teamName),
      html: buildParentEmailHtml({
        parentName: payload.parentName,
        playerName: payload.playerName,
        coachName,
        teamName,
        message: payload.message,
        highlight: payload.highlight,
        nextFocus: payload.nextFocus,
        sessionLabel,
      }),
    });

    if (result.success) {
      sent++;
    } else {
      errors.push(`${payload.playerName}: ${result.error ?? 'send failed'}`);
    }
  }

  return NextResponse.json({
    sent,
    skipped: messages.length - sent,
    total: messages.length,
    errors,
  });
}
