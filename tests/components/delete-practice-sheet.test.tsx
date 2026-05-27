/**
 * Ticket 0051 — DeletePracticeSheet component tests.
 *
 * The sheet is the coach's UI for the per-session delete primitive. Two screens:
 *   1. Default ("Remove this practice — keep my N notes") with one orange CTA
 *      and a ghost cancel.
 *   2. An optional destructive section that requires typing the team name to
 *      confirm cascade-mode.
 *
 * The sheet itself does NOT call the route — it bubbles `onConfirm({ mode })`
 * to the caller (the session detail page). Tests assert the UI states and the
 * confirm-string gate; route gating is covered by tests/sessions/delete-session-route.test.ts.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DeletePracticeSheet } from '@/components/sessions/delete-practice-sheet';

const BANNED = ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy', 'unlock your potential'];

const TEAM_NAME = 'Wildcats';

function setup(props: Partial<React.ComponentProps<typeof DeletePracticeSheet>> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <DeletePracticeSheet
      open={true}
      teamName={TEAM_NAME}
      observationCount={props.observationCount ?? 0}
      isDeleting={false}
      error={null}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />
  );
  return { onConfirm, onCancel };
}

describe('DeletePracticeSheet (ticket 0051)', () => {
  beforeEach(() => cleanup());

  it('renders nothing when open is false', () => {
    const { container } = render(
      <DeletePracticeSheet
        open={false}
        teamName={TEAM_NAME}
        observationCount={0}
        isDeleting={false}
        error={null}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('carries a stable data-testid the e2e spec can scope to', () => {
    setup({ observationCount: 0 });
    expect(screen.getByTestId('delete-practice-sheet')).toBeInTheDocument();
  });

  it('shows the empty-session default copy when observationCount is 0', () => {
    setup({ observationCount: 0 });
    // The default-mode CTA is present and uses neutral language (no banned words).
    const removeBtn = screen.getByRole('button', { name: /remove this practice/i });
    expect(removeBtn).toBeInTheDocument();
    expect(removeBtn.textContent || '').not.toMatch(/note/i); // 0 notes — no notes line
  });

  it('shows the live observation count in the default-mode summary', () => {
    setup({ observationCount: 12 });
    // The summary line names the count so the coach sees it before confirming.
    expect(screen.getByText(/12 (notes|observations)/i)).toBeInTheDocument();
  });

  it('fires onConfirm with mode=preserve when the default CTA is clicked', () => {
    const { onConfirm } = setup({ observationCount: 5 });
    fireEvent.click(screen.getByRole('button', { name: /remove this practice/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'preserve' });
  });

  it('fires onCancel when the cancel button is clicked', () => {
    const { onCancel } = setup({ observationCount: 0 });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does NOT render the destructive section when observationCount is 0', () => {
    setup({ observationCount: 0 });
    expect(screen.queryByText(/delete the notes too/i)).not.toBeInTheDocument();
  });

  it('renders an expand control for the destructive section when there are observations', () => {
    setup({ observationCount: 3 });
    expect(screen.getByRole('button', { name: /delete the notes too/i })).toBeInTheDocument();
  });

  it('reveals the typed team-name confirm input when the destructive section is expanded', () => {
    setup({ observationCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: /delete the notes too/i }));
    expect(screen.getByLabelText(/type the team name/i)).toBeInTheDocument();
  });

  it('keeps the destructive submit DISABLED until the typed team name matches (case-insensitive)', () => {
    const { onConfirm } = setup({ observationCount: 3 });
    fireEvent.click(screen.getByRole('button', { name: /delete the notes too/i }));
    const submit = screen.getByRole('button', { name: /^delete practice and notes$/i });
    expect(submit).toBeDisabled();

    // Wrong text
    const input = screen.getByLabelText(/type the team name/i);
    fireEvent.change(input, { target: { value: 'Lakers' } });
    expect(submit).toBeDisabled();

    // Right text, different case + whitespace
    fireEvent.change(input, { target: { value: '  wildcats  ' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);
    expect(onConfirm).toHaveBeenCalledWith({ mode: 'cascade', confirm: '  wildcats  ' });
  });

  it('shows the error message and re-enables the buttons when error is set', () => {
    setup({ observationCount: 0, error: "Couldn't delete — try again" });
    expect(screen.getByText(/couldn't delete/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove this practice/i })).not.toBeDisabled();
  });

  it('disables the primary CTA while isDeleting is true (no double-submit)', () => {
    setup({ observationCount: 0, isDeleting: true });
    // When deleting, the button label flips to "Removing…" — assert by that
    // loading-state label so we both confirm the spinner is visible AND that
    // the button is disabled.
    const btn = screen.getByRole('button', { name: /removing/i });
    expect(btn).toBeDisabled();
  });

  it('uses no AGENTS.md-banned hype words in any rendered copy', () => {
    setup({ observationCount: 12 });
    fireEvent.click(screen.getByRole('button', { name: /delete the notes too/i }));
    const text = (document.body.textContent || '').toLowerCase();
    for (const w of BANNED) expect(text).not.toContain(w);
  });
});
