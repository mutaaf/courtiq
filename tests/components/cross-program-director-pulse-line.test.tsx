/**
 * Ticket 0077 — <CrossProgramDirectorPulseLine /> (the small line beneath
 * the 0028 program-pulse + 0071 emergent-focus cards on /admin).
 *
 * The line renders ONLY when the route returns >= 2 neighbor programs.
 * When neighborPrograms is empty (or undefined), the component renders
 * nothing so the existing /admin surface stays byte-identical (silence
 * beats nag — same posture as the 0028 ProgramPulseCard).
 *
 * Voice contract: every copy variant is positively phrased; the rendered
 * text is scanned for AGENTS.md banned words across a small matrix of
 * skill + program-name variants (LESSONS#0023, #0061 — literal space, not
 * `\s+`, on defensive scans).
 *
 * .test.ts(x) (NOT .spec.ts) — per docs/LESSONS.md.
 */
import React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  CrossProgramDirectorPulseLine,
  type CrossProgramDirectorPulseData,
} from '@/components/programs/cross-program-director-pulse-line';

const TESTID = 'cross-program-director-pulse-line';

function withTwoNeighbors(): CrossProgramDirectorPulseData {
  return {
    topSkill: 'transitions',
    neighborPrograms: [
      {
        org_id: 'org-riverside',
        org_name: 'Riverside Basketball',
        practice_count: 7,
        director_first_name: 'Anna',
        director_contact_email: 'anna@riverside.test',
      },
      {
        org_id: 'org-westview',
        org_name: 'Westview Hoops',
        practice_count: 5,
        director_first_name: 'Ben',
        director_contact_email: 'ben@westview.test',
      },
    ],
  };
}

function withTwoNeighborsNoContact(): CrossProgramDirectorPulseData {
  return {
    topSkill: 'transitions',
    neighborPrograms: [
      {
        org_id: 'org-riverside',
        org_name: 'Riverside Basketball',
        practice_count: 7,
      },
      {
        org_id: 'org-westview',
        org_name: 'Westview Hoops',
        practice_count: 5,
      },
    ],
  };
}

function withOneNeighbor(): CrossProgramDirectorPulseData {
  return {
    topSkill: 'transitions',
    neighborPrograms: [
      {
        org_id: 'org-riverside',
        org_name: 'Riverside Basketball',
        practice_count: 7,
        director_first_name: 'Anna',
        director_contact_email: 'anna@riverside.test',
      },
    ],
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => cleanup());

describe('CrossProgramDirectorPulseLine (ticket 0077)', () => {
  // (i) endpoint returns 2 neighbor programs WITH known director contacts
  it('renders the line with both program names + skill + aggregate count + Invite button', () => {
    render(<CrossProgramDirectorPulseLine data={withTwoNeighbors()} />);

    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    // Both program names render.
    expect(line).toHaveTextContent('Riverside Basketball');
    expect(line).toHaveTextContent('Westview Hoops');
    // Top skill renders.
    expect(line).toHaveTextContent('transitions');
    // Aggregate practice count renders (7 + 5 = 12).
    expect(line).toHaveTextContent('12');
    // "Invite the <first-program> director" button (Riverside is first).
    const invite = screen.getByRole('button', { name: /Invite the Riverside Basketball director/i });
    expect(invite).toBeInTheDocument();
  });

  // (ii) endpoint returns 2 neighbor programs WITHOUT director contacts
  //      → line renders + "Find" button
  it('renders the line with a Find button when the neighbor director contact is unknown', () => {
    render(<CrossProgramDirectorPulseLine data={withTwoNeighborsNoContact()} />);

    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent('Riverside Basketball');
    expect(line).toHaveTextContent('Westview Hoops');
    expect(line).toHaveTextContent('transitions');
    // Fallback "Find" CTA.
    const find = screen.getByRole('link', { name: /Find this program/i });
    expect(find).toBeInTheDocument();
  });

  // (iii) endpoint returns 1 neighbor program → line is ABSENT
  it('renders NOTHING when only ONE neighbor program is returned', () => {
    const { container } = render(<CrossProgramDirectorPulseLine data={withOneNeighbor()} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // (iv) endpoint returns empty → line is ABSENT
  it('renders NOTHING when neighborPrograms is empty', () => {
    const { container } = render(
      <CrossProgramDirectorPulseLine data={{ topSkill: null, neighborPrograms: [] }} />,
    );
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders NOTHING when data is undefined (still loading / best-effort)', () => {
    const { container } = render(<CrossProgramDirectorPulseLine data={undefined} />);
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // (v) rendered text contains no banned word for any sport/skill/program-
  //     name matrix.
  it('voice contract — no banned word on a matrix of skill / program-name variants', () => {
    const skills = ['transitions', 'closeouts', 'rebounds', 'spacing'];
    const programNames = [
      ['Riverside Basketball', 'Westview Hoops'],
      ['Northside Hoops', 'Southridge Athletics'],
      ['Lakeside Cougars', 'Hillview Tigers'],
    ];
    for (const skill of skills) {
      for (const [a, b] of programNames) {
        const data: CrossProgramDirectorPulseData = {
          topSkill: skill,
          neighborPrograms: [
            {
              org_id: 'a',
              org_name: a,
              practice_count: 6,
              director_first_name: 'Anna',
              director_contact_email: 'a@a.test',
            },
            {
              org_id: 'b',
              org_name: b,
              practice_count: 6,
              director_first_name: 'Ben',
              director_contact_email: 'b@b.test',
            },
          ],
        };
        const { unmount } = render(<CrossProgramDirectorPulseLine data={data} />);
        const text = screen.getByTestId(TESTID).textContent ?? '';
        // LESSONS#0023 — banned words must NOT appear in any rendered copy.
        // LESSONS#0061 — literal space on defensive scans, not \s+.
        for (const banned of [/journey/i, /amazing/i, /exciting/i, /elevate/i, /empower/i, /synergy/i, /unlock your potential/i]) {
          expect(text).not.toMatch(banned);
        }
        unmount();
      }
    }
  });

  // (vi) tap "Invite" fires a callback / opens the invite sheet.
  it('tap Invite fires the onInvite callback with the named neighbor program', () => {
    const onInvite = vi.fn();
    render(
      <CrossProgramDirectorPulseLine data={withTwoNeighbors()} onInvite={onInvite} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Invite the Riverside Basketball director/i }));
    expect(onInvite).toHaveBeenCalledTimes(1);
    const arg = onInvite.mock.calls[0][0];
    expect(arg.org_id).toBe('org-riverside');
    expect(arg.org_name).toBe('Riverside Basketball');
    expect(arg.director_first_name).toBe('Anna');
    expect(arg.director_contact_email).toBe('anna@riverside.test');
    expect(arg.topSkill).toBe('transitions');
  });

  // (vii) data-testid present (LESSONS#0029 / #0082 — strict-mode scope on
  //       the 0028 hotspot).
  it('the line carries the data-testid scope hook', () => {
    render(<CrossProgramDirectorPulseLine data={withTwoNeighbors()} />);
    expect(screen.getByTestId(TESTID)).toBeInTheDocument();
  });
});
