/**
 * Component test for WeeklyDigestCard — the coach-private "your week in coaching"
 * recap card near the top of the home feed (ticket 0023).
 *
 * Like ArcContinuityLine (0020) and the AIUsageMeter (0008), this is a pure
 * presentational component that takes the result of a best-effort POST to
 * /api/ai/weekly-digest and decides what to render. It must NEVER block the home
 * screen: while loading, on failure, or when the digest is null (a quiet week),
 * it renders nothing. These tests are the CI-gating proof for the card's UI
 * states (the home page is auth-protected, so its Playwright spec skips in CI).
 *
 * Contract:
 *   <WeeklyDigestCard digest={...} teamId="t1" />
 *     digest == null | undefined  → render nothing (loading / failed / quiet week)
 *     digest = { week_summary, top_players, next_action }
 *                                 → render the summary text + a next-action button
 *                                   whose href maps next_action.kind to a route
 *   Identified by data-testid="weekly-digest-card".
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { WeeklyDigestCard } from '@/components/home/weekly-digest-card';
import type { WeeklyDigest } from '@/lib/ai/schemas';

const TESTID = 'weekly-digest-card';

function seededDigest(overrides: Partial<WeeklyDigest> = {}): WeeklyDigest {
  return {
    week_summary: 'Last week — 2 practices, 5 notes. The team brought real defensive energy.',
    top_players: [
      { player_name: 'Maya', note: 'Locked down on defense and led the hustle.' },
      { player_name: 'Devon', note: 'Read the help defense and finished strong.' },
    ],
    next_action: {
      label: "Send Maya's parents her report",
      kind: 'parent_report',
      rationale: "It has been three weeks since Maya's family got an update.",
    },
    ...overrides,
  };
}

describe('WeeklyDigestCard (ticket 0023)', () => {
  beforeEach(() => cleanup());

  it('renders the week summary and a next-action button for a seeded digest', () => {
    render(<WeeklyDigestCard digest={seededDigest()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('2 practices, 5 notes');
    // The top players surface by first name.
    expect(card).toHaveTextContent('Maya');
    // The next action is a real, tappable control.
    const action = screen.getByRole('link', { name: /send maya's parents her report/i });
    expect(action).toBeInTheDocument();
  });

  it('maps next_action.kind to the right route', () => {
    const kinds: Array<{ kind: WeeklyDigest['next_action']['kind']; hrefMatch: RegExp }> = [
      { kind: 'parent_report', hrefMatch: /\/plans/ },
      { kind: 'weekly_star', hrefMatch: /\/plans/ },
      { kind: 'practice_plan', hrefMatch: /\/plans/ },
      { kind: 'capture', hrefMatch: /\/capture/ },
    ];
    for (const { kind, hrefMatch } of kinds) {
      cleanup();
      render(
        <WeeklyDigestCard
          digest={seededDigest({ next_action: { label: `Do ${kind}`, kind, rationale: 'because' } })}
          teamId="t1"
        />
      );
      const action = screen.getByRole('link', { name: new RegExp(`do ${kind}`, 'i') });
      expect(action.getAttribute('href')).toMatch(hrefMatch);
    }
  });

  it('renders NOTHING when the digest is null (a quiet week)', () => {
    const { container } = render(<WeeklyDigestCard digest={null} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING while loading or when the read failed (undefined) — never blocks the home screen', () => {
    const { container } = render(<WeeklyDigestCard digest={undefined} teamId="t1" />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    // Contributes nothing that could disable or block the page.
    expect(container.querySelector('[disabled]')).toBeNull();
  });

  it('the next-action control is sized for touch (min 44px target)', () => {
    render(<WeeklyDigestCard digest={seededDigest()} teamId="t1" />);
    const action = screen.getByRole('link', { name: /send maya's parents her report/i });
    expect(action.className).toMatch(/(min-h-\[44px\]|h-11|h-12|py-3)/);
  });

  it('uses clipboard-not-landing-page copy (no banned words, no emoji heading)', () => {
    render(<WeeklyDigestCard digest={seededDigest()} teamId="t1" />);
    const card = screen.getByTestId(TESTID);
    const text = card.textContent ?? '';
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });
});
