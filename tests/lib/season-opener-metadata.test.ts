/**
 * Ticket 0068 — pure helper for /opener/[token] OG metadata.
 *
 * LESSONS#0060 — extract the title/description/URL branching into a pure
 * helper so generateMetadata is unit-testable without exercising satori /
 * next/og.
 */
import { describe, it, expect } from 'vitest';
import { buildSeasonOpenerMetadata } from '@/lib/season-opener-metadata';

const APP = 'https://example.test';
const TOKEN = 'tok-001';
const FULL_PAYLOAD = {
  teamName: 'Hawks U10',
  ageGroup: '8-10',
  sportName: 'Basketball',
  seasonLabel: 'Spring 2026',
  coachFirstName: 'Sarah',
  focusLine: 'closeouts and good sportsmanship',
};

describe('buildSeasonOpenerMetadata (ticket 0068)', () => {
  it('builds a title that names the team and the coach', () => {
    const meta = buildSeasonOpenerMetadata(FULL_PAYLOAD, { token: TOKEN, appUrl: APP });
    // meta.title can be a TemplateString in Next's Metadata type; we set it
    // to a plain string in the helper so a String() cast is safe and keeps
    // tsc honest without disabling strict typing.
    const title = String(meta.title ?? '');
    expect(title).toContain('Hawks U10');
    expect(title.toLowerCase()).toContain('sarah');
  });

  it('builds a description that names the focus line', () => {
    const meta = buildSeasonOpenerMetadata(FULL_PAYLOAD, { token: TOKEN, appUrl: APP });
    expect(meta.description).toContain('closeouts and good sportsmanship');
  });

  it('builds the canonical URL from the appUrl + token', () => {
    const meta = buildSeasonOpenerMetadata(FULL_PAYLOAD, { token: TOKEN, appUrl: APP });
    expect(meta.openGraph?.url).toBe(`${APP}/opener/${TOKEN}`);
    expect(meta.alternates?.canonical).toBe(`${APP}/opener/${TOKEN}`);
  });

  it('falls back to the generic SportsIQ title on a null payload', () => {
    const meta = buildSeasonOpenerMetadata(null, { token: TOKEN, appUrl: APP });
    expect(String(meta.title ?? '')).toBe('Season Opener — SportsIQ');
    expect(meta.openGraph?.url).toBe(`${APP}/opener/${TOKEN}`);
  });

  it('never includes a banned voice word in the rendered title / description', () => {
    const banned = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];
    for (const payload of [FULL_PAYLOAD, null]) {
      const meta = buildSeasonOpenerMetadata(payload, { token: TOKEN, appUrl: APP });
      const blob = `${String(meta.title ?? '')}\n${String(meta.description ?? '')}`.toLowerCase();
      for (const word of banned) {
        expect(blob).not.toContain(word);
      }
    }
  });
});
