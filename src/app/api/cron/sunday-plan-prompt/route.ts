/**
 * POST /api/cron/sunday-plan-prompt
 *
 * Ticket 0058 — the Sunday-evening email to a coach who has an unfinished
 * `plans` draft AND an upcoming session in the next 7 days. The email
 * names the team + the gap and deep-links the coach back to the plans page
 * with the draft expanded ("Finish in 12 minutes").
 *
 * Eligibility (all must hold for a coach to receive ONE email):
 *   - paused_until is null or already in the past (`isCoachPaused` from 0042)
 *   - `coaches.preferences.disable_planning_prompts !== true`
 *   - the coach has at least ONE active team with an upcoming session in
 *     the next 7 days (joined via `team_coaches`, not `teams.coach_id` —
 *     LESSONS#0057, the teams table has NO coach_id column)
 *   - the team has a `type='practice'` plan that is < 7 days old AND fails
 *     the shared `isPlanDraft` predicate (the cron and the UI must agree
 *     on what "draft" means — both import from `@/lib/plan-draft-utils`)
 *   - the per-ISO-week bookmark `preferences.sunday_plan_prompt_<YYYY-Www>`
 *     is not already set
 *
 * On a successful send, the bookmark is written so a second invocation
 * the same ISO week is a no-op. A send failure leaves the bookmark UNSET
 * so the next invocation retries the same coach (practice-reminder
 * posture).
 *
 * Schedule: Sundays 23:00 UTC (≈7pm Eastern). See `vercel.json` crons.
 *
 * Protected by CRON_SECRET (mirrors practice-reminder).
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { isCoachPaused } from '@/lib/coach-pause-utils';
import { isPlanDraft, summarizeDraftGap } from '@/lib/plan-draft-utils';
import { makeReferralCode } from '@/lib/referral-code';
import {
  buildSundayPlanPromptEmail,
  getIsoWeekKey,
  getSundayPromptKey,
  hasAlreadySentSundayPrompt,
  isSundayPromptDisabled,
  markSundayPromptSent,
  type DraftSnapshot,
} from '@/lib/sunday-plan-prompt-utils';
import type { Json, Plan } from '@/types/database';

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

interface SessionRow {
  id: string;
  team_id: string;
  date: string;
}

interface TeamRow {
  id: string;
  name: string;
}

interface PlanRow
  extends Pick<
    Plan,
    'id' | 'team_id' | 'coach_id' | 'type' | 'title' | 'content_structured' | 'created_at'
  > {}

function getDayLabel(dateStr: string): string {
  // YYYY-MM-DD treated as UTC midnight so the cron's day-of-week is
  // deterministic regardless of the server's local TZ.
  const d = new Date(`${dateStr}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
}

function extractDrills(content: Json | null): DraftSnapshot['drills'] {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return [];
  const obj = content as Record<string, unknown>;
  const drills = obj.drills;
  if (!Array.isArray(drills)) return [];
  return drills
    .map((d) => {
      if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
      const row = d as Record<string, unknown>;
      const name = typeof row.name === 'string' ? row.name : null;
      if (!name) return null;
      const dur =
        typeof row.duration_minutes === 'number' ? row.duration_minutes : null;
      return { name, durationMinutes: dur };
    })
    .filter((d): d is { name: string; durationMinutes: number | null } => d !== null);
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

  // Upcoming-session window: today UTC → today + 7 days UTC.
  const windowStartIso = now.toISOString().slice(0, 10);
  const windowEndIso = new Date(now.getTime() + 7 * DAY_MS).toISOString().slice(0, 10);
  // Draft freshness window: created in the last 7 days.
  const draftSinceIso = new Date(now.getTime() - 7 * DAY_MS).toISOString();

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
      console.error('[sunday-plan-prompt] DB error fetching coaches:', coachesErr.message);
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
        if (isSundayPromptDisabled(coach.preferences)) {
          totalSkipped++;
          continue;
        }
        if (hasAlreadySentSundayPrompt(coach.preferences, isoWeek)) {
          totalSkipped++;
          continue;
        }

        // ── Coach → teams via team_coaches (LESSONS#0057) ───────────────────
        const { data: teamRows } = await admin
          .from('team_coaches')
          .select('team_id')
          .eq('coach_id', coach.id);

        const teamIds = (teamRows ?? [])
          .map((r) => (r as { team_id: string }).team_id)
          .filter((id): id is string => typeof id === 'string' && id.length > 0);

        if (teamIds.length === 0) {
          totalSkipped++;
          continue;
        }

        // ── Upcoming sessions in next 7 days for those teams ────────────────
        const { data: sessionRows } = await admin
          .from('sessions')
          .select('id, team_id, date')
          .in('team_id', teamIds)
          .gte('date', windowStartIso)
          .lte('date', windowEndIso)
          .order('date', { ascending: true });

        const upcomingSessions = (sessionRows ?? []) as SessionRow[];
        if (upcomingSessions.length === 0) {
          totalSkipped++;
          continue;
        }

        // ── Find the soonest-upcoming session whose team has a DRAFT plan. ──
        //
        // The rate-limit AC says at most ONE prompt per (coach, ISO-week), and
        // when a coach has multiple drafts, the SOONEST upcoming session's
        // draft wins. We iterate the sessions in date order and return on the
        // first match.
        let chosenSession: SessionRow | null = null;
        let chosenDraft: PlanRow | null = null;
        let chosenTeamName = '';

        // Bulk-fetch the team names once.
        const { data: teamNameRows } = await admin
          .from('teams')
          .select('id, name')
          .in('id', teamIds);
        const teamNameById = new Map<string, string>();
        for (const row of (teamNameRows ?? []) as TeamRow[]) {
          teamNameById.set(row.id, row.name);
        }

        for (const session of upcomingSessions) {
          const { data: planRows } = await admin
            .from('plans')
            .select('id, team_id, coach_id, type, title, content_structured, created_at')
            .eq('coach_id', coach.id)
            .eq('team_id', session.team_id)
            .eq('type', 'practice')
            .gte('created_at', draftSinceIso)
            .order('created_at', { ascending: false })
            .limit(5);

          const plans = (planRows ?? []) as PlanRow[];
          const draft = plans.find((p) =>
            isPlanDraft({ type: p.type as Plan['type'], content_structured: p.content_structured }),
          );
          if (draft) {
            chosenSession = session;
            chosenDraft = draft;
            chosenTeamName = teamNameById.get(session.team_id) ?? '';
            break;
          }
        }

        if (!chosenDraft || !chosenSession) {
          totalSkipped++;
          continue;
        }

        // ── Build the email ────────────────────────────────────────────────
        const { gapCount, missingSegment } = summarizeDraftGap({
          type: chosenDraft.type as Plan['type'],
          content_structured: chosenDraft.content_structured,
        });
        const referralCode = makeReferralCode(coach.id);
        const unsubscribeUrl = `${APP_URL}/settings/profile`;
        const draftSnapshot: DraftSnapshot = {
          draftId: chosenDraft.id,
          draftTitle: chosenDraft.title,
          drills: extractDrills(chosenDraft.content_structured),
        };

        const { subject, html } = buildSundayPlanPromptEmail({
          teamName: chosenTeamName,
          dayOfNextSession: getDayLabel(chosenSession.date),
          gapCount,
          missingSegment,
          draftSnapshot,
          referralCode,
          unsubscribeUrl,
          appUrl: APP_URL,
        });

        const result = await sendEmail({ to: coach.email, subject, html });

        if (result.success) {
          const updatedPrefs = markSundayPromptSent(coach.preferences, isoWeek);
          await admin.from('coaches').update({ preferences: updatedPrefs }).eq('id', coach.id);
          totalSent++;
        } else {
          // Leave the bookmark unset so the next run retries.
          console.error('[sunday-plan-prompt] send failed:', coach.email, result.error);
          totalErrors++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[sunday-plan-prompt] unexpected error for coach', coach.id, msg);
        totalErrors++;
      }
    }

    if (coaches.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `[sunday-plan-prompt] done — week=${isoWeek} sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors}`,
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
export { getSundayPromptKey };
