/**
 * POST /api/cron/parent-digest
 *
 * Vercel Cron Job — runs every Sunday at 18:00 UTC.
 *
 * For each coach with `preferences.auto_parent_digest.enabled = true`, sends
 * every parent (who has an email on file) a personalized progress-report email
 * with a direct link to their child's live share portal.
 *
 * What it does per player:
 *   1. Fetch (or auto-create) the player's most recent active share token.
 *   2. Count observations in the last 7 days for the activity summary line.
 *   3. Pull the most recent positive observation text as a highlight quote.
 *   4. Email the parent a branded HTML message with the portal link.
 *
 * Protected by CRON_SECRET environment variable.
 * Coaches opt in via Settings → Profile → "Auto parent progress emails".
 * Deduplication: preferences.parent_digest_week_YYYY-MM-DD prevents re-sends
 * if the cron fires twice in the same week.
 *
 * Min data threshold: ≥3 observations for the player (portal would be empty otherwise).
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { randomBytes } from 'crypto';
import {
  getWeekStartSunday,
  isParentDigestEnabled,
  hasAlreadySentParentDigest,
  markParentDigestSent,
  hasEnoughDataForParentDigest,
  getRecentObsHighlight,
  buildShareUrl,
  buildParentDigestSubject,
  buildParentDigestHtml,
} from '@/lib/parent-digest-utils';

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

  const now = new Date();
  const weekStr = getWeekStartSunday(now);

  // Look back 7 days for per-player activity summary
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  // Look back 30 days for highlight quote (a recent positive obs)
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  let offset = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // ── Page through coaches ────────────────────────────────────────────────
  while (true) {
    const { data: coaches, error: coachesErr } = await admin
      .from('coaches')
      .select('id, email, full_name, preferences, org_id')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (coachesErr) {
      console.error('[parent-digest] DB error fetching coaches:', coachesErr.message);
      return NextResponse.json({ error: coachesErr.message }, { status: 500 });
    }

    if (!coaches || coaches.length === 0) break;

    for (const coach of coaches) {
      if (!isParentDigestEnabled(coach.preferences)) continue;
      if (hasAlreadySentParentDigest(coach.preferences, weekStr)) {
        totalSkipped++;
        continue;
      }

      // ── Fetch the coach's active teams ──────────────────────────────────
      const { data: teams } = await admin
        .from('teams')
        .select('id, name')
        .eq('coach_id', coach.id)
        .eq('is_active', true);

      if (!teams?.length) continue;

      let coachSentCount = 0;

      for (const team of teams) {
        // ── Fetch players with parent email ───────────────────────────────
        const { data: players } = await admin
          .from('players')
          .select('id, name, parent_email, parent_name')
          .eq('team_id', team.id)
          .eq('is_active', true)
          .not('parent_email', 'is', null);

        if (!players?.length) continue;

        // ── Count sessions this week for the team ─────────────────────────
        const { count: sessionCount } = await admin
          .from('sessions')
          .select('id', { count: 'exact', head: true })
          .eq('team_id', team.id)
          .gte('date', since7d.split('T')[0]);

        for (const player of players) {
          if (!player.parent_email) continue;

          // ── Count player observations (all-time for threshold check) ────
          const { count: totalObsCount } = await admin
            .from('observations')
            .select('id', { count: 'exact', head: true })
            .eq('player_id', player.id);

          if (!hasEnoughDataForParentDigest(totalObsCount ?? 0)) {
            totalSkipped++;
            continue;
          }

          // ── Get/create a share token for this player ────────────────────
          let shareToken: string | null = null;

          const { data: existingShares } = await admin
            .from('parent_shares')
            .select('share_token')
            .eq('player_id', player.id)
            .eq('team_id', team.id)
            .eq('is_active', true)
            .is('expires_at', null)
            .order('created_at', { ascending: false })
            .limit(1);

          if (existingShares?.[0]?.share_token) {
            shareToken = existingShares[0].share_token;
          } else {
            // Auto-create a permanent share link
            const newToken = randomBytes(16).toString('hex');
            const { error: insertErr } = await admin
              .from('parent_shares')
              .insert({
                player_id: player.id,
                team_id: team.id,
                coach_id: coach.id,
                share_token: newToken,
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
              });

            if (!insertErr) shareToken = newToken;
          }

          if (!shareToken) {
            totalErrors++;
            continue;
          }

          // ── Fetch highlight observation (last 30 days, positive) ─────────
          const { data: recentObs } = await admin
            .from('observations')
            .select('sentiment, text, created_at')
            .eq('player_id', player.id)
            .gte('created_at', since30d)
            .order('created_at', { ascending: false })
            .limit(20);

          const highlight = getRecentObsHighlight(recentObs ?? []);

          // ── Count observations this week for the player ──────────────────
          const { count: weekObsCount } = await admin
            .from('observations')
            .select('id', { count: 'exact', head: true })
            .eq('player_id', player.id)
            .gte('created_at', since7d);

          const shareUrl = buildShareUrl(shareToken, APP_URL);
          const subject = buildParentDigestSubject(player.name, coach.full_name ?? 'Your Coach');
          const html = buildParentDigestHtml({
            playerName: player.name,
            parentName: player.parent_name ?? null,
            coachName: coach.full_name ?? 'Your Coach',
            teamName: team.name,
            shareUrl,
            obsCount: weekObsCount ?? 0,
            sessionCount: sessionCount ?? 0,
            highlight,
            appUrl: APP_URL,
          });

          const result = await sendEmail({ to: player.parent_email, subject, html });

          if (result.success) {
            coachSentCount++;
            totalSent++;
          } else {
            totalErrors++;
            console.error('[parent-digest] Email failed for player', player.id, result.error);
          }
        }
      }

      // ── Mark this coach as done for the week ───────────────────────────
      if (coachSentCount > 0) {
        const updatedPrefs = markParentDigestSent(coach.preferences, weekStr);
        await admin
          .from('coaches')
          .update({ preferences: updatedPrefs })
          .eq('id', coach.id);
      }
    }

    offset += BATCH_SIZE;
  }

  console.info('[parent-digest] Done', { weekStr, totalSent, totalSkipped, totalErrors });
  return NextResponse.json({ ok: true, weekStr, totalSent, totalSkipped, totalErrors });
}
