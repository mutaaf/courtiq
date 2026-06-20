/**
 * Ticket 0092 — pure helper test for the recurring-observer-helper
 * derivation.
 *
 * The /home `<RealCoCoachCard />` learns "this helper has helped me
 * 3 times across 2 practices" from a pure helper that takes the row
 * shape the route reads from the existing 0067 `sub_handoffs` table
 * (the closest structural primitive we have for "the same helper
 * showed up for me again" — see the Implementation log on the ticket
 * for the schema-wins-over-prose reconciliation).
 *
 * Each `it` maps to one acceptance-criteria sub-bullet on the ticket.
 *
 * .test.ts NOT .spec.ts (LESSONS#0038).
 *
 * Voice posture: this jsdoc instructs positively (LESSONS#0023). The
 * helper itself never embeds a banned word verbatim. Defensive scans
 * use a literal space, never `\s+` (LESSONS#0061).
 */
import { describe, it, expect } from 'vitest';
import {
  findRecurringObserverHelpers,
  type RecurringObserverOpenRow,
  type RecurringObserverInvite,
} from '@/lib/recurring-observer-helpers';

// One canonical "now": Sunday 2026-06-21T12:00:00Z (UTC posture, LESSONS#0115).
const NOW_MS = Date.parse('2026-06-21T12:00:00Z');
const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

function row(
  helper: string,
  practiceId: string | null,
  daysAgo: number,
  opts: { displayName?: string | null; ranDrill?: boolean; teamId?: string } = {},
): RecurringObserverOpenRow {
  return {
    helper_identifier: helper,
    display_name: opts.displayName ?? null,
    team_id: opts.teamId ?? TEAM_A,
    opened_at: new Date(NOW_MS - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
    practice_id: practiceId,
    ran_drill: opts.ranDrill ?? false,
  };
}

describe('findRecurringObserverHelpers (ticket 0092)', () => {
  it('(i) empty rows → empty array', () => {
    expect(
      findRecurringObserverHelpers({
        observerOpenRows: [],
        invitesAlreadySent: [],
        nowMs: NOW_MS,
      }),
    ).toEqual([]);
  });

  it('(ii) 1 open by 1 helper → excluded (below opens threshold)', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [row('h-aisha', 'p-1', 2, { displayName: 'Aisha' })],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toEqual([]);
  });

  it('(iii) 3 opens by 1 helper across 1 practice → excluded (distinct-practice threshold)', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-1', 3, { displayName: 'Aisha' }),
        row('h-aisha', 'p-1', 4, { displayName: 'Aisha' }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toEqual([]);
  });

  it('(iv) 3 opens by 1 helper across 2 practices → INCLUDED', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 6, { displayName: 'Aisha' }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      helperIdentifier: 'h-aisha',
      displayName: 'Aisha',
      openCount: 3,
      distinctPracticeCount: 2,
      ranDrill: false,
      teamId: TEAM_A,
    });
  });

  it('(v) helper meeting threshold but invited via 0015 5 days ago → EXCLUDED', () => {
    const invites: RecurringObserverInvite[] = [
      {
        helper_identifier: 'h-aisha',
        team_id: TEAM_A,
        sent_at: new Date(NOW_MS - 5 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha' }),
      ],
      invitesAlreadySent: invites,
      nowMs: NOW_MS,
    });
    expect(result).toEqual([]);
  });

  it('(vi) helper meeting threshold invited 45 days ago → INCLUDED (window past)', () => {
    const invites: RecurringObserverInvite[] = [
      {
        helper_identifier: 'h-aisha',
        team_id: TEAM_A,
        sent_at: new Date(NOW_MS - 45 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha' }),
      ],
      invitesAlreadySent: invites,
      nowMs: NOW_MS,
    });
    expect(result).toHaveLength(1);
  });

  it('(vii) ran_drill: true on any open row → result has ranDrill: true', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha', ranDrill: true }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toHaveLength(1);
    expect(result[0].ranDrill).toBe(true);
  });

  it('(viii) opens older than lookbackDays are ignored', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 30, { displayName: 'Aisha' }), // outside the 14-day default
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    // Only 1 open within the window → below threshold.
    expect(result).toEqual([]);
  });

  it('(ix) ties on openCount sorted by lastOpenAt desc for determinism', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        // Helper B: 2 opens, latest 4 days ago.
        row('h-b', 'p-1', 4, { displayName: 'Bess' }),
        row('h-b', 'p-2', 5, { displayName: 'Bess' }),
        // Helper A: 2 opens, latest 2 days ago (more recent → sorted first).
        row('h-a', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-a', 'p-2', 6, { displayName: 'Aisha' }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result.map((r) => r.helperIdentifier)).toEqual(['h-a', 'h-b']);
  });

  it('(x) raw displayName is preserved by the helper (component does the literal-space scan)', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha Walker' }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha Walker' }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    // The helper preserves the raw string; the COMPONENT does the
    // literal-space first-name-only render per LESSONS#0061.
    expect(result[0].displayName).toBe('Aisha Walker');
  });

  it('(xi) the returned shape contains no AGENTS.md banned word', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha', ranDrill: true }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    const serialized = JSON.stringify(result).toLowerCase();
    for (const w of [
      'journey',
      'amazing',
      'exciting',
      'elevate',
      'empower',
      'synergy',
    ]) {
      expect(serialized).not.toContain(w);
    }
  });

  it('(xii) caps at 5 entries when 6+ qualify', () => {
    const openRows: RecurringObserverOpenRow[] = [];
    for (let i = 0; i < 6; i++) {
      openRows.push(
        row(`h-${i}`, `p-${i}-a`, 2 + i, { displayName: `Helper${i}` }),
        row(`h-${i}`, `p-${i}-b`, 3 + i, { displayName: `Helper${i}` }),
      );
    }
    const result = findRecurringObserverHelpers({
      observerOpenRows: openRows,
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toHaveLength(5);
  });

  it('does NOT mutate the input arrays (LESSONS#0070)', () => {
    const opens = [
      row('h-aisha', 'p-1', 2, { displayName: 'Aisha' }),
      row('h-aisha', 'p-2', 5, { displayName: 'Aisha' }),
    ];
    const opensCopy = JSON.parse(JSON.stringify(opens));
    const invites: RecurringObserverInvite[] = [];
    findRecurringObserverHelpers({
      observerOpenRows: opens,
      invitesAlreadySent: invites,
      nowMs: NOW_MS,
    });
    expect(opens).toEqual(opensCopy);
  });

  it('treats null practice_id as not counting toward distinctPracticeCount', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', null, 2, { displayName: 'Aisha' }),
        row('h-aisha', null, 3, { displayName: 'Aisha' }),
        row('h-aisha', null, 4, { displayName: 'Aisha' }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toEqual([]);
  });

  it('helpers across two distinct teams are surfaced as one entry per team', () => {
    const result = findRecurringObserverHelpers({
      observerOpenRows: [
        row('h-aisha', 'p-1', 2, { displayName: 'Aisha', teamId: TEAM_A }),
        row('h-aisha', 'p-2', 5, { displayName: 'Aisha', teamId: TEAM_A }),
        row('h-aisha', 'p-3', 3, { displayName: 'Aisha', teamId: TEAM_B }),
        row('h-aisha', 'p-4', 6, { displayName: 'Aisha', teamId: TEAM_B }),
      ],
      invitesAlreadySent: [],
      nowMs: NOW_MS,
    });
    expect(result).toHaveLength(2);
    expect(new Set(result.map((r) => r.teamId))).toEqual(
      new Set([TEAM_A, TEAM_B]),
    );
  });
});
