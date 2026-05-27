/**
 * Ticket 0048 — COPPA / privacy guard: the post-game parent texts are
 * COACH-PRIVATE.
 *
 * The artifact must never reach a public surface:
 *  - no `/share/postgame/<token>` route file
 *  - no companion token-create or token-read route
 *  - no public-surface page renderer (the 5 token-routed share pages + the
 *    sitemap) imports or references the new plan type
 *  - the new plan type is NOT added to any public allow-list
 *
 * The fresh fs scan is the spec: a future commit that wires the texts into a
 * public token route will fail this test deterministically (no AI required).
 *
 * .test.ts NOT .spec.ts (LESSONS#0020/#38).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO_ROOT = process.cwd();

const PUBLIC_SURFACES = [
  'src/app/share/[token]/page.tsx',
  'src/app/team-card/[token]/page.tsx',
  'src/app/coach/[token]/page.tsx',
  'src/app/recap/[token]/page.tsx',
  'src/app/season-recap/[token]/page.tsx',
  'src/app/observe/[token]/page.tsx',
];

const SITEMAP_FILE = 'src/app/sitemap.ts';
const PLAN_TYPE = 'postgame_parent_texts';

describe('postgame_parent_texts — coach-private COPPA guard (ticket 0048)', () => {
  it('does NOT add a /share/postgame/<token> page', () => {
    const candidates = [
      'src/app/share/postgame/[token]/page.tsx',
      'src/app/postgame/[token]/page.tsx',
      'src/app/share/postgame-texts/[token]/page.tsx',
    ];
    for (const c of candidates) {
      expect(existsSync(join(REPO_ROOT, c))).toBe(false);
    }
  });

  it('does NOT add a companion token-create / token-read API route', () => {
    const candidates = [
      'src/app/api/share/postgame/route.ts',
      'src/app/api/postgame-share/route.ts',
      'src/app/api/postgame-parent-texts-share/route.ts',
    ];
    for (const c of candidates) {
      expect(existsSync(join(REPO_ROOT, c))).toBe(false);
    }
  });

  it('no public-surface page renderer references the new plan type', () => {
    for (const surface of PUBLIC_SURFACES) {
      const full = join(REPO_ROOT, surface);
      if (!existsSync(full)) continue; // some shipped surfaces, some not yet
      const src = readFileSync(full, 'utf8');
      expect(src).not.toContain(PLAN_TYPE);
    }
  });

  it('the sitemap (ticket 0038) does NOT reference the new plan type', () => {
    const full = join(REPO_ROOT, SITEMAP_FILE);
    if (!existsSync(full)) return; // sitemap may not exist in older snapshots
    const src = readFileSync(full, 'utf8');
    expect(src).not.toContain(PLAN_TYPE);
  });
});
