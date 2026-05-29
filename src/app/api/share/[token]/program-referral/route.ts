/**
 * Ticket 0050 — POST /api/share/[token]/program-referral.
 *
 * Public route (lives under /api/share/ — already in publicPaths). A parent
 * on /share/[token] submits the new modal with their first name + the
 * director's first name + the director's email + an optional one-line note,
 * and this route writes one row to `program_referrals` and sends ONE email to
 * the director with a link back to the same /share/[token] carrying a signed
 * `pr` parameter the director-side page can verify.
 *
 * Dedup: a re-submit for the same (share_token, director_email_hash) within
 * 30 days returns `{ alreadySent: true }` and does NOT fire a second email.
 *
 * Rate limit: max 3 submits per share_token per 24h (in-memory). A 4th
 * submit returns 429. The director email IS volunteered by the parent;
 * deliverability is out of scope (LESSONS#0050 — Out of Scope).
 *
 * Service-role only for the DB write. The route never trusts a
 * client-supplied identifier (LESSONS#0039) — the signed_director_id is
 * generated server-side from the share token + the director's hashed email.
 */
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import {
  checkProgramReferralRate,
  hashDirectorEmail,
  isValidEmailShape,
  isWithinDedupWindow,
  signDirectorId,
} from '@/lib/program-referral-utils';
import { buildProgramReferralEmail } from '@/lib/program-referral-email';
import { sendEmail } from '@/lib/email';

const APP_URL_DEFAULT = 'https://youthsportsiq.com';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required.' }, { status: 400 });
  }

  // Parse the body. A malformed JSON post returns 400 immediately — same
  // posture as the existing parent-contact route.
  let body: {
    parentFirstName?: string;
    parentEmail?: string;
    directorFirstName?: string;
    directorEmail?: string;
    note?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parentFirstName = (body.parentFirstName ?? '').trim();
  const directorFirstName = (body.directorFirstName ?? '').trim();
  const directorEmail = (body.directorEmail ?? '').trim();
  const parentEmail = body.parentEmail?.trim() || null;
  const note = body.note?.trim() || null;

  // Server-side validation. The modal validates client-side too — this is
  // defense in depth (AGENTS.md rule 5 / LESSONS#0023 family).
  if (!parentFirstName) {
    return NextResponse.json({ error: 'Your first name is required.' }, { status: 422 });
  }
  if (!directorFirstName) {
    return NextResponse.json({ error: "The director's first name is required." }, { status: 422 });
  }
  if (!isValidEmailShape(directorEmail)) {
    return NextResponse.json({ error: "The director's email is required." }, { status: 422 });
  }
  if (parentEmail && !isValidEmailShape(parentEmail)) {
    return NextResponse.json({ error: 'Your email is not a valid address.' }, { status: 422 });
  }
  if (note && note.length > 500) {
    return NextResponse.json({ error: 'Note is too long.' }, { status: 422 });
  }

  // Per-share-token rate limit. The map is in-memory single-process — same
  // posture as the fallback in src/lib/rate-limit.ts. 3 submits / 24h is
  // enough for a multi-director league (the most common case is 1–2) and
  // tight enough to slow a bot.
  const rate = checkProgramReferralRate(token);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many submissions for this report today. Please try again tomorrow.' },
      { status: 429 },
    );
  }

  const admin = await createServiceSupabase();

  // Validate the token against parent_shares (public route — no auth header).
  // is_active false / not-found both return 404; we never leak which.
  const { data: share } = await admin
    .from('parent_shares')
    .select('id, team_id, coach_id, is_active, expires_at')
    .eq('share_token', token)
    .eq('is_active', true)
    .single();

  if (!share) {
    return NextResponse.json({ error: 'Share link not found or inactive.' }, { status: 404 });
  }
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Share link has expired.' }, { status: 410 });
  }

  const directorEmailHash = hashDirectorEmail(directorEmail);

  // Dedup: did the SAME parent already refer the SAME director on this same
  // report within 30 days? If yes, return 200 with `alreadySent: true` and
  // skip the email. LESSONS#0023 family — keep the raw email out of the
  // index; query on the hash.
  const { data: prior } = await admin
    .from('program_referrals')
    .select('id, sent_at')
    .eq('share_token', token)
    .eq('director_email_hash', directorEmailHash)
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prior && isWithinDedupWindow(prior.sent_at)) {
    return NextResponse.json({
      success: true,
      alreadySent: true,
      directorFirstName,
    });
  }

  // Sign the director-id. The verify on the share page reads this from the
  // `?pr=` query parameter; we NEVER trust a client-supplied id (LESSONS#0039).
  const secret = process.env.CRON_SECRET || '';
  if (!secret) {
    // No secret means signing/verifying are impossible. Fail closed rather
    // than ship an unverifiable link.
    console.error('[program-referral] CRON_SECRET is not set; cannot sign director id');
    return NextResponse.json(
      { error: 'Server is not configured to send program referrals.' },
      { status: 500 },
    );
  }
  const signedDirectorId = signDirectorId({
    shareToken: token,
    directorEmailHash,
    secret,
  });

  // Insert the audit row. The row has NO minor data (no player_id, no
  // observation excerpt). LESSONS#0050 family — the source coach is resolved
  // on read via parent_shares -> teams -> coaches, never copied here.
  const { error: insertErr } = await admin.from('program_referrals').insert({
    share_token: token,
    parent_first_name: parentFirstName,
    parent_email: parentEmail,
    director_first_name: directorFirstName,
    director_email: directorEmail,
    director_email_hash: directorEmailHash,
    note,
    signed_director_id: signedDirectorId,
  });

  if (insertErr) {
    console.error('[program-referral] insert error:', insertErr);
    return NextResponse.json(
      { error: 'Failed to record referral. Please try again.' },
      { status: 500 },
    );
  }

  // Best-effort: resolve the program name (the coach's org name) for the
  // email body. A degraded read just falls back to "your program" copy —
  // never blocks the send.
  let programName: string | null = null;
  try {
    const { data: team } = await admin
      .from('teams')
      .select('org_id')
      .eq('id', share.team_id)
      .single();
    if (team?.org_id) {
      const { data: org } = await admin
        .from('organizations')
        .select('name')
        .eq('id', team.org_id)
        .single();
      programName = org?.name ?? null;
    }
  } catch {
    programName = null;
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || APP_URL_DEFAULT;
  const shareUrl = `${appUrl}/share/${token}?pr=${encodeURIComponent(signedDirectorId)}`;

  const email = buildProgramReferralEmail({
    parentFirstName,
    directorFirstName,
    programName,
    shareUrl,
    note,
  });

  const sendResult = await sendEmail({
    to: directorEmail,
    subject: email.subject,
    html: email.html,
  });

  if (!sendResult.success) {
    // The row is already written; we surface the failure so the form can
    // show a friendly retry without re-inserting (the dedup query catches
    // the next attempt within 30 days).
    console.error('[program-referral] sendEmail failed:', sendResult.error);
  }

  return NextResponse.json({
    success: true,
    alreadySent: false,
    directorFirstName,
  });
}
