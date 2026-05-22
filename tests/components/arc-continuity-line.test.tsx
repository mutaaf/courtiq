/**
 * Component test for ArcContinuityLine — the quiet "Defense Arc · session 2 of 3 ·
 * today: build on closeouts" continuity line shown above the record control on
 * Capture (ticket 0020).
 *
 * Like the AIUsageMeter (ticket 0008) and CarryoverStrip (ticket 0014), this is a
 * pure presentational component that takes the result of a best-effort read of
 * GET /api/ai/practice-arc/active (ticket 0018) and decides what to render. It
 * NEVER gates capture — its only job is to surface the active arc's session count
 * and the carried-forward coaching point. These tests cover the UI-visibility
 * acceptance criteria directly (the same render-the-component approach as
 * tests/components/ai-usage-meter.test.tsx), which is the CI-gating proof since
 * /capture is auth-protected and its Playwright spec skips in CI.
 *
 * Contract (consumes the REAL endpoint shape `ActiveArcResponse`, per LESSONS#39 —
 * the route returns snake_case `arc_title` and per-session
 * `key_coaching_point` / `carries_forward`, NOT the ticket prose's `arcTitle`):
 *   <ArcContinuityLine arc={...} />
 *     arc == null | undefined          → render nothing (no arc / loading / fetch failed)
 *     arc = { arc_title, total_sessions, currentSessionNumber, currentSession }
 *                                      → render "session N of M" + arc title + carried-forward text
 *     dismiss control tapped           → line gone, stays gone on re-render
 *   Identified by data-testid="arc-continuity-line".
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { ArcContinuityLine } from '@/components/capture/arc-continuity-line';
import type { ActiveArcResponse } from '@/app/api/ai/practice-arc/active/route';

const TESTID = 'arc-continuity-line';

/** A seeded active arc on session 2 of 3 with a carried-forward coaching point. */
function seededArc(overrides: Partial<ActiveArcResponse> = {}): ActiveArcResponse {
  return {
    arc_title: 'Defense Arc',
    total_sessions: 3,
    currentSessionNumber: 2,
    currentSession: {
      session_number: 2,
      theme: 'Help defense',
      key_coaching_point: 'build on closeouts',
      carries_forward: 'keep hands active on the closeout',
    },
    priorSession: {
      session_number: 1,
      theme: 'On-ball pressure',
      key_coaching_point: 'stay in a stance',
    },
    progression_note: 'Layer help onto last week’s on-ball work.',
    ...overrides,
  };
}

describe('ArcContinuityLine (ticket 0020)', () => {
  beforeEach(() => cleanup());

  // AC1: when the response has an active arc, a continuity line is visible whose
  // text matches /session \d+ of \d+/i and includes the arc title.
  it('renders the session count and arc title for a seeded active arc', () => {
    render(<ArcContinuityLine arc={seededArc()} />);
    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent(/session 2 of 3/i);
    expect(line).toHaveTextContent('Defense Arc');
  });

  // AC2: when there is no active arc ({ active: null } → arc === null), the line is
  // absent and produces no empty/placeholder element.
  it('renders NOTHING when there is no active arc (null)', () => {
    const { container } = render(<ArcContinuityLine arc={null} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // AC3 (degrade silently): when the read failed/timed out, arc is undefined → the
  // line renders nothing and contributes nothing that could disable capture (no
  // disabling element). Mirrors the 0008 usage-meter degrade-silently behavior.
  it('renders NOTHING while loading or when the read failed (undefined) and disables nothing', () => {
    const { container } = render(<ArcContinuityLine arc={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    expect(container.querySelector('[disabled]')).toBeNull();
  });

  // AC4: the line surfaces the carried-forward coaching point for the current
  // session — the rendered DOM contains that text for a seeded arc.
  it('surfaces the current session carried-forward coaching point text', () => {
    render(<ArcContinuityLine arc={seededArc()} />);
    const line = screen.getByTestId(TESTID);
    // The key coaching point is the carried-forward focus for today.
    expect(line).toHaveTextContent('build on closeouts');
  });

  // AC4 fallback: when key_coaching_point is absent, fall back to carries_forward
  // so the line still shows the carried-forward focus.
  it('falls back to carries_forward when key_coaching_point is missing', () => {
    const arc = seededArc({
      currentSession: {
        session_number: 2,
        carries_forward: 'keep hands active on the closeout',
      },
    });
    render(<ArcContinuityLine arc={arc} />);
    const line = screen.getByTestId(TESTID);
    expect(line).toHaveTextContent('keep hands active on the closeout');
  });

  // AC5: the line is dismissible for the session — tapping dismiss hides it and it
  // stays hidden on re-render (in-memory/session only, no new storage).
  it('hides the line after the dismiss control is tapped and stays hidden on re-render', () => {
    const { rerender } = render(<ArcContinuityLine arc={seededArc()} />);
    expect(screen.getByTestId(TESTID)).toBeInTheDocument();

    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    fireEvent.click(dismiss);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();

    // Same component instance re-renders (e.g. parent state change) — still hidden.
    rerender(<ArcContinuityLine arc={seededArc()} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  // The dismiss control is a real, labeled button with a 44px touch target
  // (AGENTS.md rule 7: mobile-first, 44px touch targets).
  it('exposes a labeled dismiss control sized for touch (min 44px)', () => {
    render(<ArcContinuityLine arc={seededArc()} />);
    const dismiss = screen.getByRole('button', { name: /dismiss/i });
    expect(dismiss).toBeInTheDocument();
    // 44px target enforced via a min-h/min-w utility class (h-11 w-11 = 44px).
    expect(dismiss.className).toMatch(/(min-h-\[44px\]|h-11)/);
    expect(dismiss.className).toMatch(/(min-w-\[44px\]|w-11)/);
  });

  // Copy discipline (AGENTS.md rule 7): no banned consumer-SaaS words.
  it('uses clipboard-not-landing-page copy (no banned words)', () => {
    render(<ArcContinuityLine arc={seededArc()} />);
    const line = screen.getByTestId(TESTID);
    const text = line.textContent ?? '';
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock']) {
      expect(text.toLowerCase()).not.toContain(banned);
    }
  });
});
