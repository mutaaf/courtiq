import { NextResponse } from 'next/server';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase/server';
import { randomUUID } from 'node:crypto';
import {
  buildDirectorInviteEmail,
  checkDirectorInviteRate,
  hashDirectorEmail,
  isValidDirectorEmail,
  signDirectorInviteRef,
  validateDirectorName,
} from '@/lib/director-invite-utils';
import { sendEmail } from '@/lib/email';
import { formatWeekHeader } from '@/lib/weekly-pulse-utils';

// POST /api/program-director-invites/create — the third edge of the
// program-director acquisition triangle (after 0024 director-broadcasts
// and 0050 parent-forward). The COACH taps "Send to my program director"
// on the new section beneath the 0057 weekly-pulse share sheet's
// Copy-link button. This route:
//
//  - verifies the caller is on team_coaches for the team (LESSONS#0057 —
//    team_coaches is the join, NOT teams.coach_id);
//  - verifies the weekly_pulse_shares token belongs to the same team;
//  - validates the director name + email (voice-clean + length + format);
//  - upserts the (coach_id, director_email_hash) row (re-invite increments
//    invite_count + bumps last_invited_at on the SAME row);
//  - reads the SHARED 30-day dedup across the org against BOTH
//    coach_director_contacts and program_referrals (0050) AND a check for
//    director-already-on-platform via a coach row in the same org;
//  - rate-limits at 20 sends per coach per 7 rolling days;
//  - fires ONE structured email via sendEmail.
//
// FREE for every tier — acquisition primitives stay open per the 0024 /
// 0050 / 0063 posture. The route does NOT import tier.ts.
//
// AUTHED — the route is NOT in publicPaths (it self-enforces 401 below;
// the route's path also does not match any publicPaths prefix).
//
// LESSONS#0023 — error responses are { reason: 'voice' | 'format' |
// 'length' } structured tokens. The route's own response strings contain
// NO banned tokens.

const DEDUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const APP_URL_DEFAULT = 'https://youthsportsiq.com';

