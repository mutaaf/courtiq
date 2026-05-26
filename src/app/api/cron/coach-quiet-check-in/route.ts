/**
 * POST /api/cron/coach-quiet-check-in
 *
 * Ticket 0042 — the polite "Still coaching this season?" email a coach gets
 * after 14 quiet days, with a one-tap "Pause for 30 days" link.
 *
 * Eligibility (all four must hold):
 *   - `last_active_at <= now() - 14 days` (the coach is quiet)
 *   - `paused_until IS NULL OR paused_until <= now()` (not currently paused)
 *   - no `preferences.quiet_check_in_<YYYY-MM-DD>` key set within the last 30 days
 *   - the coach has a non-null email
 *
 * On send, the route writes `preferences.quiet_check_in_<today>` so a second
 * invocation in the same 30-day window is a no-op.
 *
 * The "Pause for 30 days" link carries a self-contained signed token
 * (`coachId.pausedUntilIso.<hmac>`) so the public page at /account/pause can
 * verify + apply the pause without a separate DB lookup.
 *
 * Protected by CRON_SECRET, mirroring weekly-digest.
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { signPauseToken } from '@/lib/coach-pause-utils';
import {
  buildQuietCheckInSubject,
  buildQuietCheckInHtml,
  hasRecentQuietCheckIn,
  isCoachQuiet,
  markQuietCheckInSent,
} from '@/lib/coach-quiet-check-in-utils';
import { isCoachPaused } from '@/lib/coach-pause-utils';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';
const BATCH_SIZE = 50;
const PAUSE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CoachRow {
  id: string;
  email: string | null;
  full_name: string | null;
  preferences: Record<string, unknown> | null;
  paused_until: string | null;
  last_active_at: string | null;
}

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = await createServiceSupabase();
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Target pause date — the token carries the exact ISO so the page writes
  // paused_until to the same instant without re-deriving on the server.
  const pausedUntilIso = new Date(now.getTime() + PAUSE_DAYS * DAY_MS).toISOString();

  let offset = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    const { data: coaches, error: coachesErr } = await admin
      .from('coaches')
      .select('id, email, full_name, preferences, paused_until, last_active_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (coachesErr) {
      console.error('[coach-quiet-check-in] DB error fetching coaches:', coachesErr.message);
      return NextResponse.json({ error: coachesErr.message }, { status: 500 });
    }

    if (!coaches || coaches.length === 0) break;

    for (const coach of coaches as CoachRow[]) {
      try {
        if (!coach.email) {
          totalSkipped++;
          continue;
        }
        // Currently paused → silent, no email even when 14+ days quiet.
        if (isCoachPaused(coach, now)) {
          totalSkipped++;
          continue;
        }
        // Not quiet enough yet.
        if (!isCoachQuiet(coach, now, 14)) {
          totalSkipped++;
          continue;
        }
        // Already emailed within the last 30 days.
        if (hasRecentQuietCheckIn(coach.preferences, now, 30)) {
          totalSkipped++;
          continue;
        }
        if (!secret) {
          // Without a CRON_SECRET we can't sign a token at all. Skip rather
          // than mint an unsigned link.
          totalSkipped++;
          continue;
        }

        const token = signPauseToken({ coachId: coach.id, pausedUntilIso, secret });
        const pauseUrl = `${APP_URL}/account/pause?token=${encodeURIComponent(token)}`;
        const stillCoachingUrl = `${APP_URL}/account`;

        const subject = buildQuietCheckInSubject();
        const html = buildQuietCheckInHtml({
          coachFullName: coach.full_name ?? 'Coach',
          pauseUrl,
          stillCoachingUrl,
        });

        const result = await sendEmail({ to: coach.email, subject, html });

        if (result.success) {
          const updatedPrefs = markQuietCheckInSent(coach.preferences, todayStr);
          await admin.from('coaches').update({ preferences: updatedPrefs }).eq('id', coach.id);
          totalSent++;
        } else {
          console.error('[coach-quiet-check-in] send failed:', coach.email, result.error);
          totalErrors++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[coach-quiet-check-in] unexpected error for coach', coach.id, msg);
        totalErrors++;
      }
    }

    if (coaches.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `[coach-quiet-check-in] done — sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors}`,
  );
  return NextResponse.json({
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
  });
}
