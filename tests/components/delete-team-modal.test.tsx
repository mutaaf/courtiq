/**
 * Ticket 0053 — DeleteTeamModal component tests.
 *
 * The hard-delete modal is the second-tap UI in the archived-teams panel. It
 * shows the live cascade counts ("12 players, 47 practices, 312 observations,
 * …") and requires the admin to type the team name to confirm. The submit
 * button stays disabled until the typed name matches (case-insensitive,
 * trimmed); ANY mismatch leaves the modal open and the row intact.
 *
 * The modal is presentational: it bubbles `onConfirm({ confirm })` to the
 * caller (the organization settings page), which handles the DELETE call.
 * Route-side gating is covered by tests/teams/delete-route.test.ts.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DeleteTeamModal } from '@/components/teams/delete-team-modal';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];

const TEAM_NAME = 'U10 Lions';

function setup(props: Partial<React.ComponentProps<typeof DeleteTeamModal>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeleteTeamModal
      open={true}
      teamName={TEAM_NAME}
      counts={
        props.counts ?? {
          players: 12,
          sessions: 47,
          observations: 312,
          plans: 8,
          parent_shares: 3,
        }
      }
      isDeleting={false}
      error={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel };
}

describe('DeleteTeamModal (ticket 0053)', () => {
  beforeEach(() => cleanup());

  it('renders nothing when open is false', () => {
    const { container } = render(
      <DeleteTeamModal
        open={false}
        teamName={TEAM_NAME}
        counts={{ players: 0, sessions: 0, observations: 0, plans: 0, parent_shares: 0 }}
        isDeleting={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('carries a stable data-testid the e2e spec can scope to', () => {
    setup();
    expect(screen.getByTestId('delete-team-modal')).toBeInTheDocument();
  });

  it('shows the team name in the dialog heading', () => {
    setup();
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent || '').toMatch(/u10 lions/i);
  });

  it('lists the cascade counts the admin is about to remove', () => {
    setup({
      counts: { players: 12, sessions: 47, observations: 312, plans: 8, parent_shares: 3 },
    });
    const body = document.body.textContent || '';
    expect(body).toMatch(/12\s*players/i);
    expect(body).toMatch(/47\s*practices?/i);
    // The observation line is phrased "312 coach observations" so the admin
    // knows the count is coach-authored notes, not raw events; tolerate the
    // qualifier in the assertion.
    expect(body).toMatch(/312[^\d]*observations?/i);
  });

  it('keeps the destructive submit DISABLED until the typed team name matches', () => {
    const { onConfirm } = setup();
    const submit = screen.getByRole('button', { name: /^delete the team forever$/i });
    expect(submit).toBeDisabled();

    const input = screen.getByLabelText(/type the team name to confirm/i);

    // Wrong text — stays disabled.
    fireEvent.change(input, { target: { value: 'Wrong Team' } });
    expect(submit).toBeDisabled();

    // Right text, different case + surrounding whitespace — enabled.
    fireEvent.change(input, { target: { value: '  u10 lions  ' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ confirm: '  u10 lions  ' });
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const { onCancel } = setup();
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows the error message when error is set', () => {
    setup({ error: 'Could not delete — try again' });
    expect(screen.getByText(/could not delete/i)).toBeInTheDocument();
  });

  it('disables the submit button while isDeleting is true (no double-submit)', () => {
    setup({ isDeleting: true });
    const btn = screen.getByRole('button', { name: /deleting/i });
    expect(btn).toBeDisabled();
  });

  it('uses no AGENTS.md-banned hype words in any rendered copy', () => {
    setup();
    const text = (document.body.textContent || '').toLowerCase();
    for (const w of BANNED) expect(text).not.toContain(w);
  });
});
