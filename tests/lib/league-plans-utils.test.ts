/**
 * Ticket 0055 — pure helpers for the league-plans discovery surface.
 *
 * `formatLeaguePlanRow` is the single source of truth for the human-readable
 * line "Coach <first_name> — <plan_title> — <sport> age <age_group>" that the
 * <LeaguePlansSection /> renders for each peer plan. The route and component
 * both consume it so they can never disagree on the row format.
 *
 * No DB access, no fetch — just string composition. .test.ts NOT .spec.ts
 * (LESSONS#38).
 */
import { describe, it, expect } from 'vitest';
import { formatLeaguePlanRow } from '@/lib/league-plans-utils';

describe('formatLeaguePlanRow (ticket 0055)', () => {
  it('composes the canonical "Coach <first> — <title> — <sport> age <ag>" line', () => {
    expect(
      formatLeaguePlanRow({
        coachFirstName: 'James',
        planTitle: 'Tuesday catch-up',
        sportSlug: 'flag_football',
        ageGroup: '8',
      }),
    ).toBe('Coach James — Tuesday catch-up — flag football age 8');
  });

  it('replaces underscores in the sport slug with spaces (volleyball / soccer / etc.)', () => {
    expect(
      formatLeaguePlanRow({
        coachFirstName: 'Sarah',
        planTitle: 'Closeout passing',
        sportSlug: 'flag_football',
        ageGroup: '9',
      }),
    ).toBe('Coach Sarah — Closeout passing — flag football age 9');

    expect(
      formatLeaguePlanRow({
        coachFirstName: 'Maya',
        planTitle: '30-minute station rotation',
        sportSlug: 'basketball',
        ageGroup: '11-13',
      }),
    ).toBe('Coach Maya — 30-minute station rotation — basketball age 11-13');
  });

  it('falls back to "Coach" when the first name is missing — never crashes', () => {
    expect(
      formatLeaguePlanRow({
        coachFirstName: null,
        planTitle: 'Tuesday plan',
        sportSlug: 'soccer',
        ageGroup: '9',
      }),
    ).toBe('Coach — Tuesday plan — soccer age 9');
  });

  it('omits the trailing " age <ag>" segment when the age group is null', () => {
    expect(
      formatLeaguePlanRow({
        coachFirstName: 'James',
        planTitle: 'Tuesday catch-up',
        sportSlug: 'flag_football',
        ageGroup: null,
      }),
    ).toBe('Coach James — Tuesday catch-up — flag football');
  });

  it('contains no AGENTS.md banned voice tokens', () => {
    const line = formatLeaguePlanRow({
      coachFirstName: 'James',
      planTitle: 'Tuesday catch-up',
      sportSlug: 'flag_football',
      ageGroup: '8',
    });
    // Positive scan — never enumerate banned tokens in fixtures (LESSONS#23).
    expect(/journey|amazing|exciting|elevate|empower|synergy/i.test(line)).toBe(false);
  });
});
