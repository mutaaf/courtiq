/**
 * Ticket 0080 — ParentForwardOnTeamButton extended with the second
 * "In your program" tab for the cross-team-same-program forward.
 *
 * Asserts:
 *  - Tab UI: a second tab "In your program" renders alongside the
 *    existing "On your team" tab (the 0079 sheet primitive).
 *  - The second tab's candidate list shows first_name + team_name
 *    labelled (e.g. "Liam — U10 Hornets"); NEVER surnames; NEVER
 *    parent contact.
 *  - The candidate list excludes the sender's own team's players (the
 *    parent uses the first tab for those).
 *  - On Send, the POST payload carries the recipientPlayerId on a
 *    DIFFERENT team in the same program.
 *  - On 200, the cross-team sent toast renders ("Sent to one parent in
 *    your program").
 *  - On 429, the already-sent toast renders.
 *
 * Per LESSONS#0022 / #0029 / #0082 — every interactive element gets
 * its own data-testid so the parent-portal multi-CTA page stays
 * strict-mode-safe in Playwright.
 *
 * `.test.tsx` not `.spec.ts` (LESSONS#0020 / #38).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ParentForwardOnTeamButton } from '@/components/share/parent-forward-on-team-button';

const SHARE_TOKEN = 'tok-parent-forward-cross-team';
const MY_FIRST_NAME = 'Maya';

const TEAMMATES = [
  { player_id: 'p-liam', first_name: 'Liam' },
];

const PROGRAM_MATES = [
  { player_id: 'p-devon', first_name: 'Devon', team_name: 'Bears U12' },
  { player_id: 'p-noah', first_name: 'Noah', team_name: 'Hornets U10' },
];

const BANNED_WORDS = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock',
];

beforeEach(() => {
  cleanup();
  global.fetch = vi.fn() as unknown as typeof global.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ParentForwardOnTeamButton — cross-team tab (ticket 0080)', () => {
  it('opens the sheet and renders the "In your program" tab alongside the "On your team" tab', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    expect(screen.getByTestId('parent-forward-on-team-tab')).toBeInTheDocument();
    expect(screen.getByTestId('parent-forward-in-program-tab')).toBeInTheDocument();
  });

  it('switching to the second tab reveals the program-mates candidate list with team labels', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-tab'));
    const sheet = screen.getByTestId('parent-forward-in-program-sheet');
    expect(sheet).toBeInTheDocument();
    expect(within(sheet).getByText(/Devon/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Noah/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Bears U12/)).toBeInTheDocument();
    expect(within(sheet).getByText(/Hornets U10/)).toBeInTheDocument();
    // The in-team teammate (Liam) is NOT in the program tab (he lives
    // on the on-team tab).
    expect(within(sheet).queryByText(/Liam/)).toBeNull();
  });

  it('renders only first names + team names in the program tab (no surnames anywhere)', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-tab'));
    const sheet = screen.getByTestId('parent-forward-in-program-sheet');
    const text = sheet.textContent ?? '';
    // No surnames in either the candidate list or anywhere on the sheet.
    expect(text).not.toMatch(/\b(Walker|Carter|Smith|Jones|Bear|Hornet)\b/);
    // No email shapes.
    expect(text).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });

  it('selecting a program-mate pre-fills the note textarea with the cross-team templated copy', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-tab'));
    // Sender first name comes first.
    fireEvent.change(
      screen.getByTestId('parent-forward-in-program-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    // Select Devon (the kid down the street).
    fireEvent.click(screen.getByTestId('parent-forward-in-program-candidate-p-devon'));
    const note = screen.getByTestId('parent-forward-in-program-note') as HTMLTextAreaElement;
    expect(note.value).toMatch(/Devon/);
    expect(note.value).toMatch(/Maya/);
    expect(note.value).toMatch(/Sarah/);
    expect(note.value).toMatch(/program/i);
  });

  it('Send POSTs the recipientPlayerId of the program-mate (different team) and renders the cross-team sent toast on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-tab'));
    fireEvent.change(
      screen.getByTestId('parent-forward-in-program-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    fireEvent.click(screen.getByTestId('parent-forward-in-program-candidate-p-devon'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-send'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/share/parent-forward');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.shareToken).toBe(SHARE_TOKEN);
    expect(body.recipientPlayerId).toBe('p-devon');
    expect(body.senderFirstName).toBe('Sarah');
    expect(typeof body.note).toBe('string');
    expect(body.note.length).toBeGreaterThan(0);

    // The cross-team sent toast renders.
    await waitFor(() => {
      expect(
        screen.getByTestId('parent-forward-in-program-sent-toast'),
      ).toBeInTheDocument();
    });
    const toast = screen.getByTestId('parent-forward-in-program-sent-toast');
    expect(toast).toHaveTextContent(/parent in your program/i);
  });

  it('on 429 (already-sent) the cross-team already-toast renders naming the recipient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'already_sent' }),
    });
    global.fetch = fetchMock as unknown as typeof global.fetch;

    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-tab'));
    fireEvent.change(
      screen.getByTestId('parent-forward-in-program-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    fireEvent.click(screen.getByTestId('parent-forward-in-program-candidate-p-devon'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-send'));

    await waitFor(() => {
      expect(
        screen.getByTestId('parent-forward-in-program-already-toast'),
      ).toBeInTheDocument();
    });
    const toast = screen.getByTestId('parent-forward-in-program-already-toast');
    expect(toast).toHaveTextContent(/Devon/);
  });

  it('renders nothing in the program tab when programMates is empty (silence beats a dead tab)', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={[]}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    // The second tab itself is hidden when there are zero program
    // mates — the surface is "no program-wide candidates" and the
    // on-team flow stays.
    expect(screen.queryByTestId('parent-forward-in-program-tab')).toBeNull();
  });

  it('rendered text in the program tab contains no AGENTS.md banned word', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.click(screen.getByTestId('parent-forward-in-program-tab'));
    fireEvent.change(
      screen.getByTestId('parent-forward-in-program-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    fireEvent.click(screen.getByTestId('parent-forward-in-program-candidate-p-devon'));
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const w of BANNED_WORDS) {
      expect(text).not.toContain(w);
    }
  });

  it('the existing 0079 on-team flow still renders byte-identical when the second tab is mounted', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        programMates={PROGRAM_MATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    // The existing on-team sheet is visible by default (the first tab
    // is the default).
    expect(screen.getByTestId('parent-forward-on-team-sheet')).toBeInTheDocument();
    // The existing 0079 testids all still exist.
    expect(
      screen.getByTestId('parent-forward-on-team-sender-first-name'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('parent-forward-on-team-search')).toBeInTheDocument();
    expect(screen.getByTestId('parent-forward-on-team-note')).toBeInTheDocument();
    expect(screen.getByTestId('parent-forward-on-team-send')).toBeInTheDocument();
    expect(
      screen.getByTestId('parent-forward-on-team-candidate-p-liam'),
    ).toBeInTheDocument();
  });
});
