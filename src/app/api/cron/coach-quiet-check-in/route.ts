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
import { selectDormantPublishersForClones } from '@/lib/dormant-publisher-clone-utils';
import { buildDormantPublisherCloneEmail } from '@/lib/dormant-publisher-clone-email';
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

  // ─── Ticket 0078 — dormant-PUBLISHER reactivation email branch ─────────
  // Walk every `coach_reputation_milestones` row crossed in the last 24h
  // with `notified_at IS NULL`. For each such milestone whose published
  // coach has been dormant ≥ 21 days AND has not received a reactivation
  // email in the last 60 days, send ONE email naming the cloning PROGRAM
  // (never the cloning coach) and the cloned drill/plan title, then
  // write a `coach_clone_reactivation_signals` row so the same edge is
  // never re-emailed (UNIQUE constraint + cooldown helper).
  //
  // Best-effort posture (LESSONS#0036): a mail failure on one batch
  // item does not block the next; a duplicate-key write on the signal
  // row is logged and the next item still processes.
  //
  // COPPA: the branch reads ONLY adult-only entities
  // (coach_reputation_milestones, coaches, coach_clone_reactivation_
  // signals, drill_shares, drills, drill_share_clones, organizations).
  // It NEVER reads `players`, `observations`, `parent_email`, DOB,
  // jersey_number, medical_notes, photo URLs.
  let totalPubSent = 0;
  let totalPubSkipped = 0;
  let totalPubErrors = 0;

  try {
    const twentyFourHoursAgoIso = new Date(now.getTime() - 1 * DAY_MS).toISOString();
    const { data: milestoneRows, error: milestoneErr } = await admin
      .from('coach_reputation_milestones')
      .select('id, published_coach_id, milestone_kind, crossed_at, notified_at')
      .is('notified_at', null)
      .gte('crossed_at', twentyFourHoursAgoIso)
      .order('crossed_at', { ascending: false });

    if (milestoneErr) {
      console.error(
        '[coach-quiet-check-in] publisher milestone read error:',
        milestoneErr.message,
      );
    } else {
      const milestones = (milestoneRows ?? []) as Array<{
        id: string;
        published_coach_id: string;
        milestone_kind: string;
        crossed_at: string;
        notified_at: string | null;
      }>;

      if (milestones.length > 0) {
        // Load each unique publishing coach once (allow-list).
        const publisherIds = Array.from(new Set(milestones.map((m) => m.published_coach_id)));
        const { data: publisherRows } = await admin
          .from('coaches')
          .select('id, email, full_name, preferences, paused_until, last_active_at')
          .in('id', publisherIds);
        const publishersById = new Map<string, CoachRow>();
        const coachLastSeen = new Map<string, string>();
        for (const c of (publisherRows ?? []) as CoachRow[]) {
          publishersById.set(c.id, c);
          if (c.last_active_at) coachLastSeen.set(c.id, c.last_active_at);
        }

        // Cooldown lookup — most-recent dispatched_at per publishing coach.
        const { data: cooldownRows } = await admin
          .from('coach_clone_reactivation_signals')
          .select('published_coach_id, dispatched_at')
          .in('published_coach_id', publisherIds)
          .order('dispatched_at', { ascending: false });
        const reactivationSignals = new Map<string, string>();
        for (const row of (cooldownRows ?? []) as Array<{
          published_coach_id: string;
          dispatched_at: string;
        }>) {
          // Order is DESC, so the FIRST entry per coach is the most recent;
          // skip subsequent entries.
          if (!reactivationSignals.has(row.published_coach_id)) {
            reactivationSignals.set(row.published_coach_id, row.dispatched_at);
          }
        }

        // The pure helper picks the most-recent qualifying milestone per
        // dormant publishing coach.
        const candidates = selectDormantPublishersForClones({
          milestones,
          coachLastSeen,
          reactivationSignals,
          nowMs: now.getTime(),
        });

        if (candidates.length > 0) {
          // Resolve drill / plan title + cloning program name per
          // candidate. The lookups are allow-listed reads:
          //   • drill_shares.caption (the published "drill" title)
          //   • drill_share_clones.cloner_org_id (NEVER cloner_coach_id
          //     for display; the coach id is structurally not in the
          //     rendered surface)
          //   • organizations.name (the cloning PROGRAM name)
          //
          // Best-effort: a missing title or program name falls back to
          // a generic copy variant in the email template.
          const candidateCoachIds = candidates.map((c) => c.published_coach_id);
          // Single allow-listed read on drill_shares — pulls the title
          // (caption) AND the per-share id we walk to find the cloning
          // org. NEVER reads `cloner_coach_id` directly; the cloning
          // program name comes from `drill_share_clones.cloner_org_id`.
          const { data: drillShareRows } = await admin
            .from('drill_shares')
            .select('id, coach_id, caption')
            .in('coach_id', candidateCoachIds)
            .order('created_at', { ascending: false });
          const drillTitleByCoach = new Map<string, string>();
          const shareIdToCoachId = new Map<string, string>();
          const shareIds: string[] = [];
          for (const row of (drillShareRows ?? []) as Array<{
            id: string;
            coach_id: string;
            caption: string | null;
          }>) {
            if (!drillTitleByCoach.has(row.coach_id) && row.caption) {
              drillTitleByCoach.set(row.coach_id, row.caption);
            }
            shareIdToCoachId.set(row.id, row.coach_id);
            shareIds.push(row.id);
          }

          // Resolve cloning program name: pick a recent clone on any
          // share owned by the publishing coach → the cloner's org →
          // organizations.name. We DO NOT join through to the cloner
          // coach's full_name — the surface never names them.
          const programNameByCoach = new Map<string, string>();
          if (shareIds.length > 0) {
            const { data: cloneRows } = await admin
              .from('drill_share_clones')
              .select('drill_share_id, cloner_org_id, cloned_at')
              .in('drill_share_id', shareIds)
              .order('cloned_at', { ascending: false });
            const orgIdByCoachId = new Map<string, string>();
            for (const row of (cloneRows ?? []) as Array<{
              drill_share_id: string;
              cloner_org_id: string | null;
            }>) {
              if (!row.cloner_org_id) continue;
              const coachId = shareIdToCoachId.get(row.drill_share_id);
              if (!coachId || orgIdByCoachId.has(coachId)) continue;
              orgIdByCoachId.set(coachId, row.cloner_org_id);
            }
            const orgIds = Array.from(new Set(Array.from(orgIdByCoachId.values())));
            if (orgIds.length > 0) {
              const { data: orgRows } = await admin
                .from('organizations')
                .select('id, name')
                .in('id', orgIds);
              const orgNameById = new Map<string, string>();
              for (const row of (orgRows ?? []) as Array<{ id: string; name: string }>) {
                orgNameById.set(row.id, row.name);
              }
              for (const [coachId, orgId] of orgIdByCoachId) {
                const name = orgNameById.get(orgId);
                if (name) programNameByCoach.set(coachId, name);
              }
            }
          }

          for (const candidate of candidates) {
            try {
              const publisher = publishersById.get(candidate.published_coach_id);
              if (!publisher || !publisher.email) {
                totalPubSkipped++;
                continue;
              }
              // Respect the 0042 pause flag (mirrors 0072).
              if (isCoachPaused(publisher, now)) {
                totalPubSkipped++;
                continue;
              }

              const drillOrPlanTitle =
                drillTitleByCoach.get(candidate.published_coach_id) ?? 'practice plan';
              const programName =
                programNameByCoach.get(candidate.published_coach_id) ?? 'another program';

              const built = buildDormantPublisherCloneEmail({
                publisherFirstName: (publisher.full_name ?? 'Coach').split(' ')[0],
                milestoneKind: candidate.milestone_kind,
                programName,
                drillOrPlanTitle,
                appUrl: APP_URL,
                milestoneId: candidate.milestone_id,
              });

              const result = await sendEmail({
                to: publisher.email,
                subject: built.subject,
                html: built.html,
              });
              if (!result.success) {
                console.error(
                  '[coach-quiet-check-in] publisher reactivation send failed:',
                  publisher.email,
                  result.error,
                );
                totalPubErrors++;
                continue;
              }

              // Best-effort signal write. The UNIQUE (published_coach_id,
              // milestone_id) makes a duplicate insert a no-op on the
              // DB side; here we just log and move on if the insert
              // surfaces an error.
              const insertRes = await admin
                .from('coach_clone_reactivation_signals')
                .insert({
                  published_coach_id: candidate.published_coach_id,
                  milestone_id: candidate.milestone_id,
                  dispatched_at: new Date().toISOString(),
                });
              if (insertRes.error) {
                console.error(
                  '[coach-quiet-check-in] publisher reactivation signal insert error:',
                  insertRes.error.message,
                );
              }
              totalPubSent++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(
                '[coach-quiet-check-in] publisher reactivation unexpected error for milestone',
                candidate.milestone_id,
                msg,
              );
              totalPubErrors++;
            }
          }
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(
      '[coach-quiet-check-in] publisher reactivation branch unexpected error:',
      msg,
    );
  }

  console.log(
    `[coach-quiet-check-in] done — sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors} reactSent=${totalReactSent} reactSkipped=${totalReactSkipped} reactErrors=${totalReactErrors} pubSent=${totalPubSent} pubSkipped=${totalPubSkipped} pubErrors=${totalPubErrors}`,
  );
  return NextResponse.json({
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
    reactivationSent: totalReactSent,
    reactivationSkipped: totalReactSkipped,
    reactivationErrors: totalReactErrors,
    publisherSent: totalPubSent,
    publisherSkipped: totalPubSkipped,
    publisherErrors: totalPubErrors,
  });
}
