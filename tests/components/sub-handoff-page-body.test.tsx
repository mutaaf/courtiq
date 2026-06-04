/**
 * Ticket 0067 — <SubHandoffPageBody /> component test.
 *
 * The body of the public /sub/[token] page, extracted from the page client
 * for unit-testability per LESSONS#0060. Takes the GET payload as a prop
 * and renders the three sections (queuedDrills, weeklyFocusLine,
 * eyesOnPlayers) when present, NOTHING when omitted (silence beats empty
 * state).
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SubHandoffPageBody } from '@/components/sub/sub-handoff-page-body';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

const BASE = {
  sessionDate: '2026-06-10',
  teamName: 'Hawks U10',
  ageGroup: 'U10',
  sportName: 'Basketball',
  subFirstName: 'Mark',
  expiresAt: '2026-06-11T22:00:00Z',
  token: 'tok.sig',
};

describe('<SubHandoffPageBody /> (ticket 0067)', () => {
  afterEach(() => cleanup());

  it('renders the H1 with the sub first name and team name', () => {
    render(<SubHandoffPageBody payload={{ ...BASE }} />);
    expect(screen.getByTestId('sub-handoff-h1')).toBeTruthy();
    const h1 = screen.getByTestId('sub-handoff-h1');
    expect(h1.textContent).toContain('Mark');
    expect(h1.textContent).toContain('Hawks U10');
  });

  it('renders the weekly focus line when present', () => {
    render(
      <SubHandoffPageBody
        payload={{ ...BASE, weeklyFocusLine: 'finishing the closeout' }}
      />,
    );
    const focus = screen.getByTestId('sub-handoff-focus');
    expect(focus.textContent).toContain('finishing the closeout');
  });

  it('omits the weekly focus section when the key is absent', () => {
    render(<SubHandoffPageBody payload={{ ...BASE }} />);
    expect(screen.queryByTestId('sub-handoff-focus')).toBeNull();
  });

  it('renders queued drills with setup lines and the coach note when present', () => {
    render(
      <SubHandoffPageBody
        payload={{
          ...BASE,
          queuedDrills: [
            {
              drillName: 'Closeout drill',
              setupLines: ['Set cones at the elbows', 'Close out high', 'Recover under control'],
              coachNote: 'this is the one where the U10 girls finally chest up before the hands go up',
            },
          ],
        }}
      />,
    );
    const drills = screen.getByTestId('sub-handoff-drills');
    expect(drills.textContent).toContain('Closeout drill');
    expect(drills.textContent).toContain('Set cones');
    expect(drills.textContent).toContain('U10 girls');
  });

  it('omits the queued-drills section when the key is absent', () => {
    render(<SubHandoffPageBody payload={{ ...BASE }} />);
    expect(screen.queryByTestId('sub-handoff-drills')).toBeNull();
  });

  it('renders eyes-on-players with first names only', () => {
    render(
      <SubHandoffPageBody
        payload={{
          ...BASE,
          eyesOnPlayers: [
            { firstName: 'Maya', oneLineWatch: 'working on left-hand finishes' },
            { firstName: 'Caleb', oneLineWatch: 'working on calling out switches' },
          ],
        }}
      />,
    );
    const eyes = screen.getByTestId('sub-handoff-eyes');
    expect(eyes.textContent).toContain('Maya');
    expect(eyes.textContent).toContain('Caleb');
    expect(eyes.textContent).toContain('left-hand');
  });

  it('omits the eyes-on-players section when the key is absent', () => {
    render(<SubHandoffPageBody payload={{ ...BASE }} />);
    expect(screen.queryByTestId('sub-handoff-eyes')).toBeNull();
  });

  it('voice contract: rendered DOM contains no AGENTS.md banned tokens', () => {
    const { container } = render(
      <SubHandoffPageBody
        payload={{
          ...BASE,
          weeklyFocusLine: 'finishing the closeout',
          queuedDrills: [
            {
              drillName: 'Closeout drill',
              setupLines: ['Set cones', 'Close out high'],
            },
          ],
          eyesOnPlayers: [{ firstName: 'Maya', oneLineWatch: 'left-hand finishes' }],
        }}
      />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});

