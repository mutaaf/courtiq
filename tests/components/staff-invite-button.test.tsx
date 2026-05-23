/**
 * Component tests for StaffInviteButton — the director-side "Bring your coaching
 * staff" one-tap share control (ticket 0024).
 *
 * The component fetches GET /api/org/invite via useQuery and exposes the exact
 * org staff-invite URL on data-share-url (navigator.share / clipboard render no
 * <a href>, so both component and e2e tests assert via data-share-url —
 * docs/LESSONS.md 2026-05-21).
 *
 * Maps to the ticket's acceptance criteria:
 *  - AC7: a director whose org has a slug sees the control, and its share payload
 *         contains /org/<slug>?invite=staff for their org.
 *  - AC7: a coach with no org slug (url:null) sees a "create your program first"
 *         hint, NOT a broken/empty share button.
 *  - AC6 (privacy): the constructed URL contains no player identifiers.
 *
 * Pattern mirrors tests/components/invite-coach-button.test.tsx exactly.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaffInviteButton } from '@/components/growth/staff-invite-button';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function staffButton() {
  return screen.getByRole('button', { name: /bring your coaching staff/i });
}

describe('StaffInviteButton — org staff-invite link (ticket 0024)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // AC7: with an org slug present, the share URL carries /org/<slug>?invite=staff
  it('exposes /org/<slug>?invite=staff on data-share-url when the org has a slug', async () => {
    const url = 'https://sportsiq.app/org/lincoln-rec-league?invite=staff';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<StaffInviteButton />, { wrapper });

    await waitFor(() => {
      expect(staffButton()).toHaveAttribute('data-share-url', url);
    });
  });

  // AC7: with no org slug (url:null) the control shows a "create your program
  // first" hint and does NOT render the share button.
  it('shows a "create your program first" hint when url is null', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<StaffInviteButton />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/create your program first/i)).toBeInTheDocument();
    });
    expect(
      screen.queryByRole('button', { name: /bring your coaching staff/i })
    ).not.toBeInTheDocument();
  });

  // The control shows the hint (not a broken button) when the fetch fails.
  it('shows the hint when /api/org/invite fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));

    render(<StaffInviteButton />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/create your program first/i)).toBeInTheDocument();
    });
  });

  // COPPA / data-minimization: the share URL contains no player identifiers.
  it('the constructed URL contains no player identifiers', async () => {
    const url = 'https://sportsiq.app/org/eastside-hoops?invite=staff';
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ url }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<StaffInviteButton />, { wrapper });

    await waitFor(() => {
      const shareUrl = staffButton().getAttribute('data-share-url') ?? '';
      expect(shareUrl).toContain('/org/eastside-hoops?invite=staff');
      expect(shareUrl).not.toMatch(/player/i);
      expect(shareUrl.split('?').length).toBe(2);
      expect(shareUrl.split('?')[1]).toBe('invite=staff');
    });
  });
});
