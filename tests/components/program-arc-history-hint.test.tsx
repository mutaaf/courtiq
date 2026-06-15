/**
 * Component test for <ProgramArcHistoryHint /> — the quiet zinc-500
 * "Last year's U10 Hawks spent weeks 2-4 on closeouts and weeks 5-7 on
 * transitions" line that mounts above the empty-state Practice Arc card
 * for a brand-new coach in a program where another coach ran the season
 * for the same age group last year (ticket 0083).
 *
 * Per LESSONS#0029 / #0082 — every assertion is scoped to data-testid
 * "program-arc-history-hint" / "program-arc-history-adopt" /
 * "program-arc-history-summary" so program-name / skill / week-range
 * strings cannot collide with other rendered text. Per LESSONS#0023 —
 * banned-word scan rendered text on every variant.
 *
 * .test.tsx (NOT .spec.tsx) — per docs/LESSONS.md.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { ProgramArcHistoryHint } from '@/components/plans/program-arc-history-hint';
import { containsBannedWord } from '@/lib/program-arc-summary';

const HINT = 'program-arc-history-hint';
const SUMMARY = 'program-arc-history-summary';
const ADOPT = 'program-arc-history-adopt';

function seededWeeks() {
  return [
    { week_index: 2, top_skills: ['closeouts'], team_count: 1, practice_count: 2 },
    { week_index: 3, top_skills: ['closeouts'], team_count: 1, practice_count: 2 },
    { week_index: 4, top_skills: ['closeouts'], team_count: 1, practice_count: 2 },
    { week_index: 5, top_skills: ['transitions'], team_count: 1, practice_count: 2 },
    { week_index: 6, top_skills: ['transitions'], team_count: 1, practice_count: 2 },
    { week_index: 7, top_skills: ['transitions'], team_count: 1, practice_count: 2 },
  ];
}

describe('ProgramArcHistoryHint (ticket 0083)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // (i) empty arc + sufficient coverage → hint renders with summary line.
  it('renders the hint when arc is empty and coverage is sufficient', () => {
    render(
      <ProgramArcHistoryHint
        arcIsEmpty
        data={{
          coverage: 'sufficient',
          weeks: seededWeeks(),
          programName: 'Hawks',
          ageGroup: 'U10',
        }}
        teamId="team-mine"
        orgId="org-hawks"
        ageGroup="U10"
        sportId="sport-basketball"
        onAdopted={() => {}}
      />,
    );
    expect(screen.getByTestId(HINT)).toBeInTheDocument();
    const summary = screen.getByTestId(SUMMARY);
    expect(summary).toHaveTextContent('Hawks');
    expect(summary).toHaveTextContent('U10');
    expect(summary).toHaveTextContent('closeouts');
    expect(summary).toHaveTextContent('transitions');
    expect(screen.getByTestId(ADOPT)).toBeInTheDocument();
  });

  // (ii) empty arc + thin coverage → hint absent.
  it('does not render when coverage is thin', () => {
    const { container } = render(
      <ProgramArcHistoryHint
        arcIsEmpty
        data={{
          coverage: 'thin',
          weeks: [],
          programName: 'Hawks',
          ageGroup: 'U10',
        }}
        teamId="team-mine"
        orgId="org-hawks"
        ageGroup="U10"
        sportId="sport-basketball"
        onAdopted={() => {}}
      />,
    );
    expect(screen.queryByTestId(HINT)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // (iii) non-empty arc → hint absent regardless of coverage.
  it('does not render when the callers arc is not empty', () => {
    const { container } = render(
      <ProgramArcHistoryHint
        arcIsEmpty={false}
        data={{
          coverage: 'sufficient',
          weeks: seededWeeks(),
          programName: 'Hawks',
          ageGroup: 'U10',
        }}
        teamId="team-mine"
        orgId="org-hawks"
        ageGroup="U10"
        sportId="sport-basketball"
        onAdopted={() => {}}
      />,
    );
    expect(screen.queryByTestId(HINT)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // (iv) tapping adopt fires the POST + onAdopted callback.
  it('fires the POST and the onAdopted callback when adopt is tapped', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : (input as URL).toString();
        // Capture both args so the assertion sees the POST body.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _captured = init;
        if (url.includes('/api/program/arc-history/adopt')) {
          return new Response(JSON.stringify({ adopted: true, weeks: 6, planId: 'plan-1' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('{}', { status: 200 });
      },
    );
    const onAdopted = vi.fn();

    render(
      <ProgramArcHistoryHint
        arcIsEmpty
        data={{
          coverage: 'sufficient',
          weeks: seededWeeks(),
          programName: 'Hawks',
          ageGroup: 'U10',
        }}
        teamId="team-mine"
        orgId="org-hawks"
        ageGroup="U10"
        sportId="sport-basketball"
        onAdopted={onAdopted}
      />,
    );

    fireEvent.click(screen.getByTestId(ADOPT));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await waitFor(() => expect(onAdopted).toHaveBeenCalled());

    // The POST went to the adopt endpoint with the right body shape.
    const call = fetchSpy.mock.calls[0];
    expect(call[0]).toContain('/api/program/arc-history/adopt');
    const init = call[1] as RequestInit;
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body.teamId).toBe('team-mine');
    expect(body.orgId).toBe('org-hawks');
    expect(body.ageGroup).toBe('U10');
    expect(body.sportId).toBe('sport-basketball');
  });

  // (v) summary line contains no banned word across a small input matrix.
  it('the summary line is voice-clean across program/age/skill variants', () => {
    const variants = [
      { programName: 'Hawks', ageGroup: 'U10', skills: ['closeouts', 'transitions'] },
      { programName: 'Riverside Academy', ageGroup: 'U12', skills: ['rebounding', 'spacing'] },
      { programName: 'East Side Bulls', ageGroup: 'U8', skills: ['ball-handling', 'finishing'] },
    ];
    for (const v of variants) {
      cleanup();
      const weeks = [
        { week_index: 2, top_skills: [v.skills[0]], team_count: 1, practice_count: 2 },
        { week_index: 3, top_skills: [v.skills[0]], team_count: 1, practice_count: 2 },
        { week_index: 4, top_skills: [v.skills[0]], team_count: 1, practice_count: 2 },
        { week_index: 5, top_skills: [v.skills[1]], team_count: 1, practice_count: 2 },
        { week_index: 6, top_skills: [v.skills[1]], team_count: 1, practice_count: 2 },
        { week_index: 7, top_skills: [v.skills[1]], team_count: 1, practice_count: 2 },
      ];
      render(
        <ProgramArcHistoryHint
          arcIsEmpty
          data={{
            coverage: 'sufficient',
            weeks,
            programName: v.programName,
            ageGroup: v.ageGroup,
          }}
          teamId="team-mine"
          orgId="org-hawks"
          ageGroup={v.ageGroup}
          sportId="sport-basketball"
          onAdopted={() => {}}
        />,
      );
      const summary = screen.getByTestId(SUMMARY);
      const text = summary.textContent ?? '';
      expect(containsBannedWord(text)).toBe(false);
    }
  });

  // (vi) summary line uses program name + age group + skill names verbatim.
  it('uses the program name and skill names verbatim from the data prop', () => {
    render(
      <ProgramArcHistoryHint
        arcIsEmpty
        data={{
          coverage: 'sufficient',
          weeks: seededWeeks(),
          programName: 'Hawks Basketball',
          ageGroup: 'U10',
        }}
        teamId="team-mine"
        orgId="org-hawks"
        ageGroup="U10"
        sportId="sport-basketball"
        onAdopted={() => {}}
      />,
    );
    const summary = screen.getByTestId(SUMMARY);
    expect(summary.textContent).toContain('Hawks Basketball');
    expect(summary.textContent).toContain('closeouts');
    expect(summary.textContent).toContain('transitions');
  });

  // (vii) the rendered text never contains a coach name pattern.
  it('never renders a "Coach Sarah Smith"-shaped predecessor name', () => {
    render(
      <ProgramArcHistoryHint
        arcIsEmpty
        data={{
          coverage: 'sufficient',
          weeks: seededWeeks(),
          programName: 'Hawks',
          ageGroup: 'U10',
        }}
        teamId="team-mine"
        orgId="org-hawks"
        ageGroup="U10"
        sportId="sport-basketball"
        onAdopted={() => {}}
      />,
    );
    const hint = screen.getByTestId(HINT);
    const text = hint.textContent ?? '';
    // Literal space scan per LESSONS#0061.
    expect(text).not.toMatch(/Coach [A-Z][a-z]+ [A-Z][a-z]+/);
  });
});
