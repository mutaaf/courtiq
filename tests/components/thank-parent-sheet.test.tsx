/**
 * Ticket 0056 — ThankParentSheet component tests.
 *
 * The sheet is the coach's UI for the one-tap thank-you. On open it POSTs to
 * /api/parent-reactions/<id>/draft-reply, shows the returned draft, and on
 * Send POSTs to /api/parent-reactions/<id>/send-reply. The sheet itself
 * does NOT call any AI — it forwards an `onSent({ coach_reply_id })` to
 * the caller so the inbox row can collapse to the "Replied" pill.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#38).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { ThankParentSheet } from '@/components/parent-reactions/thank-parent-sheet';

const REACTION_ID = '00000000-0000-4000-a000-000000000aa1';
const REPLY_ID = '00000000-0000-4000-a000-000000000ce1';

const DRAFT = 'Sarah — thanks for the note. Devon has been working on his shot. — Maya';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

// Hoisted fetch mock so the component's POSTs go through a single capturable
// surface.
const fetchMock = vi.fn();

beforeEach(() => {
  cleanup();
  fetchMock.mockReset();
  // Default: draft route returns DRAFT, send route returns the coach_reply_id.
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/draft-reply')) {
      return new Response(JSON.stringify({ draft: DRAFT }), { status: 200 });
    }
    if (url.includes('/send-reply')) {
      return new Response(JSON.stringify({ coach_reply_id: REPLY_ID }), { status: 200 });
    }
    void init;
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

function setup(props: Partial<React.ComponentProps<typeof ThankParentSheet>> = {}) {
  const onClose = vi.fn();
  const onSent = vi.fn();
  render(
    <ThankParentSheet
      open
      reactionId={REACTION_ID}
      parentFirstName="Sarah"
      playerFirstName="Devon"
      onClose={onClose}
      onSent={onSent}
      {...props}
    />,
  );
  return { onClose, onSent };
}

describe('ThankParentSheet (ticket 0056)', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <ThankParentSheet
        open={false}
        reactionId={REACTION_ID}
        parentFirstName="Sarah"
        playerFirstName="Devon"
        onClose={vi.fn()}
        onSent={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('POSTs the draft route on open and renders the returned draft', async () => {
    setup();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain(`/api/parent-reactions/${REACTION_ID}/draft-reply`);

    await waitFor(() => {
      expect(screen.getByDisplayValue(DRAFT)).toBeInTheDocument();
    });
  });

  it('carries a stable data-testid the e2e spec can scope to', async () => {
    setup();
    await waitFor(() => {
      expect(screen.getByTestId('thank-parent-sheet')).toBeInTheDocument();
    });
  });

  it('the header names the parent first name (no last name leaks)', async () => {
    setup();
    await waitFor(() => {
      // The header reads "Thank Sarah" — the first name only.
      expect(screen.getByText(/thank sarah/i)).toBeInTheDocument();
    });
  });

  it('rendered text uses clipboard voice — no AGENTS.md banned word in the header/labels', async () => {
    setup();
    await waitFor(() => {
      // The header is rendered.
      expect(screen.getByText(/thank sarah/i)).toBeInTheDocument();
    });
    const body = document.body.textContent?.toLowerCase() ?? '';
    for (const w of BANNED) expect(body).not.toContain(w);
  });

  it('Send button POSTs the send route and fires onSent on success', async () => {
    const { onSent } = setup();
    await waitFor(() => expect(screen.getByDisplayValue(DRAFT)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
    const sendCall = fetchMock.mock.calls[1];
    const url = String(sendCall[0]);
    expect(url).toContain(`/api/parent-reactions/${REACTION_ID}/send-reply`);
    expect(onSent).toHaveBeenCalledTimes(1);
    expect(onSent).toHaveBeenCalledWith({ coach_reply_id: REPLY_ID });
  });

  it('the coach can edit the draft text before sending', async () => {
    setup();
    await waitFor(() => expect(screen.getByDisplayValue(DRAFT)).toBeInTheDocument());
    const textarea = screen.getByDisplayValue(DRAFT) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: 'Sarah — thanks. Devon really pushed at the rec center this week. — Maya',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /^send$/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const sendCall = fetchMock.mock.calls[1];
    const body = JSON.parse(String((sendCall[1] as RequestInit).body));
    expect(body.message).toContain('rec center');
  });

  it('Cancel button fires onClose and does NOT POST send-reply', async () => {
    const { onClose } = setup();
    await waitFor(() => expect(screen.getByDisplayValue(DRAFT)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Only the draft fetch — never a send call.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
