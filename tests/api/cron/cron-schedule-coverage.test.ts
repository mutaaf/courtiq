/**
 * Guard test — every cron route under src/app/api/cron/* MUST have a matching
 * schedule entry in vercel.json.
 *
 * Why this exists: ticket 0042's `coach-quiet-check-in` route shipped fully
 * tested but was never added to vercel.json's `crons` array, so on production
 * no scheduler ever fired it — the feature lived on disk but never in a coach's
 * inbox. It went undetected for weeks because nothing asserted the route<->cron
 * registry stayed in sync. This test fails the build the moment a cron route is
 * added (or renamed) without a corresponding schedule, closing the whole class
 * of "orphan cron" bug rather than just the one instance.
 *
 * If a cron route is intentionally manual-invoke only (no scheduler), add its
 * slug to MANUAL_ONLY below with a comment explaining why.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Cron routes that are deliberately invoked manually / by another trigger and
// must NOT be scheduled in vercel.json. Keep empty unless there is a real one.
const MANUAL_ONLY = new Set<string>([]);

const ROOT = process.cwd();
const CRON_DIR = join(ROOT, 'src', 'app', 'api', 'cron');

function cronRouteSlugs(): string[] {
  return readdirSync(CRON_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(CRON_DIR, d.name, 'route.ts')))
    .map((d) => d.name)
    .sort();
}

function scheduledSlugs(): string[] {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
  const crons: Array<{ path: string; schedule: string }> = vercel.crons ?? [];
  return crons.map((c) => c.path.replace(/^\/api\/cron\//, '')).sort();
}

describe('cron schedule coverage', () => {
  it('every cron route is scheduled in vercel.json (or explicitly manual-only)', () => {
    const routes = cronRouteSlugs();
    const scheduled = new Set(scheduledSlugs());
    const orphans = routes.filter((slug) => !scheduled.has(slug) && !MANUAL_ONLY.has(slug));
    expect(orphans, `cron route(s) with no vercel.json schedule: ${orphans.join(', ')}`).toEqual([]);
  });

  it('every vercel.json cron points at a real route (no dangling schedules)', () => {
    const routes = new Set(cronRouteSlugs());
    const dangling = scheduledSlugs().filter((slug) => !routes.has(slug));
    expect(dangling, `vercel.json schedules with no route: ${dangling.join(', ')}`).toEqual([]);
  });

  it('every cron schedule is a valid 5-field cron expression', () => {
    const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
    const crons: Array<{ path: string; schedule: string }> = vercel.crons ?? [];
    for (const c of crons) {
      const fields = c.schedule.trim().split(/\s+/);
      expect(fields, `${c.path} has a malformed schedule: "${c.schedule}"`).toHaveLength(5);
    }
  });
});
