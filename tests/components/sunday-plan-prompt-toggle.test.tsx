/**
 * Ticket 0058 — component test for the Sunday-plan-prompt opt-out toggle row
 * on /settings/profile.
 *
 * Mirrors the practice-reminder toggle row's shape. The toggle reads
 * `preferences.disable_planning_prompts` and writes through `mutate()` to
 * `coaches.preferences`, removing the key on enable and stamping
 * `disable_planning_prompts: true` on disable (same on/off encoding as the
 * weekly-digest + practice-reminder toggles).
 *
 * `.test.ts(x)` per LESSONS#0038.
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
  // The hoisted factory needs an explicit any[] arg list so TS infers a
  // standard `Mock<unknown[], any>` signature, not the deduced empty-tuple
  // signature that makes `mock.calls[0]` of type `[]`.
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

import { SundayPlanPromptToggle } from '@/components/settings/sunday-plan-prompt-toggle';

beforeEach(() => {
  cleanup();
  mockMutate.mockClear();
});

describe('SundayPlanPromptToggle (ticket 0058)', () => {
  it('renders with aria-checked=true when preferences has no disable_planning_prompts key', () => {
    render(<SundayPlanPromptToggle coachId="coach-1" preferences={{}} />);
    const switchEl = screen.getByRole('switch', { name: /sunday planning prompt/i });
    expect(switchEl).toHaveAttribute('aria-checked', 'true');
  });

  it('renders with aria-checked=false when disable_planning_prompts is true', () => {
    render(
      <SundayPlanPromptToggle
        coachId="coach-1"
        preferences={{ disable_planning_prompts: true }}
      />,
    );
    const switchEl = screen.getByRole('switch', { name: /sunday planning prompt/i });
    expect(switchEl).toHaveAttribute('aria-checked', 'false');
  });

  it('label copy is free of AGENTS.md banned hype words', () => {
    const { container } = render(
      <SundayPlanPromptToggle coachId="coach-1" preferences={{}} />,
    );
    const text = (container.textContent ?? '').toLowerCase();
    for (const banned of ['journey', 'amazing', 'exciting', 'elevate', 'empower', 'synergy']) {
      expect(text).not.toContain(banned);
    }
  });

  it('tapping the toggle when enabled POSTs through mutate() with disable_planning_prompts:true', async () => {
    render(<SundayPlanPromptToggle coachId="coach-1" preferences={{}} />);
    const switchEl = screen.getByRole('switch', { name: /sunday planning prompt/i });
    fireEvent.click(switchEl);

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const call = (mockMutate.mock.calls as unknown as MutateArgs[][])[0][0];
    expect(call.table).toBe('coaches');
    expect(call.operation).toBe('update');
    expect(call.filters).toEqual({ id: 'coach-1' });
    expect(call.data.preferences.disable_planning_prompts).toBe(true);
  });

  it('tapping the toggle when disabled REMOVES the disable_planning_prompts key', async () => {
    render(
      <SundayPlanPromptToggle
        coachId="coach-1"
        preferences={{ disable_planning_prompts: true, foo: 'bar' }}
      />,
    );
    const switchEl = screen.getByRole('switch', { name: /sunday planning prompt/i });
    fireEvent.click(switchEl);

    await waitFor(() => expect(mockMutate).toHaveBeenCalledTimes(1));
    const call = (mockMutate.mock.calls as unknown as MutateArgs[][])[0][0];
    expect(call.data.preferences.disable_planning_prompts).toBeUndefined();
    expect(call.data.preferences.foo).toBe('bar');
  });
});
