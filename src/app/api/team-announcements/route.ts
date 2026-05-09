import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { isValidTitle, isValidBody, MAX_TITLE_LENGTH, MAX_BODY_LENGTH } from '@/lib/announcement-utils';
import { sendEmail } from '@/lib/email';
import { announcementAlertEmail } from '@/lib/email/templates';
import { randomBytes } from 'crypto';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';

// ─── GET /api/team-announcements?team_id=xxx ─────────────────────────────────
// Returns all non-expired announcements for the team (newest first).
// Requires auth.

export async function GET(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const teamId = searchParams.get('team_id');
    if (!teamId) return NextResponse.json({ error: 'team_id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const now = new Date().toISOString();

    const { data: announcements, error } = await admin
      .from('team_announcements')
      .select('*')
      .eq('team_id', teamId)
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ announcements: announcements ?? [] });
  } catch (err) {
    console.error('[team-announcements GET]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ─── POST /api/team-announcements ─────────────────────────────────────────────
// Creates a new announcement for a team.
// Body: { team_id, title, body, expires_at? }

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { team_id, title, body: bodyText, expires_at } = body;

    if (!team_id) {
      return NextResponse.json({ error: 'team_id is required' }, { status: 400 });
    }
    if (!isValidTitle(title ?? '')) {
      return NextResponse.json(
        { error: `title must be 1–${MAX_TITLE_LENGTH} characters` },
        { status: 400 }
      );
    }
    if (!isValidBody(bodyText ?? '')) {
      return NextResponse.json(
        { error: `body must be 1–${MAX_BODY_LENGTH} characters` },
        { status: 400 }
      );
    }

    const admin = await createServiceSupabase();

    const { data: announcement, error } = await admin
      .from('team_announcements')
      .insert({
        team_id,
        created_by: user.id,
        title: title.trim(),
        body: bodyText.trim(),
        expires_at: expires_at ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    // ── Non-blocking: email parents who have an email on file ───────────────
    let emailsSent = 0;
    try {
      emailsSent = await sendAnnouncementEmails({
        admin,
        coachId: user.id,
        teamId: team_id,
        title: title.trim(),
        body: bodyText.trim(),
      });
    } catch (emailErr) {
      console.error('[team-announcements] email send error (non-fatal):', emailErr);
    }

    return NextResponse.json({ announcement, emailsSent }, { status: 201 });
  } catch (err) {
    console.error('[team-announcements POST]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// ── Helper: fetch players, get/create share tokens, send emails ──────────────

async function sendAnnouncementEmails(args: {
  admin: Awaited<ReturnType<typeof createServiceSupabase>>;
  coachId: string;
  teamId: string;
  title: string;
  body: string;
}): Promise<number> {
  const { admin, coachId, teamId, title, body } = args;

  // Fetch coach name + team name in parallel
  const [coachRes, teamRes] = await Promise.all([
    admin.from('coaches').select('full_name').eq('id', coachId).single(),
    admin.from('teams').select('name').eq('id', teamId).single(),
  ]);
  const coachName = coachRes.data?.full_name ?? 'Your Coach';
  const teamName  = teamRes.data?.name ?? 'Your Team';

  // Fetch players with parent email
  const { data: players } = await admin
    .from('players')
    .select('id, name, parent_email, parent_name')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .not('parent_email', 'is', null);

  if (!players?.length) return 0;

  const playerIds = players.map((p) => p.id);

  // Fetch existing permanent share tokens in one query
  const { data: existingTokens } = await admin
    .from('parent_shares')
    .select('player_id, share_token')
    .in('player_id', playerIds)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .is('expires_at', null)
    .order('created_at', { ascending: false });

  // Build token map (keep first/most-recent token per player)
  const tokenMap = new Map<string, string>();
  existingTokens?.forEach((t) => {
    if (!tokenMap.has(t.player_id)) tokenMap.set(t.player_id, t.share_token);
  });

  // Create tokens for players who don't have one
  const needingTokens = players.filter((p) => !tokenMap.has(p.id));
  if (needingTokens.length > 0) {
    const newRows = needingTokens.map((p) => ({
      player_id: p.id,
      team_id: teamId,
      coach_id: coachId,
      share_token: randomBytes(16).toString('hex'),
      pin: null,
      include_observations: false,
      include_development_card: true,
      include_report_card: true,
      include_highlights: true,
      include_goals: true,
      include_drills: true,
      include_coach_note: true,
      include_skill_challenges: true,
      custom_message: null,
      is_active: true,
      expires_at: null,
    }));
    const { data: inserted } = await admin
      .from('parent_shares')
      .insert(newRows)
      .select('player_id, share_token');
    inserted?.forEach((t) => tokenMap.set(t.player_id, t.share_token));
  }

  // Send emails in parallel — failures don't block each other
  const emailResults = await Promise.allSettled(
    players.map(async (player) => {
      const token = tokenMap.get(player.id);
      if (!token || !player.parent_email) return { success: false };
      const shareUrl = `${APP_URL}/share/${token}`;
      const { subject, html } = announcementAlertEmail({
        parentName: player.parent_name ?? null,
        playerName: player.name,
        coachName,
        teamName,
        title,
        body,
        shareUrl,
      });
      return sendEmail({ to: player.parent_email, subject, html });
    }),
  );

  return emailResults.filter(
    (r) => r.status === 'fulfilled' && (r.value as any)?.success,
  ).length;
}

// ─── DELETE /api/team-announcements?id=xxx ────────────────────────────────────

export async function DELETE(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const admin = await createServiceSupabase();
    const { error } = await admin.from('team_announcements').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[team-announcements DELETE]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
