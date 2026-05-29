/**
 * POST /api/cron/weekly-parent-rollup
 *
 * Vercel Cron Job — runs every Monday at 08:05 UTC (five minutes after the
 * weekly coaching digest, so a coach who gets both sees the digest first).
 *
 * For each coach whose teams collected at least one `parent_reactions` row in
 * the prior calendar week (Mon–Sun), sends ONE rollup email summarising the
 * week's reactions: total count plus the top-3 quoted notes (parent first
 * name + verbatim message). No AI rewriting — the parent's own words are the
 * artifact. No tier gate — this is free-tier retention, mirroring 0023.
 *
 * The SELECT against `parent_reactions` is intentionally narrow:
 *   reaction, message, parent_name, created_at
 * The GET route at /api/parent-reactions joins `players(name, nickname)` for
 * the in-app inbox, but the rollup email NEVER reads that join — the rendered
 * HTML must not contain any roster player name, only freely-typed parent
 * messages (treated as parent content, not minor data).
 *
 * Protected by CRON_SECRET. Coaches opt out via
 * `preferences.weekly_parent_rollup = false` (a NEW key, independent from the
 * 0023 digest's `disable_weekly_digest`). Dedup:
 * `preferences.parent_rollup_week_<YYYY-MM-DD>` is set after each successful
 * send so a second invocation in the same week is a no-op.
 */

import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { isCoachPaused } from '@/lib/coach-pause-utils';
import {
  getPriorWeekMonday,
  getWeekWindow,
  formatWeekLabel,
  isParentRollupDisabled,
  hasAlreadySentRollup,
  markRollupSent,
  selectTopReactions,
  buildRollupSubject,
  buildRollupHtml,
  type RollupReaction,
} from '@/lib/weekly-parent-rollup-utils';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.youthsportsiq.com';
const BATCH_SIZE = 50;
const TOP_N = 3;

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  // Mirrors src/app/api/cron/weekly-digest/route.ts lines 49–57: when
  // CRON_SECRET is set, only a matching Bearer is honoured; otherwise the
  // route is open (matches the digest's stance for dev/local invocations).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = await createServiceSupabase();

  // ── Compute prior-week window ───────────────────────────────────────────────
  const now = new Date();
  const mondayStr = getPriorWeekMonday(now);
  const { start: weekStart, end: weekEnd } = getWeekWindow(mondayStr);
  const weekLabel = formatWeekLabel(weekStart, weekEnd);

  // gte / lte against created_at need a full-day window on each end. Use
  // T00:00:00Z / T23:59:59Z so a reaction logged at 23:55 on Sunday still lands
  // in the week and 00:00 Monday of the NEXT week doesn't accidentally bleed in.
  const startIso = `${weekStart}T00:00:00Z`;
  const endIso = `${weekEnd}T23:59:59Z`;

  let offset = 0;
  let totalSent = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // ── Page through coaches ────────────────────────────────────────────────────
  while (true) {
    const { data: coaches, error: coachesErr } = await admin
      .from('coaches')
      .select('id, email, full_name, preferences, paused_until')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (coachesErr) {
      console.error('[weekly-parent-rollup] DB error fetching coaches:', coachesErr.message);
      return NextResponse.json({ error: coachesErr.message }, { status: 500 });
    }

    if (!coaches || coaches.length === 0) break;

    for (const coach of coaches) {
      try {
        // ── Paused coaches are silent (ticket 0042) ─────────────────────────
        // Short-circuit BEFORE the opt-out / dedup gates so no preferences
        // write is earned for a paused coach.
        if (isCoachPaused(coach as { paused_until: string | null | undefined })) {
          totalSkipped++;
          continue;
        }
        // ── Opt-out + dedup ──────────────────────────────────────────────────
        if (isParentRollupDisabled(coach.preferences)) {
          totalSkipped++;
          continue;
        }
        if (hasAlreadySentRollup(coach.preferences, mondayStr)) {
          totalSkipped++;
          continue;
        }
        if (!coach.email) {
          totalSkipped++;
          continue;
        }

        // ── Read the prior week's reactions for this coach ───────────────────
        // The select() column list is the COPPA boundary: NEVER request a
        // `players(name, nickname)` join here, even though the GET route does
        // for the in-app inbox. If a future change tries to widen the SELECT,
        // the route test's planted ZZ-CHILD-MARKER guard fails the gate.
        //
        // Ticket 0056 — `id` is added to the SELECT so each rendered quote
        // can carry an ?openReply=<id> deep-link to the in-app thank-you
        // sheet. `id` is the reaction's own primary key, not a child
        // descriptor.
        const { data: reactions, error: reactionsErr } = await admin
          .from('parent_reactions')
          .select('id, reaction, message, parent_name, created_at')
          .eq('coach_id', coach.id)
          .gte('created_at', startIso)
          .lte('created_at', endIso)
          .order('created_at', { ascending: false });

        if (reactionsErr) {
          console.error('[weekly-parent-rollup] reactions read failed:', coach.id, reactionsErr.message);
          totalErrors++;
          continue;
        }

        const rows: RollupReaction[] = (reactions ?? []).map((r) => ({
          id: r.id ?? undefined,
          reaction: r.reaction ?? '❤️',
          message: r.message ?? null,
          parent_name: r.parent_name ?? null,
          created_at: r.created_at ?? startIso,
        }));

        // A coach whose teams had zero reactions this week gets NO email —
        // silence beats an empty "0 reactions this week" note that would read
        // like a guilt trip.
        if (rows.length === 0) {
          totalSkipped++;
          continue;
        }

        const topReactions = selectTopReactions(rows, { limit: TOP_N });

        const subject = buildRollupSubject(coach.full_name ?? 'Coach', weekLabel);
        const html = buildRollupHtml({
          coachName: coach.full_name ?? 'Coach',
          weekLabel,
          totalCount: rows.length,
          topReactions,
          appUrl: APP_URL,
        });

        const result = await sendEmail({ to: coach.email, subject, html });

        if (result.success) {
          // Preserve every existing preferences key — the 0023 digest dedup +
          // opt-out must round-trip byte-identical.
          const nextPrefs = markRollupSent(coach.preferences, mondayStr);
          await admin.from('coaches').update({ preferences: nextPrefs }).eq('id', coach.id);
          totalSent++;
        } else {
          console.error('[weekly-parent-rollup] send failed:', coach.email, result.error);
          totalErrors++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[weekly-parent-rollup] unexpected error for coach', coach.id, msg);
        totalErrors++;
      }
    }

    if (coaches.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  console.log(
    `[weekly-parent-rollup] done — week=${mondayStr} sent=${totalSent} skipped=${totalSkipped} errors=${totalErrors}`,
  );
  return NextResponse.json({
    week: mondayStr,
    sent: totalSent,
    skipped: totalSkipped,
    errors: totalErrors,
  });
}
