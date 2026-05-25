/**
 * Ticket 0031 — readProgramFocus(): the shared resolver that the plan + arc
 * routes use to thread the program director's org-scoped weekly focus into their
 * prompts as a soft hint. It reads ONLY org config (config_overrides) through the
 * existing cascade, gated by the org tier.
 *
 * Behaviours under test:
 *  (AC5/AC6) returns the trimmed focus for an Organization-tier team with a focus
 *            set; returns null off the Organization tier (gate is real, not the
 *            UI's job); returns null when unset.
 *  (AC6 COPPA) it reads org config only — it NEVER queries the `players` table, so
 *            it can carry no per-minor data.
 *
 * .test.ts (NOT .spec.ts) — vitest excludes the Playwright spec glob.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readProgramFocus } from '@/lib/ai/program-focus';

const tablesQueried: string[] = [];

function makeAdmin(opts: { tier: string; orgId?: string | null; focusValue?: unknown }) {
  return {
    from(table: string) {
      tablesQueried.push(table);
      if (table === 'teams') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { org_id: opts.orgId ?? 'org-1', organizations: { tier: opts.tier } },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'config_overrides') {
        const rows = opts.focusValue === undefined
          ? []
          : [{ domain: 'program', key: 'focus', value: opts.focusValue }];
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: rows, error: null }),
            }),
          }),
        };
      }
      throw new Error(`readProgramFocus must not query table: ${table}`);
    },
  };
}

beforeEach(() => {
  tablesQueried.length = 0;
});

describe('readProgramFocus', () => {
  it('returns the trimmed focus for an Organization-tier team with a focus set', async () => {
    const admin = makeAdmin({ tier: 'organization', focusValue: '  spacing & off-ball movement  ' });
    const focus = await readProgramFocus('team-1', admin);
    expect(focus).toBe('spacing & off-ball movement');
  });

  it('returns null off the Organization tier even when a focus row exists (tier gate is real)', async () => {
    const admin = makeAdmin({ tier: 'pro_coach', focusValue: 'spacing' });
    const focus = await readProgramFocus('team-1', admin);
    expect(focus).toBeNull();
    // It short-circuits on the tier gate and never even reads config_overrides.
    expect(tablesQueried).not.toContain('config_overrides');
  });

  it('returns null when the Organization-tier org has set no focus', async () => {
    const admin = makeAdmin({ tier: 'organization', focusValue: undefined });
    const focus = await readProgramFocus('team-1', admin);
    expect(focus).toBeNull();
  });

  it('COPPA: it reads org config only and NEVER queries the players table', async () => {
    const admin = makeAdmin({ tier: 'organization', focusValue: 'transition defense' });
    await readProgramFocus('team-1', admin);
    expect(tablesQueried).toContain('config_overrides');
    expect(tablesQueried).not.toContain('players');
  });
});