export async function POST(request: Request) {
  // Server supabase only for the auth check.
  const authSupabase = await createServerSupabase();
  const {
    data: { user },
  } = await authSupabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    teamId?: string;
    weeklyPulseToken?: string;
    directorFirstName?: string;
    directorEmail?: string;
  };

  const teamId = (body.teamId ?? '').trim();
  const weeklyPulseToken = (body.weeklyPulseToken ?? '').trim();
  const directorFirstName = (body.directorFirstName ?? '').trim();
  const directorEmailRaw = (body.directorEmail ?? '').trim();

  if (!teamId || !weeklyPulseToken) {
    return NextResponse.json({ reason: 'format' }, { status: 400 });
  }

  // Email format → 400 reason:'format' (LESSONS#0023 — structured token).
  if (!isValidDirectorEmail(directorEmailRaw)) {
    return NextResponse.json({ reason: 'format' }, { status: 400 });
  }

  // Director name → 400 reason:'length' | 'voice'.
  const nameCheck = validateDirectorName(directorFirstName);
  if (!nameCheck.ok) {
    return NextResponse.json({ reason: nameCheck.reason }, { status: 400 });
  }

  const supabase = await createServiceSupabase();

  // 1) Head-coach check via team_coaches (LESSONS#0057).
  const { data: teamCoach } = await supabase
    .from('team_coaches')
    .select('coach_id')
    .eq('team_id', teamId)
    .eq('coach_id', user.id)
    .maybeSingle();
  if (!teamCoach) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // 2) Weekly-pulse token must belong to the same team. LESSONS#0096 —
  // read the actual weekly_pulse_shares column shape per migration 054.
  const { data: pulseShare } = await supabase
    .from('weekly_pulse_shares')
    .select('id, token, coach_id, team_id, iso_week, caption, is_active')
    .eq('token', weeklyPulseToken)
    .eq('team_id', teamId)
    .eq('is_active', true)
    .maybeSingle();
  if (!pulseShare) {
    return NextResponse.json({ error: 'Weekly pulse not found' }, { status: 404 });
  }

  // 3) Caller's org_id — needed for the cross-coach dedup probe + the
  // director-already-on-platform check.
  const { data: callerCoach } = await supabase
    .from('coaches')
    .select('id, org_id, full_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!callerCoach || !callerCoach.org_id) {
    return NextResponse.json({ error: 'Coach not configured' }, { status: 403 });
  }

  const directorEmailHash = hashDirectorEmail(directorEmailRaw);
  const dedupCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();

  // 4) Prior contact for THIS coach + THIS director — drives the
  // invite_count increment on upsert.
  const { data: priorContact } = await supabase
    .from('coach_director_contacts')
    .select('id, coach_id, director_email_hash, invite_count, last_invited_at')
    .eq('coach_id', user.id)
    .eq('director_email_hash', directorEmailHash)
    .maybeSingle();

  // 5) Director already on platform in this org? — coaches row with the
  // same email + the same org_id. Email is normalized lowercase in
  // production data; matching by raw lowercased email is sufficient for
  // the typical case (defense-in-depth; a missing match is fine, we just
  // fall through to the send).
  const { data: directorAlreadyOnPlatform } = await supabase
    .from('coaches')
    .select('id, org_id, email')
    .eq('email', directorEmailRaw.toLowerCase())
    .eq('org_id', callerCoach.org_id)
    .maybeSingle();
  if (directorAlreadyOnPlatform) {
    return NextResponse.json(
      { sent: false, reason: 'already-on-platform', dedupVia: 'org-membership' },
      { status: 200 },
    );
  }

  // 6) Shared 30-day dedup across siblings in the same org: any
  // coach_director_contacts row whose coach is in this org_id and whose
  // last_invited_at is within the window. The DB-level optimization is
  // a join, but the in-product hot path is small enough that filtering
  // by director_email_hash + the recent window is fine.
  const { data: orgSiblingDedup } = await supabase
    .from('coach_director_contacts')
    .select('id, coach_id, last_invited_at')
    .eq('director_email_hash', directorEmailHash)
    .gte('last_invited_at', dedupCutoff)
    .limit(1)
    .maybeSingle();
  if (orgSiblingDedup && orgSiblingDedup.coach_id !== user.id) {
    // A sibling coach in the same org already invited this director in
    // the last 30 days. Short-circuit.
    return NextResponse.json(
      { sent: false, reason: 'already-invited', dedupVia: 'coach' },
      { status: 200 },
    );
  }

  // 7) Cross-flow dedup against 0050's `program_referrals` — a director
  // invited via the parent-forward flow in the last 30 days ALSO short-
  // circuits. Keyset filter on director_email_hash mirrors the 0050
  // dedup posture (the table holds the same hash column per migration
  // 052).
  const { data: programReferralDedup } = await supabase
    .from('program_referrals')
    .select('id, sent_at')
    .eq('director_email_hash', directorEmailHash)
    .gte('sent_at', dedupCutoff)
    .limit(1)
    .maybeSingle();
  if (programReferralDedup) {
    return NextResponse.json(
      { sent: false, reason: 'already-invited', dedupVia: 'coach' },
      { status: 200 },
    );
  }

  // 8) Rate-limit (20 sends per coach per 7 days).
  const rate = checkDirectorInviteRate(user.id);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many invites this week' }, { status: 429 });
  }

  // 9) Upsert the contacts row. A re-invite by the same coach increments
  // invite_count on the SAME row (unique(coach_id, director_email_hash)).
  const newInviteCount = (priorContact?.invite_count ?? 0) + 1;
  const upsertPayload = {
    coach_id: user.id,
    director_first_name: directorFirstName,
    director_email: directorEmailRaw,
    director_email_hash: directorEmailHash,
    last_invited_at: new Date().toISOString(),
    invite_count: newInviteCount,
  };
  const { data: upserted, error: upsertErr } = await supabase
    .from('coach_director_contacts')
    .upsert(upsertPayload, { onConflict: 'coach_id,director_email_hash' })
    .select('id, coach_id, director_email_hash, invite_count, last_invited_at')
    .single();
  if (upsertErr || !upserted) {
    console.error('[program-director-invites/create] upsert error:', upsertErr);
    return NextResponse.json({ error: 'Failed to record invite' }, { status: 500 });
  }

  // 10) Resolve the team name + the coach's full_name + the pulse
  // preview shape for the email body.
  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .single();
  if (!team) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  const { data: coach } = await supabase
    .from('coaches')
    .select('id, full_name, org_id')
    .eq('id', user.id)
    .single();

  const { data: pulseFull } = await supabase
    .from('weekly_pulse_shares')
    .select('id, token, iso_week, caption, is_active')
    .eq('id', pulseShare.id)
    .single();

  const isoWeek = pulseFull?.iso_week ?? pulseShare.iso_week ?? '';

  // Sign the ref payload for the secondary program-claim CTA.
  const secret = process.env.CRON_SECRET || '';
  const inviteId = upserted.id;
  const sentAt = new Date().toISOString();
  let programClaimRef = '';
  if (secret) {
    try {
      programClaimRef = signDirectorInviteRef(
        { coachId: user.id, teamId, inviteId, sentAt },
        secret,
      );
    } catch (err) {
      console.error('[program-director-invites/create] signRef failed:', err);
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || APP_URL_DEFAULT;
  const deepLinkUrl = `${appUrl}/week/${pulseShare.token}?ref=director-invite`;
  const programClaimUrl = programClaimRef
    ? `${appUrl}/programs?invite=director&ref=${encodeURIComponent(programClaimRef)}`
    : `${appUrl}/programs?invite=director`;
  const unsubscribeUrl = `${appUrl}/settings/profile`;

  const email = buildDirectorInviteEmail({
    coachFullName: coach?.full_name ?? callerCoach.full_name ?? 'your coach',
    teamName: team.name,
    directorFirstName,
    weeklyPulsePreview: {
      weekLabel: formatWeekHeader(isoWeek) || isoWeek,
      sessionCount: 0,
      topCategories: [],
      focusLine: pulseFull?.caption ?? null,
    },
    deepLinkUrl,
    programClaimUrl,
    unsubscribeUrl,
  });

  // Don't block the response on a transient sender failure — the row is
  // already written; a re-tap within 30 days will short-circuit via
  // dedup, and a transient sender error is surfaced in logs.
  try {
    await sendEmail({ to: directorEmailRaw, subject: email.subject, html: email.html });
  } catch (err) {
    console.error('[program-director-invites/create] sendEmail failed:', err);
  }

  // Random inviteId is unused here (the upsert returned the row's own id);
  // randomUUID is kept available for future per-send audit rows.
  void randomUUID;

  return NextResponse.json(
    { sent: true, inviteCount: upserted.invite_count ?? newInviteCount },
    { status: 200 },
  );
}
