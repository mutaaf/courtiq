/**
 * Ticket 0062 — component test for the silent-player nudge opt-out toggle row
 * on /settings/profile.
 *
 * Mirrors the Sunday-plan-prompt toggle's shape (ticket 0058). The toggle
 * reads `preferences.disable_silent_player_nudge` and writes through
 * `mutate()` to `coaches.preferences`, removing the key on enable and stamping
 * `disable_silent_player_nudge: true` on disable.
 *
 * `.test.tsx` per LESSONS#0020 / #0038.
 */
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

interface MutateArgs {
  table: string;
  operation: string;
  data: { preferences: Record<string, unknown> };
  filters: { id: string };
}

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: (() => {
    const fn = vi.fn();
    fn.mockResolvedValue(undefined);
    return fn;
  })(),
}));

vi.mock('@/lib/api', () => ({
  mutate: mockMutate,
  query: vi.fn(),
}));

import { SilentPlayerNudgeToggle } from '@/components/settings/silent-player-nudge-toggle';

beforeEach(() => {
  cleanup();
  mockMutate.mockClear();
});

describe('SilentPlayerNudgeToggle (ticket 0062)', () => {
  it('renders with aria-checked=true when preferences has no disable_silent_player_nudge key', () => {
    render(<SilentPlayerNudgeToggle coachId="coach-1" preferences={{}} />);
    const switchEl = screen.getByRole('switch', { name: /silent-player nudge/i });
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });

  it('renders with aria-checked=false when disable_silent_player_nudge is true', () => {
    render(
      <SilentPlayerNudgeToggle
        coachId="coach-1"
        preferences={{ disable_silent_player_nudge: true }}
      />,
    );
    const switchEl = screen.getByRole('switch', { name: /silent-player nudge/i });
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
  });

  it('label copy is free of AGENTS.md banned hype words', () => {
    const { container } = render(
      <SilentPlayerNudgeToggle coachId="coach-1" preferences={{}} />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(text).not.toContain(banned);
    }
  });

  it('tapping the toggle when enabled POSTs through mutate() with disable_silent_player_nudge:true', async () => {
    render(<SilentPlayerNudgeToggle coachId="coach-1" preferences={{}} />);
    const switchEl = screen.getByRole('switch', { name: /silent-player nudge/i });
    fireEvent.click(switchEl);

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const call = (mockMutate.mock.calls as unknown as MutateArgs[][])[0][0];
    expect(call.table).toBe('coaches');
    expect(call.operation).toBe('update');
    expect(call.filters).toEqual({ id: 'coach-1' });
    expect(call.data.preferences.disable_silent_player_nudge).toBe(true);
  });

  it('tapping the toggle when disabled REMOVES the disable_silent_player_nudge key, preserving siblings', async () => {
    render(
      <SilentPlayerNudgeToggle
        coachId="coach-1"
        preferences={{ disable_silent_player_nudge: true, foo: 'bar' }}
      />,
    );
    const switchEl = screen.getByRole('switch', { name: /silent-player nudge/i });
    fireEvent.click(switchEl);

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const call = (mockMutate.mock.calls as unknown as MutateArgs[][])[0][0];
    expect(call.data.preferences.disable_silent_player_nudge).toBeUndefined();
    expect(call.data.preferences.foo).toBe('bar');
  });
});
