/**
 * Ticket 0049 — component tests for PublishPlanButton.
 *
 * The button lives next to a saved practice plan. The coach taps it, optionally
 * adds a one-line note, taps "Publish," and a `/plan/<token>` link appears with
 * a Copy control. The button POSTs /api/practice-plan-shares/create with
 * { planId, note? } — never direct Supabase from the client (AGENTS.md rule 3).
 *
 * Voice contract: the rendered copy must contain NO AGENTS.md banned words
 * (`journey`, `amazing`, `exciting`, `elevate`, `empower`, `synergy`). The scan
 * is implemented as a top-level setup test below, not as enumerated tokens
 * inside the component itself (LESSONS#0023).
 *
 * Mirrors tests/components/recap-share-button.test.tsx.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublishPlanButton } from '@/components/plans/publish-plan-button';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function publishTrigger() {
  return screen.getByRole('button', { name: /^publish$/i });
}

describe('PublishPlanButton (ticket 0049)', () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders a Publish control and shows no link before any click', () => {
    render(<PublishPlanButton planId="plan-1" />, { wrapper });
    expect(publishTrigger()).toBeInTheDocument();
    // Before publishing, the public URL is not rendered.
    expect(screen.queryByText(/\/plan\//)).not.toBeInTheDocument();
  });

  it('POSTs /api/practice-plan-shares/create with { planId, note } on tap', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 't-pub-1', url: '/plan/t-pub-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<PublishPlanButton planId="plan-7" />, { wrapper });
    fireEvent.click(publishTrigger());

    // The sheet exposes a textarea for the optional note.
    const noteField = await screen.findByRole('textbox', { name: /note/i });
    fireEvent.change(noteField, { target: { value: 'Worked great with U12s.' } });

    fireEvent.click(screen.getByRole('button', { name: /publish this plan/i }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/practice-plan-shares/create',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ planId: 'plan-7', note: 'Worked great with U12s.' });
  });

  it('renders the /plan/<token> URL and a Copy control after publish', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ token: 't-pub-2', url: '/plan/t-pub-2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<PublishPlanButton planId="plan-1" />, { wrapper });
    fireEvent.click(publishTrigger());
    fireEvent.click(await screen.findByRole('button', { name: /publish this plan/i }));

    await waitFor(() => {
      expect(screen.getByText(/\/plan\/t-pub-2/)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
  });

  it('rendered copy avoids the AGENTS.md banned tokens', () => {
    render(<PublishPlanButton planId="plan-1" />, { wrapper });
    fireEvent.click(publishTrigger());
    const text = document.body.textContent ?? '';
    // Spelled OUT so the test enumerates them once, but the component itself
    // never lists them verbatim (LESSONS#0023). Lowercased compare so accidental
    // casing variants still trip the test.
    const lower = text.toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(lower).not.toContain(banned);
    }
  });
});
