/**
 * Ticket 0067 — <SubHandoffSheet /> component test.
 *
 * The sheet on the regular coach's session detail page. The coach types the
 * sub's first name (optional), toggles the three include checkboxes (all on
 * by default), taps Generate. The success state shows a Copy button with the
 * URL on `data-share-url` per LESSONS#0056 / #0082 (so the e2e + this test
 * can assert the constructed URL without a real <a href>).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SubHandoffSheet } from '@/components/session/sub-handoff-sheet';

const SESSION_ID = '00000000-0000-4000-a000-000000000040';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('<SubHandoffSheet /> (ticket 0067)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the sheet with the three include checkboxes (all on)', () => {
    render(<SubHandoffSheet sessionId={SESSION_ID} open onClose={vi.fn()} />);
    expect(screen.getByTestId('sub-handoff-sheet')).toBeTruthy();
    const cbDrills = screen.getByTestId('sub-handoff-include-drills') as HTMLInputElement;
    const cbFocus = screen.getByTestId('sub-handoff-include-focus') as HTMLInputElement;
    const cbEyes = screen.getByTestId('sub-handoff-include-eyes') as HTMLInputElement;
    expect(cbDrills.checked).toBe(true);
    expect(cbFocus.checked).toBe(true);
    expect(cbEyes.checked).toBe(true);
  });

  it('tapping Generate POSTs /api/sub-handoff/create with the right body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(
          JSON.stringify({
            token: 'tok.sig',
            url: 'https://example.test/sub/tok.sig',
            expiresIn: '24 hours',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    render(<SubHandoffSheet sessionId={SESSION_ID} open onClose={vi.fn()} />);

    // Fill in the sub-name.
    const nameInput = screen.getByTestId('sub-handoff-name-input') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Mark' } });

    // Untoggle the focus checkbox.
    const cbFocus = screen.getByTestId('sub-handoff-include-focus');
    fireEvent.click(cbFocus);

    fireEvent.click(screen.getByTestId('sub-handoff-generate-btn'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const call = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes('/api/sub-handoff/create'),
    );
    expect(call).toBeTruthy();
    const init = call?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.sessionId).toBe(SESSION_ID);
    expect(body.subFirstName).toBe('Mark');
    expect(body.includeWeeklyFocus).toBe(false);
    expect(body.includeQueuedDrills).toBe(true);
    expect(body.includeEyesOnPlayers).toBe(true);
  });

  it('after Generate, shows the Copy button with the share URL on data-share-url', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(
          JSON.stringify({
            token: 'tok.sig',
            url: 'https://example.test/sub/tok.sig',
            expiresIn: '24 hours',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    render(<SubHandoffSheet sessionId={SESSION_ID} open onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId('sub-handoff-generate-btn'));

    const copy = await screen.findByTestId('sub-handoff-copy-btn');
    expect(copy.getAttribute('data-share-url')).toBe('https://example.test/sub/tok.sig');
  });

  it('voice contract: rendered DOM contains no AGENTS.md banned tokens', () => {
    const { container } = render(<SubHandoffSheet sessionId={SESSION_ID} open onClose={vi.fn()} />);
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});
