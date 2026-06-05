/**
 * Ticket 0068 — middleware publicPaths allow-list.
 *
 * Per LESSONS#0091 / #0104 / #0038: every new public root route a crawler
 * (or unauthed parent) must reach has to be added to the auth proxy's
 * `publicPaths` in the SAME PR — the proxy short-circuits otherwise and
 * returns 401 / 30x to /login before the route's own logic runs.
 *
 * /opener/ is the public parent-facing card surface; /api/season-opener/
 * is its public token resolver. The create POST self-enforces auth (LESSONS
 * pattern shared with /api/practice-plan-shares/, /api/drill-shares/,
 * /api/sub-handoff/).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const middlewareSource = readFileSync(
  join(process.cwd(), 'src/lib/supabase/middleware.ts'),
  'utf-8',
);

describe('middleware.publicPaths (ticket 0068)', () => {
  it('lists /opener/ so unauthed parents can render the season-opener card', () => {
    expect(middlewareSource).toContain("'/opener/'");
  });

  it('lists /api/season-opener/ so the public token GET is reachable', () => {
    expect(middlewareSource).toContain("'/api/season-opener/'");
  });
});
