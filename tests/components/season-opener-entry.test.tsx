/**
 * Ticket 0068 — <SeasonOpenerEntry /> component test.
 *
 * The entry point lives on /home and (via this same component) on the
 * post-setup success surface. Tap "Share your season opener" → a sheet
 * opens; type a one-line focus, tap "Make my season opener"; the success
 * state exposes the URL and a Copy button carrying `data-share-url` per
 * LESSONS#0056 / #0082.
 *
 * Voice contract: rendered DOM contains no AGENTS.md banned tokens
 * (LESSONS#0023 — instruct positively).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SeasonOpenerEntry } from '@/components/onboarding/season-opener-entry';

const TEAM_ID = '00000000-0000-4000-a000-000000000020';

const BANNED = [
  'journey',
  'amazing',
  'exciting',
  'elevate',
  'empower',
  'synergy',
  'unlock your potential',
];

describe('<SeasonOpenerEntry /> (ticket 0068)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the entry button with a parent-facing label (no banned voice)', () => {
    render(<SeasonOpenerEntry teamId={TEAM_ID} />);
    const btn = screen.getByTestId('season-opener-entry-btn');
    expect(btn).toBeTruthy();
    const label = (btn.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(label).not.toContain(word);
    }
  });

  it('tapping the entry button opens the sheet', () => {
    render(<SeasonOpenerEntry teamId={TEAM_ID} />);
    fireEvent.click(screen.getByTestId('season-opener-entry-btn'));
    expect(screen.getByTestId('season-opener-sheet')).toBeTruthy();
  });

  it('tapping "Make my season opener" POSTs /api/season-opener/create with the focus line', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(
          JSON.stringify({
            token: 'tok-001',
            url: 'https://example.test/opener/tok-001',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    render(<SeasonOpenerEntry teamId={TEAM_ID} />);
    fireEvent.click(screen.getByTestId('season-opener-entry-btn'));

    const textarea = screen.getByTestId(
      'season-opener-focus-input',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: 'closeouts and good sportsmanship' },
    });

    fireEvent.click(screen.getByTestId('season-opener-make-btn'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    const call = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes('/api/season-opener/create'),
    );
    expect(call).toBeTruthy();
    const init = call?.[1] as RequestInit | undefined;
    expect(init?.method).toBe('POST');
    const body = JSON.parse(String(init?.body));
    expect(body.teamId).toBe(TEAM_ID);
    expect(body.focusLine).toBe('closeouts and good sportsmanship');
  });

  it('after Make, shows the Copy button with the URL on data-share-url', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        return new Response(
          JSON.stringify({
            token: 'tok-001',
            url: 'https://example.test/opener/tok-001',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    );

    render(<SeasonOpenerEntry teamId={TEAM_ID} />);
    fireEvent.click(screen.getByTestId('season-opener-entry-btn'));
    const textarea = screen.getByTestId('season-opener-focus-input');
    fireEvent.change(textarea, { target: { value: 'spacing and movement' } });
    fireEvent.click(screen.getByTestId('season-opener-make-btn'));

    const copy = await screen.findByTestId('season-opener-copy-btn');
    expect(copy.getAttribute('data-share-url')).toBe(
      'https://example.test/opener/tok-001',
    );
  });

  it('voice contract: rendered DOM contains no AGENTS.md banned tokens', () => {
    const { container } = render(<SeasonOpenerEntry teamId={TEAM_ID} />);
    // Open the sheet so the textarea / button copy is rendered too.
    fireEvent.click(screen.getByTestId('season-opener-entry-btn'));
    const text = (container.textContent ?? '').toLowerCase();
    for (const word of BANNED) {
      expect(text, `banned word "${word}"`).not.toContain(word);
    }
  });
});
