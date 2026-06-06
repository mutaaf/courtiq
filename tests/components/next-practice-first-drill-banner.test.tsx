/**
 * Ticket 0069 — <NextPracticeFirstDrillBanner /> component test.
 *
 * Acceptance criteria → tests:
 *  - Renders the banner when `firstDrillWhy` is set.
 *  - Renders NOTHING when `firstDrillWhy` is absent / empty / null.
 *  - The banner copy carries no AGENTS.md banned words.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextPracticeFirstDrillBanner } from '@/components/plans/next-practice-first-drill-banner';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];

beforeEach(() => {
  cleanup();
});

describe('<NextPracticeFirstDrillBanner /> (ticket 0069)', () => {
  it('renders the banner when firstDrillWhy is set', () => {
    render(<NextPracticeFirstDrillBanner firstDrillWhy="Saturday's note said rebounding." />);
    const el = screen.getByTestId('first-drill-why-banner');
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('Why this is first today');
    expect(el.textContent).toContain('rebounding');
  });

  it('renders NOTHING when firstDrillWhy is null', () => {
    const { container } = render(<NextPracticeFirstDrillBanner firstDrillWhy={null} />);
    expect(container.textContent).toBe('');
  });

  it('renders NOTHING when firstDrillWhy is an empty string', () => {
    const { container } = render(<NextPracticeFirstDrillBanner firstDrillWhy="" />);
    expect(container.textContent).toBe('');
  });

  it('renders NOTHING when firstDrillWhy is whitespace only', () => {
    const { container } = render(<NextPracticeFirstDrillBanner firstDrillWhy="   " />);
    expect(container.textContent).toBe('');
  });

  it('the banner copy carries no AGENTS.md banned words', () => {
    render(<NextPracticeFirstDrillBanner firstDrillWhy="rebound and effort" />);
    const txt = (document.body.textContent || '').toLowerCase();
    for (const b of BANNED) {
      expect(txt).not.toContain(b);
    }
  });
});
