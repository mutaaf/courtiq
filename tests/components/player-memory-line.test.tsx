/**
 * Ticket 0025 — Per-player capture memory line component tests.
 *
 * Tests the presentational PlayerMemoryLine component:
 *  - renders the needs-work text when present
 *  - renders the positive text when present
 *  - renders nothing when both fields are null/undefined (loading / no history /
 *    fetch failure — best-effort, never gates capture)
 *  - never disables or removes the record button (no interactive disabled state)
 *
 * Pattern mirrors tests/components/carryover-strip.test.tsx.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PlayerMemoryLine } from '@/components/capture/player-memory-line';

const TESTID = 'player-memory-line';

describe('PlayerMemoryLine (ticket 0025)', () => {
  beforeEach(() => cleanup());

  it('renders nothing when both fields are undefined (loading / fetch failure)', () => {
    render(<PlayerMemoryLine />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('renders nothing when both fields are null (player has no prior observations)', () => {
    render(<PlayerMemoryLine lastNeedsWork={null} lastPositive={null} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('renders the needs-work text when present', () => {
    render(<PlayerMemoryLine lastNeedsWork="hesitated on closeouts" lastPositive={null} />);
    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent('hesitated on closeouts');
  });

  it('renders the positive text when only a positive exists', () => {
    render(<PlayerMemoryLine lastNeedsWork={null} lastPositive="first one back on defense" />);
    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent('first one back on defense');
  });

  it('renders both when needs-work and positive are present', () => {
    render(
      <PlayerMemoryLine
        lastNeedsWork="hesitated on closeouts"
        lastPositive="first one back on defense"
      />
    );
    const line = screen.getByTestId(TESTID);
    expect(line).toHaveTextContent('hesitated on closeouts');
    expect(line).toHaveTextContent('first one back on defense');
  });

  it('does not render a disabled interactive element that could block capture', () => {
    render(<PlayerMemoryLine lastNeedsWork="hesitated on closeouts" />);
    const line = screen.getByTestId(TESTID);
    // The line is informational — no disabled control that could gate the record button.
    expect(line.querySelector('button[disabled]')).toBeNull();
  });
});
