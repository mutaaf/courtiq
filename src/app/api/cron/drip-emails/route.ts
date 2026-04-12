/**
 * POST /api/cron/drip-emails
 *
 * Vercel Cron Job — runs daily at 09:00 UTC.
 * Scans all coaches, finds drip emails that are due, sends them,
 * and records sent keys in coach.preferences.drip_sent.
 *
 * Protected by CRON_SECRET environment variable (Vercel sets the
 * Authorization: Bearer <secret> header automatically for cron invocations).
 */

import { createServiceSupabase } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { getDueEmails, parseSentKeys, type DripKey } from '@/lib/email-drip';
import { NextResponse } from 'next/server';

// Batch size to avoid hitting Supabase row limits in one query
const BATCH_SIZE = 100;

export async function POST(request: Request) {
  // ── Auth check ────────────────────────────────────────────────────────────
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const admin = await createServiceSupabase();

  let offset = 0;
  let totalProcessed = 0;
  let totalSent = 0;
  let totalErrors = 0;

  // ── Page through all coaches ───────────────────────────────────────────────
  while (true) {
    const { data: coaches, error } = await admin
      .from('coaches')
      .select('id, email, full_name, preferences, created_at')
      .order('created_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('[drip-cron] DB error fetching coaches:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!coaches || coaches.length === 0) break;

    for (const coach of coaches) {
      totalProcessed++;

      const sentKeys = parseSentKeys(coach.preferences);
      const due = getDueEmails(coach.created_at, sentKeys);

      if (due.length === 0) continue;

      for (const drip of due) {
        const result = await sendEmail({
          to: coach.email,
          subject: drip.subject,
          html: drip.buildHtml(coach.full_name),
        });

        if (result.success) {
          // Update preferences optimistically — merge new key into existing list
          const updatedPrefs = {
            ...((coach.preferences as Record<string, unknown>) ?? {}),
            drip_sent: [...sentKeys, drip.key] as DripKey[],
          };

          // Also update the in-memory sentKeys so subsequent emails in the
          // same loop iteration don't double-send
          sentKeys.push(drip.key);

          const { error: updateError } = await admin
            .from('coaches')
            .update({ preferences: updatedPrefs })
            .eq('id', coach.id);

          if (updateError) {
            console.error(
              `[drip-cron] Failed to persist drip_sent for coach ${coach.id}:`,
              updateError.message
            );
            // Don't count as error — email was sent; the next run will retry
            // because the key wasn't persisted.
          }

          totalSent++;
          console.info(
            `[drip-cron] Sent ${drip.key} to ${coach.email} (id=${result.id})`
          );
        } else {
          totalErrors++;
          console.error(
            `[drip-cron] Failed to send ${drip.key} to ${coach.email}: ${result.error}`
          );
        }
      }
    }

    if (coaches.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
  }

  return NextResponse.json({
    ok: true,
    totalProcessed,
    totalSent,
    totalErrors,
  });
}

// Allow GET for manual health-check pings (no emails sent)
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return NextResponse.json({ ok: true, status: 'drip-emails cron is reachable' });
}
