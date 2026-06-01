/**
 * POST /api/cron/silent-player-nudge
 *
 * Ticket 0062 — the mid-week (Thursday-evening) nudge to a coach who is
 * ACTIVELY capturing (had any observation in the last 7 days) but who has
 * gone 8+ days without writing a single word about ONE specific player on
 * their roster.
 *
 * Eligibility (all must hold for a coach to receive ONE email):
 *   - paused_until is null or already in the past (`isCoachPaused` from 0042)
 *   - `coaches.preferences.disable_silent_player_nudge !== true`
 *   - the coach has at least ONE observation in the last 7 days (the WHOLE
 *     point of this cron — a totally-silent coach is handled by 0042 / 0058)
 *   - the coach has at least one ACTIVE team with at least ONE active player
 *     whose gap is 8+ days (per `selectSilentPlayer`)
 *   - the per-ISO-week bookmark `preferences.silent_player_nudge_<YYYY-Www>`
 *     is not already set
 *
 * On a successful send, the bookmark is written so a second invocation the
 * same ISO week is a no-op. A send failure leaves the bookmark UNSET so the
 * next invocation retries the same coach (mirrors the 0058 / practice-
 * reminder posture).
 *
 * Schedule: Thursdays 19:00 UTC (~3pm Eastern, late afternoon Pacific).
 * Mirrors the 0058 / practice-reminder cron's auth + batched pagination
 * shape byte-for-byte where applicable.
 *
 * COPPA: every `.select()` call below is an explicit allow-list — `coaches`
 * (id, email, full_name, preferences, paused_until); `team_coaches`
 * (team_id); `teams` (id, name, is_active); `players` (id, name,
 * created_at); `observations` (player_id, text, created_at), plus the
 * activity probe (id). NO DOB / medical_notes / parent_email / parent_phone
 * / jersey_number ever flows through this route.
 *
 * Protected by CRON_SECRET (mirrors practice-reminder).
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { isCoachPaused } from '@/lib/coach-pause-utils';
import { makeReferralCode } from '@/lib/referral-code';
import {
  selectSilentPlayer,
  buildSilentPlayerNudgeEmail,
  getIsoWeekKey,
  getSilentPlayerNudgeKey,
  hasAlreadySentSilentPlayerNudge,
  isSilentPlayerNudgeDisabled,
  markSilentPlayerNudgeSent,
  type SilentPlayerCandidate,
  type SilentPlayerObservation,
  type SilentPlayerResult,
} from '@/lib/silent-player-utils';
import type { Json } from '@/types/database';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';
const BATCH_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

interface CoachRow {
  id: string;
  email: string | null;
  full_name: string | null;
  preferences: Json;
  paused_until: string | null;
}

interface TeamRow {
  id: string;
  name: string;
  is_active: boolean;
}

interface PlayerRow {
  id: string;
  name: string;
  created_at: string;
}

function firstNameOf(name: string): string {
  const t = (name ?? '').trim();
  if (!t) return 'this player';
  // `players.name.split(' ')[0]` per AC. When the full name has no space
  // (single-token name), the whole string IS the first name.
  return t.split(' ')[0];
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
  const isoWeek = getIsoWeekKey(now);
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * DAY_MS).toISOString();

  let offset = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    const { data: coaches, error: coachesErr } = await admin
      .from('coaches')
      .select('id, email, full_name, preferences, paused_until')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (coachesErr) {
      console.error('[silent-player-nudge] DB error fetching coaches:', coachesErr.message);
      return NextResponse.json({ error: coachesErr.message }, { status: 500 });
    }

    if (!coaches || coaches.length === 0) break;

    for (const coach of coaches as CoachRow[]) {
      try {
        if (!coach.email) {
          totalSkipped++;
          continue;
        }
        if (isCoachPaused(coach, now)) {
          totalSkipped++;
          continue;
        }
        if (isSilentPlayerNudgeDisabled(coach.preferences)) {
          totalSkipped++;
          continue;
        }
        if (hasAlreadySentSilentPlayerNudge(coach.preferences, isoWeek)) {
          totalSkipped++;
          continue;
        }

        // ── Coach activity probe — has the coach observed ANYTHING in the
        //    last 7 days? If not, this cron is not for them (handled by
        //    0042 / 0058). One narrow probe to keep the read cheap.
        const { data: activityRows } = await admin
          .from('observations')
          .select('id')
          .eq('coach_id', coach.id)
          .gte('created_at', sevenDaysAgoIso)
          .limit(1);

        if (!activityRows || activityRows.length === 0) {
          totalSkipped++;
          continue;
        }

        // ── Coach → teams via team_coaches (LESSONS#0057) ───────────────────
        const { data: teamCoachRows } = await admin
          .from('team_coaches')
          .select('team_id')
          .eq('coach_id', coach.id);

        const teamIds = (teamCoachRows ?? [])
          .map((r) => (r as { team_id: string }).team_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (teamIds.length === 0) {
          totalSkipped++;
          continue;
        }

        // Active teams only.
        const { data: teamRows } = await admin
          .from('teams')
          .select('id, name, is_active')
          .in('id', teamIds)
          .eq('is_active', true);

        const activeTeams = (teamRows ?? []) as TeamRow[];
        if (activeTeams.length === 0) {
          totalSkipped++;
          continue;
        }

        // ── For each active team, find the longest-silent player ───────────
        //
        // Then across teams, the team where the longest-silent-player gap is
        // LONGEST overall wins. We compare by gapDays; ties go to the team
        // with the lower id ascending (deterministic).
        let chosen: { team: TeamRow; pick: SilentPlayerResult } | null = null;

        for (const team of activeTeams) {
          const { data: playerRows } = await admin
            .from('players')
            .select('id, name, created_at')
            .eq('team_id', team.id)
            .eq('is_active', true);

          const candidates = ((playerRows ?? []) as PlayerRow[]).map(
            (p): SilentPlayerCandidate => ({
              id: p.id,
              name: p.name,
              created_at: p.created_at,
            }),
          );
          if (candidates.length === 0) continue;

          // Pull observations on those players in one batched query, ordered
          // newest-first. We only need the most recent per player, but the
          // util consumes the whole list and indexes itself.
          const candidateIds = candidates.map((p) => p.id);
          const { data: obsRows } = await admin
            .from('observations')
            .select('player_id, text, created_at')
            .in('player_id', candidateIds)
            .order('created_at', { ascending: false });

          const observations = ((obsRows ?? []) as SilentPlayerObservation[]).filter(
            (o): o is SilentPlayerObservation =>
              !!o && typeof o.player_id === 'string' && typeof o.text === 'string',
          );

          const pick = selectSilentPlayer(candidates, observations, now);
          if (!pick) continue;

          if (!chosen || pick.gapDays > chosen.pick.gapDays) {
            chosen = { team, pick };
          } else if (
            pick.gapDays === chosen.pick.gapDays &&
            team.id < chosen.team.id
          ) {
            // Deterministic team tie-break (same posture as the per-team
            // player tie-break in `selectSilentPlayer`).
            chosen = { team, pick };
          }
        }

        if (!chosen) {
          totalSkipped++;
          continue;
        }

        // ── Build the email ────────────────────────────────────────────────
        const referralCode = makeReferralCode(coach.id);
        const unsubscribeUrl = `${APP_URL.replace(/\/$/, '')}/settings/profile`;
        const deepLinkUrl = `${APP_URL.replace(/\/$/, '')}/capture?playerId=${encodeURIComponent(chosen.pick.playerId)}&via=silent-player-nudge`;
        const playerFirstName = firstNameOf(chosen.pick.playerName);

        const { subject, html } = buildSilentPlayerNudgeEmail({
          playerFirstName,
          gapDays: chosen.pick.gapDays,
          teamName: chosen.team.name,
          lastObservationText: chosen.pick.lastObservationText,
          lastObservationDate: chosen.pick.lastObservationDate,
          deepLinkUrl,
          referralCode,
          unsubscribeUrl,
        });

        const result = await sendEmail({ to: coach.email, subject, html });

        if (result.success) {
          const updatedPrefs = markSilentPlayerNudgeSent(coach.preferences, isoWeek);
          await admin
            .from('coaches')
            .update({ preferences: updatedPrefs })
            .eq('id', coach.id);
          totalSent++;
        } else {
          // Leave the bookmark unset so the next run retries.
          console.error('[silent-player-nudge] send failed:', coach.email, result.error);
          totalErrors++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[silent-player-nudge] unexpected error for coach', coach.id, msg);
        totalErrors++;
      }
    }

    if (coaches.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `[silent-player-nudge] done — week=${isoWeek} sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors}`,
  );
  return NextResponse.json({
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
  });
}

// Re-export the key derivation so callers (e.g. the unit test) can recompute
// the bookmark key deterministically without importing the utils file from
// two places.
export { getSilentPlayerNudgeKey };
