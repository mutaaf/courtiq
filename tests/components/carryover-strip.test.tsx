/**
 * Ticket 0014 — Carryover strip component tests.
 *
 * Tests the presentational CarryoverStrip component:
 *  - renders focus phrases when present
 *  - renders nothing when focus is empty or undefined
 *  - never disables or removes the record button
 *
 * Pattern mirrors tests/components/ai-usage-meter.test.tsx.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CarryoverStrip } from '@/components/capture/carryover-strip';

const TESTID = 'capture-carryover';

describe('CarryoverStrip (ticket 0014)', () => {
  beforeEach(() => cleanup());

  it('renders nothing when focus is undefined', () => {
    render(<CarryoverStrip focus={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('renders nothing when focus is an empty array', () => {
    render(<CarryoverStrip focus={[]} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
  });

  it('renders the strip when focus has one phrase', () => {
    render(<CarryoverStrip focus={['closeouts']} />);
    const strip = screen.getByTestId(TESTID);
    expect(strip).toBeInTheDocument();
    expect(strip).toHaveTextContent('closeouts');
  });

  it('renders all focus phrases when multiple are provided', () => {
    render(<CarryoverStrip focus={['closeouts', 'weak-hand finishing']} />);
    const strip = screen.getByTestId(TESTID);
    expect(strip).toHaveTextContent('closeouts');
    expect(strip).toHaveTextContent('weak-hand finishing');
  });

  it('renders up to three phrases without truncation', () => {
    render(<CarryoverStrip focus={['A', 'B', 'C']} />);
    const strip = screen.getByTestId(TESTID);
    expect(strip).toHaveTextContent('A');
    expect(strip).toHaveTextContent('B');
    expect(strip).toHaveTextContent('C');
  });

  it('does not render a button or disabled state that could block capture', () => {
    render(<CarryoverStrip focus={['closeouts']} />);
    // The strip is purely informational — no interactive element that could gate capture
    const strip = screen.getByTestId(TESTID);
    expect(strip.querySelector('button[disabled]')).toBeNull();
  });
});
