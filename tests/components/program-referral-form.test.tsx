/**
 * Ticket 0050 — ProgramReferralForm component test.
 *
 * Asserts:
 *  - The default state renders the section header + the open-modal button,
 *    BUT no modal until the button is tapped.
 *  - Tapping the button opens the modal with three inputs (director first
 *    name, director email, optional note).
 *  - Submitting with an invalid email keeps the modal open and shows an
 *    inline email error (no fetch is fired).
 *  - Submitting with a valid email POSTs to the right URL with the right
 *    payload shape and on a 200 swaps the section to the confirmation copy.
 *  - The localStorage flag is set on success so a re-visit (re-mount) shows
 *    the confirmation by default.
 *  - Confirmation surfaces a "Share with another director" affordance per the
 *    multi-director carve-out in the AC.
 *
 * `.test.tsx`, never `.spec.ts` — LESSONS#38.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ProgramReferralForm } from '@/components/share/program-referral-form';

const SHARE_TOKEN = 'tok-program-referral-test';

function openButton() {
  return screen.getByTestId('program-referral-open');
}

function openModalIfClosed() {
  fireEvent.click(openButton());
}

beforeEach(() => {
  cleanup();
  // Each test starts with a fresh localStorage so the confirmation-state
  // branch doesn't leak across cases.
  try {
    window.localStorage.clear();
  } catch {
    /* no-op */
  }
  global.fetch = vi.fn() as unknown as typeof global.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProgramReferralForm — default + open (ticket 0050)', () => {
  it('renders the section header and the open button — modal is closed by default', () => {
    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    expect(screen.getByText(/want sportsiq for your whole league/i)).toBeInTheDocument();
    expect(openButton()).toBeInTheDocument();
    expect(screen.queryByTestId('program-referral-modal')).not.toBeInTheDocument();
  });

  it('opens the modal with three inputs when the button is tapped', () => {
    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    openModalIfClosed();
    const modal = screen.getByTestId('program-referral-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId('program-referral-director-name')).toBeInTheDocument();
    expect(screen.getByTestId('program-referral-director-email')).toBeInTheDocument();
    expect(screen.getByTestId('program-referral-note')).toBeInTheDocument();
  });
});

describe('ProgramReferralForm — validation (ticket 0050)', () => {
  it('shows an inline email error and does NOT fetch when the email is malformed', async () => {
    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    openModalIfClosed();

    fireEvent.change(screen.getByTestId('program-referral-director-name'), {
      target: { value: 'Jordan' },
    });
    // Use a string the browser's `type=email` won't reject but our shape
    // helper does — "x@y" lacks the dot after @.
    fireEvent.change(screen.getByTestId('program-referral-director-email'), {
      target: { value: 'not-an-email' },
    });
    fireEvent.click(screen.getByTestId('program-referral-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('program-referral-email-error')).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();
    // Modal stays open.
    expect(screen.getByTestId('program-referral-modal')).toBeInTheDocument();
  });
});

describe('ProgramReferralForm — successful POST (ticket 0050)', () => {
  it('POSTs the right payload to /api/share/<token>/program-referral and swaps the section to the confirmation', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          alreadySent: false,
          directorFirstName: 'Jordan',
        }),
      });
    global.fetch = mockFetch as unknown as typeof global.fetch;

    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    openModalIfClosed();

    fireEvent.change(screen.getByTestId('program-referral-director-name'), {
      target: { value: 'Jordan' },
    });
    fireEvent.change(screen.getByTestId('program-referral-director-email'), {
      target: { value: 'jordan@reclyleague.org' },
    });
    fireEvent.change(screen.getByTestId('program-referral-note'), {
      target: { value: 'You should see this.' },
    });

    fireEvent.click(screen.getByTestId('program-referral-submit'));

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe(`/api/share/${SHARE_TOKEN}/program-referral`);
    expect(init.method).toBe('POST');
    const body = JSON.parse((init.body as string) ?? '{}');
    expect(body).toEqual({
      parentFirstName: 'Maria',
      directorFirstName: 'Jordan',
      directorEmail: 'jordan@reclyleague.org',
      note: 'You should see this.',
    });

    // After 200 the section swaps to the confirmation copy.
    await waitFor(() =>
      expect(screen.getByText(/sent to jordan\./i)).toBeInTheDocument(),
    );

    // And the modal is closed.
    expect(screen.queryByTestId('program-referral-modal')).not.toBeInTheDocument();

    // The localStorage flag was set so a re-visit shows confirmation by default.
    expect(window.localStorage.getItem(`sportsiq_program_referral_sent:${SHARE_TOKEN}`))
      .toBe('Jordan');
  });

  it('exposes a "Share with another director" affordance on the confirmation state (multi-director)', async () => {
    // Pre-seed localStorage to simulate a re-visit.
    window.localStorage.setItem(
      `sportsiq_program_referral_sent:${SHARE_TOKEN}`,
      'Jordan',
    );
    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    expect(screen.getByText(/sent to jordan\./i)).toBeInTheDocument();
    expect(screen.getByTestId('program-referral-share-another')).toBeInTheDocument();
  });

  it('renders no banned voice tokens in any visible section copy', () => {
    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    openModalIfClosed();
    const text = document.body.textContent?.toLowerCase() ?? '';
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(text).not.toContain(banned);
    }
  });
});

describe('ProgramReferralForm — server-side error surface (ticket 0050)', () => {
  it('renders an error message and stays open when the POST fails with 429', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Too many submissions for this report today.' }),
      }) as unknown as typeof global.fetch;

    render(<ProgramReferralForm shareToken={SHARE_TOKEN} parentFirstName="Maria" />);
    openModalIfClosed();

    fireEvent.change(screen.getByTestId('program-referral-director-name'), {
      target: { value: 'Jordan' },
    });
    fireEvent.change(screen.getByTestId('program-referral-director-email'), {
      target: { value: 'jordan@reclyleague.org' },
    });
    fireEvent.click(screen.getByTestId('program-referral-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('program-referral-error')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('program-referral-modal')).toBeInTheDocument();
  });
});
