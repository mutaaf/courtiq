/**
 * Ticket 0086 — caller-surface integration for the structured tier-limit body.
 *
 * Asserts the smallest-blast-radius wiring at the onboarding/setup surface
 * (the canonical join-flow caller):
 *
 *   (i)   a 4xx with `code: 'tier_limit_max_teams'` renders the contextual
 *         sheet (scoped by data-testid per LESSONS#0029 / #0082), NOT the
 *         legacy error toast.
 *   (ii)  any OTHER 4xx (e.g. validation error) renders the existing toast
 *         path unchanged (LESSONS#0103 additive widening).
 *   (iii) the sheet body forwards the named team and the named inviter when
 *         both are present in the structured body.
 *
 * .test.tsx NOT .spec.tsx (LESSONS#38).
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import CombinedSetupPage from '@/app/(auth)/onboarding/setup/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/analytics', () => ({
  trackEvent: vi.fn(),
}));

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockFetch(response: { status: number; body: unknown }) {
  const fn = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    void init;
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.spyOn(globalThis, 'fetch').mockImplementation(fn as unknown as typeof fetch);
  return fn;
}

async function clickSportThenSubmit() {
  // Pick basketball (any sport works — the route mock doesn't check).
  fireEvent.click(screen.getByRole('button', { name: /basketball/i }));
  // Fill the required team name.
  const teamInput = screen.getByPlaceholderText(/blue tigers/i);
  fireEvent.change(teamInput, { target: { value: 'Hawks U12' } });
  // Submit.
  fireEvent.click(screen.getByRole('button', { name: /continue/i }));
}

describe('Onboarding setup × tier-limit sheet integration (ticket 0086)', () => {
  it('(i) renders the contextual sheet on a tier_limit_max_teams 4xx', async () => {
    mockFetch({
      status: 403,
      body: {
        error: 'Your free plan allows up to 1 team. Please upgrade to add more teams.',
        upgrade: true,
        code: 'tier_limit_max_teams',
        currentCount: 1,
        maxCount: 1,
        attemptedTeamName: 'Hawks U12',
        currentTier: 'free',
        invitedBy: { firstName: 'Mike', role: 'assistant_coach' },
      },
    });
    render(<CombinedSetupPage />);
    await clickSportThenSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('team-limit-upgrade-sheet')).toBeInTheDocument();
    });
    const sheet = screen.getByTestId('team-limit-upgrade-sheet');
    expect(sheet.textContent).toContain('Hawks U12');
    expect(sheet.textContent).toContain('Mike');
  });

  it('(ii) renders the existing toast path for an UNRELATED 4xx (validation error)', async () => {
    mockFetch({
      status: 400,
      body: { error: 'teamName required' },
    });
    render(<CombinedSetupPage />);
    await clickSportThenSubmit();
    await waitFor(() => {
      // The legacy toast renders the error string inline; the sheet is absent.
      expect(screen.queryByTestId('team-limit-upgrade-sheet')).not.toBeInTheDocument();
      expect(screen.getByText(/teamName required/i)).toBeInTheDocument();
    });
  });

  it('(iii) sheet body forwards the named team only when the inviter is absent', async () => {
    mockFetch({
      status: 403,
      body: {
        error: 'Your free plan allows up to 1 team. Please upgrade to add more teams.',
        upgrade: true,
        code: 'tier_limit_max_teams',
        currentCount: 1,
        maxCount: 1,
        attemptedTeamName: 'Falcons U14',
        currentTier: 'free',
      },
    });
    render(<CombinedSetupPage />);
    await clickSportThenSubmit();
    await waitFor(() => {
      expect(screen.getByTestId('team-limit-upgrade-sheet')).toBeInTheDocument();
    });
    const sheet = screen.getByTestId('team-limit-upgrade-sheet');
    expect(sheet.textContent).toContain('Falcons U14');
    // No inviter was forwarded — the line never appears.
    expect(sheet.textContent).not.toContain('invited you');
  });
});
