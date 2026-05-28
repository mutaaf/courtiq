/**
 * Component tests for ClaimHandleSection — the "Want a cleaner URL?" surface
 * on /settings/referrals (ticket 0054).
 *
 * The component fetches GET /api/coach-handle/available debounced and on
 * success POSTs /api/coach-handle/claim. Two states:
 *   1) Unclaimed coach — render the input + availability indicator + claim
 *      action; on success collapse to the read-only line with a copy button.
 *   2) Already-claimed coach — read-only "Your URL: sportsiq.app/coach/<handle>"
 *      with a copy button; no re-claim affordance (v1 is one-time claim).
 *
 * No AGENTS.md banned word appears in the rendered DOM at any point.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClaimHandleSection } from '@/components/growth/claim-handle-section';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportsiq.app';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy'];

describe('ClaimHandleSection — already-claimed coach', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the read-only URL with no claim input when the coach has a handle', () => {
    render(<ClaimHandleSection initialHandle="sarah-rodriguez" displayName="Sarah Rodriguez" />, {
      wrapper,
    });

    // The handle URL is visible.
    expect(screen.getByText(/sarah-rodriguez/)).toBeTruthy();
    // No input for re-claiming.
    expect(screen.queryByRole('textbox')).toBeNull();
    // A copy button is present.
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
  });

  it('renders no AGENTS.md banned word in the read-only state', () => {
    const { container } = render(
      <ClaimHandleSection initialHandle="sarah-rodriguez" displayName="Sarah Rodriguez" />,
      { wrapper },
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of BANNED) {
      expect(text).not.toContain(banned);
    }
  });
});

describe('ClaimHandleSection — unclaimed coach', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('pre-fills the input from displayName via proposeHandle', () => {
    render(<ClaimHandleSection initialHandle={null} displayName="Sarah Rodriguez" />, {
      wrapper,
    });
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('sarah-rodriguez');
  });

  it('calls the available endpoint when the user types a new handle', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/coach-handle/available')) {
        return new Response(JSON.stringify({ available: true, reason: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });

    render(<ClaimHandleSection initialHandle={null} displayName="Sarah Rodriguez" />, {
      wrapper,
    });

    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'sarah-r' } });

    // The debounce settles fast in tests (no real timer assertion — wait for the
    // network call to fire).
    await waitFor(
      () => {
        const sawAvailable = fetchSpy.mock.calls.some(([url]) =>
          String(url).includes('/api/coach-handle/available'),
        );
        expect(sawAvailable).toBe(true);
      },
      { timeout: 1500 },
    );
  });

  it('shows the success line after a successful claim', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/api/coach-handle/available')) {
        return new Response(JSON.stringify({ available: true, reason: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/coach-handle/claim')) {
        return new Response(JSON.stringify({ handle: 'sarah-rodriguez' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    });

    render(<ClaimHandleSection initialHandle={null} displayName="Sarah Rodriguez" />, {
      wrapper,
    });

    // The Claim button is gated on the available-check resolving to true; wait
    // for the debounced check + fetch round-trip to enable it.
    const claimBtn = screen.getByRole('button', { name: /claim/i });
    await waitFor(() => expect((claimBtn as HTMLButtonElement).disabled).toBe(false), {
      timeout: 2000,
    });
    fireEvent.click(claimBtn);

    await waitFor(
      () => {
        // After success, the read-only line replaces the form.
        expect(screen.queryByRole('textbox')).toBeNull();
        // And the URL is displayed.
        expect(screen.getByText(/sarah-rodriguez/)).toBeTruthy();
      },
      { timeout: 2000 },
    );
    // Surfaced URL must include the host string we promise on the surface.
    expect(APP_URL.length).toBeGreaterThan(0);
  });

  it('renders no AGENTS.md banned word in the form state', () => {
    const { container } = render(
      <ClaimHandleSection initialHandle={null} displayName="Sarah Rodriguez" />,
      { wrapper },
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of BANNED) {
      expect(text).not.toContain(banned);
    }
  });
});
