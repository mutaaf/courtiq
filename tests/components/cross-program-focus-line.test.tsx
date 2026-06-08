/**
 * Component test for CrossProgramFocusLine — the quiet "Three coaches in
 * <sport> are on <skill> this week too" cross-program convergence line on
 * Capture (ticket 0075).
 *
 * Like CarryoverStrip (0014), ArcContinuityLine (0020), PlayerMemoryLine
 * (0025), and ProgramFocusLine (0031), this is a pure presentational
 * component that takes the result of a best-effort GET /api/sport/emergent-
 * focus read and decides what to render. It NEVER gates capture — its only
 * job is to surface the cross-program signal + a one-tap Save button when a
 * drill is attached. The 0014 carryover surface stays byte-identical when
 * this component renders nothing (degrade silently).
 *
 * Per LESSONS#0029 / #0082 — every assertion is scoped to data-testid
 * "cross-program-focus-line" so skill / sport strings cannot collide with
 * other rendered text. Per LESSONS#0023 — no banned-word matrix surface
 * variant slips through.
 *
 * .test.ts(x) (NOT .spec.tsx) — per docs/LESSONS.md#0038.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { CrossProgramFocusLine } from '@/components/capture/cross-program-focus-line';
import type { CrossProgramFocusResponse } from '@/app/api/sport/emergent-focus/route';

const TESTID = 'cross-program-focus-line';

function seededFocus(overrides: Partial<CrossProgramFocusResponse['focus']> = {}): CrossProgramFocusResponse {
  return {
    focus: {
      skill: 'closeouts',
      distinctProgramCount: 3,
      drill: {
        sourceDrillShareId: 'share-abc',
        name: 'Live closeout 1-on-1',
        duration_minutes: 8,
        setup_lines: ['Defender starts at the rim.'],
      },
      ...overrides,
    } as CrossProgramFocusResponse['focus'],
  };
}

describe('CrossProgramFocusLine (ticket 0075)', () => {
  beforeEach(() => {
    cleanup();
    // Restore default fetch mock per-case so no test sees leakage.
    vi.restoreAllMocks();
  });

  // (i) endpoint returns a focus with a drill → line renders with skill +
  // sport + drill name + duration + Save button.
  it('renders skill, sport, drill name + duration, and a Save button when a drill is attached', () => {
    render(
      <CrossProgramFocusLine
        data={seededFocus()}
        sportName="basketball"
      />
    );
    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent(/three coaches/i);
    expect(line).toHaveTextContent('basketball');
    expect(line).toHaveTextContent('closeouts');
    expect(line).toHaveTextContent('Live closeout 1-on-1');
    expect(line).toHaveTextContent(/8 minute/i);
    // Save button scoped to the line.
    const save = screen.getByRole('button', { name: /save to my drills/i });
    expect(save).toBeInTheDocument();
  });

  // (ii) endpoint returns a focus with drill: null → line renders without
  // the drill name + WITHOUT the Save button.
  it('renders the line without the drill clause and Save button when drill is null', () => {
    const data: CrossProgramFocusResponse = {
      focus: {
        skill: 'closeouts',
        distinctProgramCount: 3,
        drill: null,
      },
    };
    render(<CrossProgramFocusLine data={data} sportName="basketball" />);
    const line = screen.getByTestId(TESTID);
    expect(line).toBeInTheDocument();
    expect(line).toHaveTextContent(/three coaches/i);
    expect(line).toHaveTextContent('closeouts');
    expect(line).not.toHaveTextContent('Live closeout 1-on-1');
    expect(screen.queryByRole('button', { name: /save to my drills/i })).not.toBeInTheDocument();
  });

  // (iii) endpoint returns focus: null → line is ABSENT.
  it('renders NOTHING when the endpoint returns focus: null', () => {
    const { container } = render(
      <CrossProgramFocusLine data={{ focus: null }} sportName="basketball" />
    );
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
  });

  // Loading / fetch-failed state — data is undefined.
  it('renders NOTHING when the read failed (undefined) or is still loading', () => {
    const { container } = render(
      <CrossProgramFocusLine data={undefined} sportName="basketball" />
    );
    expect(screen.queryByTestId(TESTID)).not.toBeInTheDocument();
    expect(container).toBeEmptyDOMElement();
    // Never produces a disabled element that could block capture.
    expect(container.querySelector('[disabled]')).toBeNull();
  });

  // (iv) tapping Save fires the 0064 clone POST against the share token. The
  // sourceDrillShareId is what the route resolves to a publisher.
  it('POSTs to the 0064 clone endpoint with the seeded sourceDrillShareId when Save is tapped', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ alreadyFavorited: false }), { status: 200 }));

    render(<CrossProgramFocusLine data={seededFocus()} sportName="basketball" />);
    const save = screen.getByRole('button', { name: /save to my drills/i });
    fireEvent.click(save);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [calledUrl, calledInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(calledUrl)).toContain('/api/drill-shares/share-abc/clone');
    expect((calledInit as RequestInit).method).toBe('POST');

    // After the clone, the button reads Saved and disables.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^saved$/i })).toBeDisabled();
    });
  });

  // (v) on a clone failure the Save button reverts (best-effort posture per
  // LESSONS#0036).
  it('reverts the Save button when the clone POST returns a non-ok response', async () => {
    vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));

    render(<CrossProgramFocusLine data={seededFocus()} sportName="basketball" />);
    const save = screen.getByRole('button', { name: /save to my drills/i });
    fireEvent.click(save);

    // After the failure, the Save button is back and not disabled.
    await waitFor(() => {
      const revertedSave = screen.getByRole('button', { name: /save to my drills/i });
      expect(revertedSave).not.toBeDisabled();
    });
  });

  // distinctProgramCount > 3 → the line begins with the exact spelled-out count.
  it('spells out the program count when there are more than three programs', () => {
    render(
      <CrossProgramFocusLine
        data={{
          focus: {
            skill: 'closeouts',
            distinctProgramCount: 4,
            drill: null,
          },
        }}
        sportName="basketball"
      />
    );
    const line = screen.getByTestId(TESTID);
    expect(line).toHaveTextContent(/four coaches/i);
    expect(line).not.toHaveTextContent(/three coaches/i);
  });

  // The three-coaches fallback uses the WORD "three", not the digit (per
  // ticket AC, mirroring 0071 / 0073 numeric posture).
  it('uses the word "three" (not the digit) at the minimum threshold', () => {
    render(
      <CrossProgramFocusLine
        data={{
          focus: { skill: 'closeouts', distinctProgramCount: 3, drill: null },
        }}
        sportName="basketball"
      />
    );
    const line = screen.getByTestId(TESTID);
    expect(line).toHaveTextContent(/three coaches/i);
    expect(line.textContent ?? '').not.toMatch(/^3 coaches/i);
  });

  // (vi) Voice contract — across a matrix of sport / skill / drill / count
  // fixtures, the rendered text contains NO AGENTS.md banned token.
  it('uses clipboard-not-landing-page copy across a sport/skill/drill matrix (no banned words)', () => {
    const banned = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock'];
    const sports = ['basketball', 'soccer', 'flag_football', 'volleyball'];
    const skills = ['closeouts', 'spacing', 'transition defense'];
    const counts = [3, 4, 7];
    const drills = [
      null,
      {
        sourceDrillShareId: 'share-1',
        name: 'Live closeout 1-on-1',
        duration_minutes: 8,
        setup_lines: ['Defender starts at the rim.'],
      },
    ];

    for (const sportName of sports) {
      for (const skill of skills) {
        for (const distinctProgramCount of counts) {
          for (const drill of drills) {
            cleanup();
            render(
              <CrossProgramFocusLine
                data={{ focus: { skill, distinctProgramCount, drill } }}
                sportName={sportName}
              />
            );
            const line = screen.getByTestId(TESTID);
            const text = (line.textContent ?? '').toLowerCase();
            for (const word of banned) {
              expect(text).not.toContain(word);
            }
          }
        }
      }
    }
  });

  // The Save button is a real labeled button sized for touch (44px) per
  // AGENTS.md rule 7 + the existing 0020 / 0025 component pattern.
  it('exposes a labeled Save control sized for touch (min 44px)', () => {
    render(<CrossProgramFocusLine data={seededFocus()} sportName="basketball" />);
    const save = screen.getByRole('button', { name: /save to my drills/i });
    expect(save).toBeInTheDocument();
    expect(save.className).toMatch(/(min-h-\[44px\]|h-11|py-3)/);
  });
});
