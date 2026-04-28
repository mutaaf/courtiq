/**
 * POST /api/cron/weekly-digest
 *
 * Vercel Cron Job — runs every Monday at 08:00 UTC.
 *
 * For each coach who has at least one active team with meaningful activity in
 * the prior calendar week (Mon–Sun), sends a personalised digest email showing:
 *   - Total observations, sessions, and unique players observed that week
 *   - Player Spotlight: the player with the most positive observations
 *   - Players Needing Attention: roster members with 0 observations in 7 days
 *   - Top Strength: the skill category with the most positive momentum
 *   - One-tap CTA to generate next week's practice plan on /plans
 *
 * Protected by CRON_SECRET environment variable.
 * Coaches can opt out via preferences.disable_weekly_digest = true.
 * Deduplication: preferences.digest_week_YYYY-MM-DD is set after each send so
 * the job is safe to re-run without double-sending.
 *
 * Min data threshold: ≥2 observations + ≥2 active players (skips quiet weeks).
 */

import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import {
  getPriorWeekMonday,
  getWeekWindow,
  formatWeekLabel,
  filterObsInWindow,
  countPositiveObs,
  countNeedsWorkObs,
  getObservedPlayerIds,
  getTopPerformer,
  getNeglectedPlayerNames,
  getTopCategory,
  hasAlreadySentDigest,
  isDigestDisabled,
  markDigestSent,
  hasEnoughDataForDigest,
  buildDigestSubject,
  buildDigestHtml,
  type DigestObs,
  type DigestPlayer,
} from '@/lib/weekly-digest-utils';
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

  // ── Compute week window ───────────────────────────────────────────────────
  const now = new Date();
  const mondayStr = getPriorWeekMonday(now);
  const { start: weekStart, end: weekEnd } = getWeekWindow(mondayStr);
  const weekLabel = formatWeekLabel(weekStart, weekEnd);

  // Look back 30 days for neglected-player computation
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let offset = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // ── Page through all coaches ─────────────────────────────────────────────
  while (true) {
    const { data: coaches, error: coachesErr } = await admin
      .from('coaches')
      .select('id, email, full_name, preferences')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (coachesErr) {
      console.error('[weekly-digest] DB error fetching coaches:', coachesErr.message);
      return NextResponse.json({ error: coachesErr.message }, { status: 500 });
    }

    if (!coaches || coaches.length === 0) break;

    for (const coach of coaches) {
      try {
        // ── Opt-out + dedup ───────────────────────────────────────────────
        if (isDigestDisabled(coach.preferences)) {
          totalSkipped++;
          continue;
        }
        if (hasAlreadySentDigest(coach.preferences, mondayStr)) {
          totalSkipped++;
          continue;
        }

        // ── Find coach's active teams ─────────────────────────────────────
        const { data: teams } = await admin
          .from('teams')
          .select('id, name')
          .eq('coach_id', coach.id);

        if (!teams || teams.length === 0) {
          totalSkipped++;
          continue;
        }

        // ── Process each team independently; send one email per coach for the
        //    most active team (avoids inbox spam for multi-team coaches) ────
        let bestTeamData: {
          teamName: string;
          weekObs: number;
          weekSessions: number;
          weekPlayers: number;
          positiveObs: number;
          needsWorkObs: number;
          topPerformer: { name: string; count: number } | null;
          neglectedPlayerNames: string[];
          topCategory: string | null;
        } | null = null;

        for (const team of teams) {
          // ── Active roster ───────────────────────────────────────────────
          const { data: players } = await admin
            .from('players')
            .select('id, name, jersey_number')
            .eq('team_id', team.id)
            .eq('is_active', true);

          if (!players || players.length < 2) continue;

          const digestPlayers: DigestPlayer[] = players.map((p) => ({
            id: p.id,
            name: p.name,
            jersey_number: p.jersey_number ?? null,
          }));

          // ── Last 30 days of observations (for neglected-player calc) ────
          const { data: allRecentObs } = await admin
            .from('observations')
            .select('player_id, sentiment, category, created_at, text')
            .eq('team_id', team.id)
            .gte('created_at', since30)
            .order('created_at', { ascending: false })
            .limit(500);

          const allObs: DigestObs[] = (allRecentObs ?? []).map((o) => ({
            player_id: o.player_id ?? null,
            sentiment: o.sentiment ?? 'neutral',
            category: o.category ?? null,
            created_at: o.created_at,
            text: (o as any).text ?? '',
          }));

          // ── Narrow to this week ─────────────────────────────────────────
          const weekObs = filterObsInWindow(allObs, weekStart, weekEnd);

          if (!hasEnoughDataForDigest(weekObs.length, digestPlayers.length)) continue;

          // ── Sessions this week ──────────────────────────────────────────
          const { data: sessions } = await admin
            .from('sessions')
            .select('id, type, date')
            .eq('team_id', team.id)
            .gte('date', weekStart)
            .lte('date', weekEnd);

          const weekSessions = sessions?.length ?? 0;

          // ── Compute metrics ─────────────────────────────────────────────
          const observedIds = getObservedPlayerIds(weekObs);
          const weekPlayers = observedIds.size;
          const positiveObs = countPositiveObs(weekObs);
          const needsWorkObs = countNeedsWorkObs(weekObs);
          const topPerformer = getTopPerformer(weekObs, digestPlayers);
          const neglectedPlayerNames = getNeglectedPlayerNames(allObs, digestPlayers, 7);
          const topCategory = getTopCategory(weekObs);

          // ── Keep the most active team ───────────────────────────────────
          if (!bestTeamData || weekObs.length > bestTeamData.weekObs) {
            bestTeamData = {
              teamName: team.name,
              weekObs: weekObs.length,
              weekSessions,
              weekPlayers,
              positiveObs,
              needsWorkObs,
              topPerformer,
              neglectedPlayerNames,
              topCategory,
            };
          }
        }

        if (!bestTeamData) {
          totalSkipped++;
          continue;
        }

        // ── Build and send email ──────────────────────────────────────────
        const html = buildDigestHtml({
          coachName: coach.full_name,
          teamName: bestTeamData.teamName,
          weekLabel,
          weekObs: bestTeamData.weekObs,
          weekSessions: bestTeamData.weekSessions,
          weekPlayers: bestTeamData.weekPlayers,
          positiveObs: bestTeamData.positiveObs,
          needsWorkObs: bestTeamData.needsWorkObs,
          topPerformer: bestTeamData.topPerformer,
          neglectedPlayerNames: bestTeamData.neglectedPlayerNames,
          topCategory: bestTeamData.topCategory,
          appUrl: APP_URL,
        });

        const subject = buildDigestSubject(bestTeamData.teamName, bestTeamData.weekObs);

        const result = await sendEmail({ to: coach.email, subject, html });

        if (result.success) {
          const updatedPrefs = markDigestSent(coach.preferences, mondayStr);
          await admin
            .from('coaches')
            .update({ preferences: updatedPrefs })
            .eq('id', coach.id);
          totalSent++;
        } else {
          console.error('[weekly-digest] send failed:', coach.email, result.error);
          totalErrors++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[weekly-digest] unexpected error for coach', coach.id, msg);
        totalErrors++;
      }
    }

    if (coaches.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `[weekly-digest] done — week=${mondayStr} sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors}`,
  );
  return NextResponse.json({
    week: mondayStr,
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
  });
}
