/**
 * Public `/account/pause?token=...` page (ticket 0042).
 *
 * Server component. Reads the `token` from `searchParams`, verifies it via
 * `applyPauseToken(token, CRON_SECRET)`, and on success writes
 * `coaches.paused_until = pausedUntilIso` using the service-role client. On
 * any failure (missing / malformed / wrong-signature / wrong-secret) renders
 * the error state and writes NOTHING.
 *
 * The route is added to `publicPaths` in `src/lib/supabase/middleware.ts` so
 * the auth proxy doesn't 30x to `/login` (LESSONS#38).
 *
 * Voice instruction is positive (LESSONS#23) — clipboard tone, no breathless
 * hype words. Dark zinc/orange aesthetic, 44px touch targets, light-only
 * surface chrome since this is the parent-portal-style polite landing.
 */
import { createServiceSupabase } from '@/lib/supabase/server';
import { applyPauseToken } from '@/lib/coach-pause-utils';

export const dynamic = 'force-dynamic';

function formatTargetDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface PageProps {
  searchParams: Promise<{ token?: string }>;
}

export default async function PausePage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const secret = process.env.CRON_SECRET ?? '';

  const result = applyPauseToken({ token, secret });

  let state: 'ok' | 'invalid' | 'error' = 'invalid';
  let untilLabel = '';

  if (result.ok) {
    try {
      const admin = await createServiceSupabase();
      const { error } = await admin
        .from('coaches')
        .update({ paused_until: result.pausedUntilIso })
        .eq('id', result.coachId);

      if (error) {
        state = 'error';
      } else {
        state = 'ok';
        untilLabel = formatTargetDate(result.pausedUntilIso);
      }
    } catch {
      state = 'error';
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <div className="mx-auto w-full max-w-md px-5 py-12 flex-1 flex flex-col justify-center">
        <p className="text-orange-500 font-semibold text-base mb-6 tracking-tight">SportsIQ</p>

        {state === 'ok' ? (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h1 className="text-xl font-bold text-zinc-50 mb-3">You&#39;re paused.</h1>
            <p className="text-zinc-300 text-base leading-relaxed">
              Paused until {untilLabel}. We&#39;ll stop the emails. See you when you come back.
            </p>
            <p className="text-zinc-500 text-sm mt-5 leading-relaxed">
              Coming back sooner? Sign in and tap unpause on your settings page.
            </p>
          </div>
        ) : (
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-6">
            <h1 className="text-xl font-bold text-zinc-50 mb-3">This pause link isn&#39;t valid.</h1>
            <p className="text-zinc-300 text-base leading-relaxed">
              The link may have expired or been mistyped. No changes were made.
            </p>
            <p className="text-zinc-500 text-sm mt-5 leading-relaxed">
              If you&#39;d still like to pause emails, sign in to SportsIQ and use the unpause control in
              your settings, or wait for the next check-in email.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
