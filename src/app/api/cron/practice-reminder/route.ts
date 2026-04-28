/**
 * POST /api/cron/practice-reminder
 *
 * Vercel Cron Job — runs daily at 12:00 UTC.
 * Finds sessions scheduled for today, fetches the team's recent observations,
 * and sends each coach a personalised pre-practice briefing email showing:
 *   - which players haven't been observed in the last 7 days
 *   - a summary of the most recent session
 *   - deep-link CTAs to the timer, capture, and roster pages
 *
 * Protected by CRON_SECRET environment variable.
 * Coaches can disable via preferences.disable_practice_reminders = true.
 * Each reminder is recorded in preferences.practice_reminder_YYYY-MM-DD = true
 * to avoid duplicate sends.
 */

import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import {
  getTodayKey,
  hasAlreadySentReminder,
  isReminderDisabled,
  markReminderSent,
  getPlayersNotRecentlyObserved,
  buildLastSessionSummary,
  hasEnoughDataForReminder,
  buildPracticeReminderHtml,
  buildPracticeReminderSubject,
  type ReminderObservation,
  type ReminderPlayer,
} from '@/lib/practice-reminder-utils';
import { NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';
const BATCH_SIZE = 50;

export async function POST(request: Request) {
  // ── Auth ─────────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = await createServiceSupabase();
  const today = getTodayKey();

  let offset = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // ── Page through sessions for today ─────────────────────────────────────
  while (true) {
    const { data: sessions, error: sessionsError } = await admin
      .from('sessions')
      .select('id, team_id, coach_id, type, start_time')
      .eq('date', today)
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (sessionsError) {
      console.error('[practice-reminder] DB error fetching sessions:', sessionsError.message);
      return NextResponse.json({ error: sessionsError.message }, { status: 500 });
    }

    if (!sessions || sessions.length === 0) break;

    for (const session of sessions) {
      try {
        // ── Load coach ────────────────────────────────────────────────────
        const { data: coach, error: coachError } = await admin
          .from('coaches')
          .select('id, email, full_name, preferences')
          .eq('id', session.coach_id)
          .single();

        if (coachError || !coach) {
          totalSkipped++;
          continue;
        }

        // ── Check opt-out + dedup ─────────────────────────────────────────
        if (isReminderDisabled(coach.preferences)) {
          totalSkipped++;
          continue;
        }
        if (hasAlreadySentReminder(coach.preferences, today)) {
          totalSkipped++;
          continue;
        }

        // ── Load players ──────────────────────────────────────────────────
        const { data: players } = await admin
          .from('players')
          .select('id, name, jersey_number')
          .eq('team_id', session.team_id)
          .eq('is_active', true);

        if (!players || players.length < 2) {
          totalSkipped++;
          continue;
        }

        // ── Load recent observations (last 30 days) ───────────────────────
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const { data: recentObs } = await admin
          .from('observations')
          .select('player_id, sentiment, category, created_at')
          .eq('team_id', session.team_id)
          .gte('created_at', since30)
          .order('created_at', { ascending: false })
          .limit(300);

        const observations: ReminderObservation[] = (recentObs ?? []).map((o) => ({
          player_id: o.player_id,
          sentiment: o.sentiment,
          category: o.category,
          created_at: o.created_at,
        }));

        if (!hasEnoughDataForReminder(players as ReminderPlayer[], observations)) {
          totalSkipped++;
          continue;
        }

        // ── Load last prior session (before today) ─────────────────────────
        const { data: priorSessions } = await admin
          .from('sessions')
          .select('id, date')
          .eq('team_id', session.team_id)
          .lt('date', today)
          .order('date', { ascending: false })
          .limit(1);

        let lastSession = null;
        if (priorSessions && priorSessions.length > 0) {
          const prev = priorSessions[0];
          const prevDate = prev.date as string;
          const since = new Date(prevDate + 'T00:00:00Z').toISOString();
          const nextDay = new Date(new Date(prevDate + 'T00:00:00Z').getTime() + 24 * 60 * 60 * 1000).toISOString();
          const sessionObs = observations.filter(
            (o) => o.created_at >= since && o.created_at < nextDay,
          );
          if (sessionObs.length > 0) {
            lastSession = buildLastSessionSummary(prevDate, sessionObs, players.length);
          }
        }

        // ── Compute neglected players ──────────────────────────────────────
        const neglectedPlayers = getPlayersNotRecentlyObserved(
          players as ReminderPlayer[],
          observations,
          7,
        );

        // ── Load team name ─────────────────────────────────────────────────
        const { data: team } = await admin
          .from('teams')
          .select('name')
          .eq('id', session.team_id)
          .single();

        const teamName = team?.name ?? 'Your Team';

        // ── Build and send email ───────────────────────────────────────────
        const html = buildPracticeReminderHtml({
          coachName: coach.full_name,
          teamName,
          sessionType: session.type,
          startTime: session.start_time,
          sessionId: session.id,
          players: players as ReminderPlayer[],
          neglectedPlayers,
          lastSession,
          appUrl: APP_URL,
        });

        const subject = buildPracticeReminderSubject(session.type, session.start_time, teamName);

        const result = await sendEmail({ to: coach.email, subject, html });

        if (result.success) {
          // Mark as sent so a second session for the same team doesn't double-send
          const updatedPrefs = markReminderSent(coach.preferences, today);
          await admin
            .from('coaches')
            .update({ preferences: updatedPrefs })
            .eq('id', coach.id);
          totalSent++;
        } else {
          console.error('[practice-reminder] send failed:', coach.email, result.error);
          totalErrors++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[practice-reminder] unexpected error for session', session.id, msg);
        totalErrors++;
      }
    }

    if (sessions.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(`[practice-reminder] done — sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors}`);
  return NextResponse.json({ sent: totalSent, skipped: totalSkipped, errors: totalErrors });
}
