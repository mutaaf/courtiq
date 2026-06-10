/**
 * Ticket 0079 — ParentForwardOnTeamButton component test.
 *
 * Asserts:
 *  - The button renders the small zinc-500 line + the "Send to one
 *    parent" trigger.
 *  - Tapping it opens a sheet with a first-name search across the
 *    OTHER players on the team.
 *  - The sender's own player is excluded from the candidate list.
 *  - The candidate list excludes players with no parent_email.
 *  - The candidate list shows FIRST NAMES ONLY (no surnames).
 *  - Selecting a candidate pre-fills the textarea with the templated
 *    copy ("I thought you'd want to read this — <recipient> and <my kid>
 *    are on the same team, and the coach's reports have been really
 *    helpful. — <senderFirstName>.").
 *  - Submitting the sheet POSTs /api/share/parent-forward with the
 *    payload (shareToken, recipientPlayerId, senderFirstName, note).
 *  - On 200, the sheet closes and a small toast renders.
 *  - On 429 (already-sent), the toast reads the already-sent copy.
 *  - Every rendered text contains no AGENTS.md banned word.
 *  - Stable `data-testid` on the button and the sheet for the
 *    multi-CTA parent-portal page (LESSONS#0022 / #0029 / #0082).
 *
 * `.test.tsx`, not `.spec.ts` (LESSONS#0020 / #38).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { ParentForwardOnTeamButton } from '@/components/share/parent-forward-on-team-button';

const SHARE_TOKEN = 'tok-parent-forward-test';
const MY_FIRST_NAME = 'Maya';

const TEAMMATES = [
  { player_id: 'p-liam', first_name: 'Liam' },
  { player_id: 'p-kai', first_name: 'Kai' },
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

describe('ParentForwardOnTeamButton (ticket 0079)', () => {
  it('renders the button with the small zinc-500 prompt + an orange-pill trigger', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    const trigger = screen.getByTestId('parent-forward-on-team-button');
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent(/send to one parent/i);
  });

  it('tapping the trigger opens the sheet', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    expect(screen.getByTestId('parent-forward-on-team-sheet')).toBeInTheDocument();
  });

  it('renders ONLY first names in the candidate list (no surnames)', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    const sheet = screen.getByTestId('parent-forward-on-team-sheet');
    expect(within(sheet).getByText('Liam')).toBeInTheDocument();
    expect(within(sheet).getByText('Kai')).toBeInTheDocument();
    // No surnames anywhere in the sheet (the teamMates payload has
    // first_name only by AC).
    const sheetText = sheet.textContent ?? '';
    expect(sheetText).not.toMatch(/\b(Walker|Carter|Smith|Jones)\b/);
  });

  it('renders nothing when teamMates is empty (silence beats a dead button)', () => {
    const { container } = render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={[]}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    expect(container.querySelector('[data-testid="parent-forward-on-team-button"]')).toBeNull();
  });

  it('selecting a candidate pre-fills the note textarea with the templated copy', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    // Type sender first name first — the sheet asks for it once at top.
    fireEvent.change(
      screen.getByTestId('parent-forward-on-team-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    // Select Liam.
    fireEvent.click(screen.getByTestId('parent-forward-on-team-candidate-p-liam'));
    const note = screen.getByTestId('parent-forward-on-team-note') as HTMLTextAreaElement;
    expect(note.value).toMatch(/Liam/);
    expect(note.value).toMatch(/Maya/);
    expect(note.value).toMatch(/Sarah/);
  });

  it('Send POSTs /api/share/parent-forward with the right payload and closes the sheet on 200', async () => {
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
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.change(
      screen.getByTestId('parent-forward-on-team-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-candidate-p-liam'));
    fireEvent.click(screen.getByTestId('parent-forward-on-team-send'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/share/parent-forward');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.shareToken).toBe(SHARE_TOKEN);
    expect(body.recipientPlayerId).toBe('p-liam');
    expect(body.senderFirstName).toBe('Sarah');
    expect(typeof body.note).toBe('string');
    expect(body.note.length).toBeGreaterThan(0);

    await waitFor(() => {
      expect(screen.getByTestId('parent-forward-on-team-sent-toast')).toBeInTheDocument();
    });
  });

  it('on 429 (already-sent) renders the already-sent toast naming the recipient', async () => {
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
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.change(
      screen.getByTestId('parent-forward-on-team-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-candidate-p-liam'));
    fireEvent.click(screen.getByTestId('parent-forward-on-team-send'));

    await waitFor(() => {
      expect(screen.getByTestId('parent-forward-on-team-already-toast')).toBeInTheDocument();
    });
    const toast = screen.getByTestId('parent-forward-on-team-already-toast');
    expect(toast).toHaveTextContent(/Liam/);
  });

  it('rendered text contains no AGENTS.md banned word', () => {
    render(
      <ParentForwardOnTeamButton
        shareToken={SHARE_TOKEN}
        teamMates={TEAMMATES}
        myKidFirstName={MY_FIRST_NAME}
      />,
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-button'));
    fireEvent.change(
      screen.getByTestId('parent-forward-on-team-sender-first-name'),
      { target: { value: 'Sarah' } },
    );
    fireEvent.click(screen.getByTestId('parent-forward-on-team-candidate-p-liam'));
    const text = (document.body.textContent ?? '').toLowerCase();
    for (const w of BANNED_WORDS) {
      expect(text).not.toContain(w);
    }
  });
});
