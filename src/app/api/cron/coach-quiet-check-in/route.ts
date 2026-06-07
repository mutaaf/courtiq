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
import {
  buildReturningParentReactivationSubject,
  buildReturningParentReactivationHtml,
} from '@/lib/coach-reactivation-email';
import type { Json } from '@/types/database';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';
const BATCH_SIZE = 50;
const PAUSE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CoachRow {
  id: string;
  email: string | null;
  full_name: string | null;
  preferences: Json;
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

  // ─── Ticket 0072 — dormant-coach reactivation email branch ─────────────
  // Walk unconsumed, not-yet-notified `coach_reactivation_signals` from
  // the last 7 days. For each signal, send a single reactivation email
  // (subject: "<priorPlayerFirstName>'s parent is back on SportsIQ this
  // week"), then stamp notified_at so the same signal is never re-sent.
  //
  // The branch respects the EXISTING 0042 pause flag: a coach whose
  // `paused_until` is still in the future does not get the reactivation
  // email either (no new opt-out shape per the ticket's out-of-scope).
  //
  // The branch ALSO skips a coach who is NOT dormant: if they already
  // engaged this week, they don't need a reactivation pull.
  //
  // Per LESSONS#0049 / #0092 / #0100 / #0110 — this adds new from()
  // calls; the existing test for this route uses table-keyed mocks
  // (mockImplementation), so the new reads do not need queue extension.
  let totalReactSent = 0;
  let totalReactSkipped = 0;
  let totalReactErrors = 0;

  try {
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString();
    const { data: signals, error: sigErr } = await admin
      .from('coach_reactivation_signals')
      .select('id, dormant_coach_id, prior_team_id, prior_player_id, fired_at')
      .is('notified_at', null)
      .is('consumed_at', null)
      .gte('fired_at', sevenDaysAgo)
      .order('fired_at', { ascending: false });

    if (sigErr) {
      console.error('[coach-quiet-check-in] reactivation signal read error:', sigErr.message);
    } else {
      const rows = (signals ?? []) as Array<{
        id: string;
        dormant_coach_id: string;
        prior_team_id: string;
        prior_player_id: string;
        fired_at: string;
      }>;

      if (rows.length > 0) {
        // Load all unique coaches once. Allow-list.
        const coachIds = Array.from(new Set(rows.map((r) => r.dormant_coach_id)));
        const { data: coachRows } = await admin
          .from('coaches')
          .select('id, email, full_name, preferences, paused_until, last_active_at')
          .in('id', coachIds);
        const coachById = new Map<string, CoachRow>();
        for (const c of (coachRows ?? []) as CoachRow[]) coachById.set(c.id, c);

        // Allow-list. The cron NEVER reads parent_email, parent_phone, DOB,
        // medical_notes, etc. on the prior player.
        const priorPlayerIds = Array.from(new Set(rows.map((r) => r.prior_player_id)));
        const { data: priorPlayers } = await admin
          .from('players')
          .select('id, name')
          .in('id', priorPlayerIds);
        const playerNameById = new Map<string, string>();
        for (const p of (priorPlayers ?? []) as Array<{ id: string; name: string }>) {
          // First name only. Literal space (LESSONS#0061).
          playerNameById.set(p.id, (p.name || '').split(' ')[0]);
        }
        const priorTeamIds = Array.from(new Set(rows.map((r) => r.prior_team_id)));
        const { data: priorTeams } = await admin
          .from('teams')
          .select('id, name')
          .in('id', priorTeamIds);
        const teamNameById = new Map<string, string>();
        for (const t of (priorTeams ?? []) as Array<{ id: string; name: string }>) {
          teamNameById.set(t.id, t.name);
        }

        for (const sig of rows) {
          try {
            const coach = coachById.get(sig.dormant_coach_id);
            if (!coach || !coach.email) {
              totalReactSkipped++;
              continue;
            }
            // Respect existing 0042 pause flag.
            if (isCoachPaused(coach, now)) {
              totalReactSkipped++;
              continue;
            }
            // Only fire on coaches who are STILL dormant; a coach who
            // came back this week doesn't need the reactivation pull.
            if (!isCoachQuiet(coach, now, 14)) {
              totalReactSkipped++;
              continue;
            }

            const playerFirstName = playerNameById.get(sig.prior_player_id) || '';
            if (!playerFirstName) {
              totalReactSkipped++;
              continue;
            }
            const teamName = teamNameById.get(sig.prior_team_id) || null;

            const trajectoryUrl = `${APP_URL}/roster/${sig.prior_player_id}/trajectory`;
            const subject = buildReturningParentReactivationSubject({
              priorPlayerFirstName: playerFirstName,
            });
            const html = buildReturningParentReactivationHtml({
              coachFullName: coach.full_name,
              priorPlayerFirstName: playerFirstName,
              priorTeamName: teamName,
              trajectoryUrl,
            });

            const result = await sendEmail({ to: coach.email, subject, html });
            if (result.success) {
              await admin
                .from('coach_reactivation_signals')
                .update({ notified_at: new Date().toISOString() })
                .eq('id', sig.id);
              totalReactSent++;
            } else {
              console.error(
                '[coach-quiet-check-in] reactivation send failed:',
                coach.email,
                result.error,
              );
              totalReactErrors++;
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(
              '[coach-quiet-check-in] reactivation unexpected error for signal',
              sig.id,
              msg,
            );
            totalReactErrors++;
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[coach-quiet-check-in] reactivation branch unexpected error:', msg);
  }

  console.log(
    `[coach-quiet-check-in] done — sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors} reactSent=${totalReactSent} reactSkipped=${totalReactSkipped} reactErrors=${totalReactErrors}`,
  );
  return NextResponse.json({
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
    reactivationSent: totalReactSent,
    reactivationSkipped: totalReactSkipped,
    reactivationErrors: totalReactErrors,
  });
}
