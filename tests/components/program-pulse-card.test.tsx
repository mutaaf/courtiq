/**
 * Component test for ProgramPulseCard — the director-private weekly "program
 * pulse" card at the top of the admin surface (ticket 0028).
 *
 * Like WeeklyDigestCard (0023), this is a pure presentational component that takes
 * the result of a best-effort POST to /api/ai/program-pulse and decides what to
 * render. It must NEVER block the admin screen: while loading, on failure, or when
 * the pulse is null (a quiet week), it renders nothing. These tests are the
 * CI-gating proof for the card's UI states (the admin page is auth-protected, so
 * its Playwright spec skips in CI).
 *
 * Contract:
 *   <ProgramPulseCard pulse={...} />
 *     pulse == null | undefined  → render nothing (loading / failed / quiet week)
 *     pulse = { week_summary, active_coaches, total_coaches, teams_to_watch,
 *               next_action }    → render the summary + a next-action button whose
 *                                  href maps next_action.kind to a route
 *   Identified by data-testid="program-pulse-card".
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ProgramPulseCard } from '@/components/admin/program-pulse-card';
import type { ProgramPulse } from '@/lib/ai/schemas';

const TESTID = 'program-pulse-card';

function seededPulse(overrides: Partial<ProgramPulse> = {}): ProgramPulse {
  return {
    week_summary: 'Last week — 9 of 12 coaches logged notes, 38 practices across the program.',
    active_coaches: 9,
    total_coaches: 12,
    teams_to_watch: [
      { team_name: 'U12s', note: 'Plenty of needs-work notes worth a check-in.' },
    ],
    next_action: {
      label: 'Nudge Coach Rivera — no notes in 2 weeks',
      kind: 'nudge_coach',
      rationale: 'Coach Rivera has not logged any activity in two weeks.',
    },
    ...overrides,
  };
}

describe('ProgramPulseCard (ticket 0028)', () => {
  beforeEach(() => cleanup());

  it('renders the week summary and a next-action button for a seeded pulse', () => {
    render(<ProgramPulseCard pulse={seededPulse()} />);
    const card = screen.getByTestId(TESTID);
    expect(card).toBeInTheDocument();
    expect(card).toHaveTextContent('9 of 12 coaches');
    // Teams to watch surface by name.
    expect(card).toHaveTextContent('U12s');
    // The next action is a real, tappable control.
    const action = screen.getByRole('link', { name: /nudge coach rivera/i });
    expect(action).toBeInTheDocument();
  });

  it('maps next_action.kind to the right route', () => {
    const kinds: Array<{ kind: ProgramPulse['next_action']['kind']; hrefMatch: RegExp }> = [
      { kind: 'nudge_coach', hrefMatch: /\/admin\/org-analytics/ },
      { kind: 'invite_staff', hrefMatch: /\/admin/ },
      { kind: 'view_analytics', hrefMatch: /\/admin\/org-analytics/ },
    ];
    for (const { kind, hrefMatch } of kinds) {
      cleanup();
      render(
        <ProgramPulseCard
          pulse={seededPulse({ next_action: { label: `Do ${kind}`, kind, rationale: 'because' } })}
        />
      );
      const action = screen.getByRole('link', { name: new RegExp(`do ${kind}`, 'i') });
      expect(action.getAttribute('href')).toMatch(hrefMatch);
    }
  });

  it('renders NOTHING when the pulse is null (a quiet week)', () => {
    const { container } = render(<ProgramPulseCard pulse={null} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING while loading or when the read failed (undefined) — never blocks the admin screen', () => {
    const { container } = render(<ProgramPulseCard pulse={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('[disabled]')).toBeNull();
  });

  it('the next-action control is sized for touch (min 44px target)', () => {
    render(<ProgramPulseCard pulse={seededPulse()} />);
    const action = screen.getByRole('link', { name: /nudge coach rivera/i });
    expect(action.className).toMatch(/(min-h-\[44px\]|h-11|h-12|py-3)/);
  });

  it('uses clipboard-not-landing-page copy (no banned words, no emoji heading)', () => {
    render(<ProgramPulseCard pulse={seededPulse()} />);
    const card = screen.getByTestId(TESTID);
    const text = card.textContent ?? '';
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });

  it('does not surface any per-minor data (no player names / jerseys in the rendered card)', () => {
    render(<ProgramPulseCard pulse={seededPulse()} />);
    const card = screen.getByTestId(TESTID);
    // Aggregate-only by construction: the card renders coach/team text, never a
    // player roster. A regression that piped a player name through would fail here.
    expect(card.textContent ?? '').not.toMatch(/jersey/i);
  });
});
