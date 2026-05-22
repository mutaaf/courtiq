/**
 * Component test for AIUsageMeter — the compact "N of 5 AI notes left this month"
 * line shown on Capture for free-tier coaches (ticket 0008).
 *
 * The meter is a pure presentational component: it takes the result of the
 * best-effort GET /api/ai/usage read and decides what to render. It NEVER gates
 * capture — its only job is to surface the remaining count. These tests cover the
 * four UI-visibility acceptance criteria directly (the same render-the-component
 * approach as tests/components/dashboard-shell-*.test.tsx), which is the CI-gating
 * proof since /capture is auth-protected and its Playwright spec skips in CI.
 *
 * Contract:
 *   <AIUsageMeter usage={...} />
 *     usage === undefined            → render nothing (loading / fetch failed)
 *     usage.unlimited === true       → render nothing (paid tier, no meter)
 *     usage = { used, limit, remaining } → render "{remaining} of {limit}" line
 *       remaining <= 1 → amber/warning state; otherwise neutral
 *   Identified by data-testid="ai-usage-meter".
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AIUsageMeter } from '@/components/capture/ai-usage-meter';

const TESTID = 'ai-usage-meter';

describe('AIUsageMeter (ticket 0008)', () => {
  beforeEach(() => cleanup());

  // AC: a free-tier coach sees a usage line containing the remaining count.
  it('renders "3 of 5" for a free coach with 3 remaining', () => {
    render(<AIUsageMeter usage={{ used: 2, limit: 5, remaining: 3, tier: 'free' }} />);
    const meter = screen.getByTestId(TESTID);
    expect(meter).toBeInTheDocument();
    // Matches the AC's /\d+ of 5/ pattern.
    expect(meter).toHaveTextContent(/3 of 5/);
  });

  // AC: paid tiers must not see a meter — the element is absent entirely.
  it('renders NOTHING for an unlimited (paid) tier', () => {
    render(<AIUsageMeter usage={{ unlimited: true, tier: 'coach' }} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  // AC (degrade silently): when the fetch failed/timed out, usage is undefined →
  // the meter renders nothing. It contributes nothing that could disable capture.
  it('renders NOTHING while loading or when the usage read failed (undefined)', () => {
    const { container } = render(<AIUsageMeter usage={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    // No interactive/disabling element is produced by the meter in this state.
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[disabled]')).toBeNull();
  });

  // AC: amber/warning visual state when remaining <= 1.
  it('applies the amber/warning state when remaining is exactly 1', () => {
    render(<AIUsageMeter usage={{ used: 4, limit: 5, remaining: 1, tier: 'free' }} />);
    const meter = screen.getByTestId(TESTID);
    expect(meter).toHaveTextContent(/1 of 5/);
    expect(meter).toHaveAttribute('data-state', 'warning');
    expect(meter.className).toMatch(/amber/);
  });

  it('applies the amber/warning state when remaining is 0', () => {
    render(<AIUsageMeter usage={{ used: 5, limit: 5, remaining: 0, tier: 'free' }} />);
    const meter = screen.getByTestId(TESTID);
    expect(meter).toHaveTextContent(/0 of 5/);
    expect(meter).toHaveAttribute('data-state', 'warning');
    expect(meter.className).toMatch(/amber/);
  });

  // AC: neutral state otherwise (remaining > 1) — NOT amber.
  it('uses the neutral state when remaining is above 1', () => {
    render(<AIUsageMeter usage={{ used: 0, limit: 5, remaining: 5, tier: 'free' }} />);
    const meter = screen.getByTestId(TESTID);
    expect(meter).toHaveAttribute('data-state', 'neutral');
    expect(meter.className).not.toMatch(/amber/);
  });
});
