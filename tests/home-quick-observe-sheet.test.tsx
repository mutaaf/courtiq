/**
 * Tests for HomeQuickObserveSheet
 *
 * Covers:
 *  - Renders dialog with correct ARIA attributes
 *  - Shows player name (with jersey number) and focus category
 *  - Renders sentiment toggle buttons
 *  - Renders positive template chips by default
 *  - Switching to needs-work shows needs-work templates
 *  - Selecting a template + clicking Save calls mutate() with correct shape
 *  - Free-text entry enables Save button and uses text as observation content
 *  - Shows error banner when mutate() rejects; does not call onClose
 *  - X button calls onClose; backdrop calls onClose; Escape key calls onClose
 *  - onSaved + onClose called after successful save
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HomeQuickObserveSheet } from '@/components/home/home-quick-observe-sheet';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockMutate = vi.fn();
vi.mock('@/lib/api', () => ({
  mutate: (...args: unknown[]) => mockMutate(...args),
  query: vi.fn().mockResolvedValue([]),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

const onClose = vi.fn();
const onSaved = vi.fn();

const DEFAULT_PROPS = {
  player: { id: 'player-1', name: 'Marcus Johnson', jersey_number: 12 as number | null },
  focusCategory: null as string | null,
  sportSlug: null as string | null,
  teamId: 'team-1',
  orgId: 'org-1',
  coachId: 'coach-1',
  sessionId: 'session-1',
  onClose,
  onSaved,
};

function renderSheet(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  const client = makeClient();
  return {
    props,
    client,
    ...render(
      <QueryClientProvider client={client}>
        <HomeQuickObserveSheet {...props} />
      </QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  mockMutate.mockReset();
  mockMutate.mockResolvedValue({ data: null, error: null });
  onClose.mockReset();
  onSaved.mockReset();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HomeQuickObserveSheet', () => {
  describe('accessibility and structure', () => {
    it('renders a dialog with correct ARIA attributes', () => {
      renderSheet();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Quick observation for Marcus Johnson');
    });

    it('shows jersey number and player name in the header', () => {
      renderSheet();
      expect(screen.getByText(/#12 Marcus Johnson/)).toBeInTheDocument();
    });

    it('omits jersey number when null', () => {
      renderSheet({ player: { id: 'p1', name: 'Alex Lee', jersey_number: null } });
      expect(screen.getByText('Alex Lee')).toBeInTheDocument();
      expect(screen.queryByText(/#/)).not.toBeInTheDocument();
    });

    it('shows focus category when provided', () => {
      renderSheet({ focusCategory: 'shooting' });
      expect(screen.getByText(/focus:/i)).toBeInTheDocument();
    });
  });

  describe('sentiment toggle', () => {
    it('renders both sentiment toggle buttons', () => {
      renderSheet();
      expect(screen.getByRole('button', { name: /👍 Positive/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /👎 Needs Work/i })).toBeInTheDocument();
    });

    it('shows positive templates by default', () => {
      renderSheet();
      // At least one positive template should be present
      const templates = screen.getAllByRole('button');
      const templateButtons = templates.filter(
        (b) => !['👍 Positive', '👎 Needs Work', 'Close quick observation', 'Save Observation'].some(
          (label) => b.textContent?.includes(label.replace(/👍|👎/g, '').trim()) || b.getAttribute('aria-label') === label
        )
      );
      expect(templateButtons.length).toBeGreaterThan(0);
    });
  });

  describe('saving with a template', () => {
    it('calls mutate() with correct shape when a template is selected and Save is clicked', async () => {
      renderSheet();
      // Click first template chip (find any non-sentiment/close/save button)
      const allButtons = screen.getAllByRole('button');
      const templateBtn = allButtons.find(
        (b) => b.textContent && !['👍 Positive', '👎 Needs Work', 'Save Observation'].includes(b.textContent.trim()) &&
               b.getAttribute('aria-label') !== 'Close quick observation'
      );
      expect(templateBtn).toBeDefined();

      await act(async () => { fireEvent.click(templateBtn!); });

      const saveBtn = screen.getByRole('button', { name: /save observation/i });
      await act(async () => { fireEvent.click(saveBtn); });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const call = mockMutate.mock.calls[0][0];
      expect(call.table).toBe('observations');
      expect(call.operation).toBe('insert');
      expect(call.data.player_id).toBe('player-1');
      expect(call.data.session_id).toBe('session-1');
      expect(call.data.team_id).toBe('team-1');
      expect(call.data.org_id).toBe('org-1');
      expect(call.data.source).toBe('template');
      expect(call.data.sentiment).toBe('positive');
    });
  });

  describe('saving with free text', () => {
    it('enables Save button and uses typed text as observation text', async () => {
      renderSheet();
      const textarea = screen.getByPlaceholderText(/add a specific note/i);
      await act(async () => { fireEvent.change(textarea, { target: { value: 'Good hustle today' } }); });

      const saveBtn = screen.getByRole('button', { name: /save observation/i });
      expect(saveBtn).not.toBeDisabled();

      await act(async () => { fireEvent.click(saveBtn); });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      expect(mockMutate.mock.calls[0][0].data.text).toBe('Good hustle today');
    });

    it('needs-work sentiment flows through on save', async () => {
      renderSheet();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /👎 Needs Work/i }));
      });
      const textarea = screen.getByPlaceholderText(/add a specific note/i);
      await act(async () => { fireEvent.change(textarea, { target: { value: 'Needs to work on defense' } }); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save observation/i })); });

      expect(mockMutate.mock.calls[0][0].data.sentiment).toBe('needs-work');
    });
  });

  describe('error handling', () => {
    it('shows an error banner when mutate() rejects; does not call onClose', async () => {
      mockMutate.mockRejectedValueOnce(new Error('Network error'));
      renderSheet();
      const textarea = screen.getByPlaceholderText(/add a specific note/i);
      await act(async () => { fireEvent.change(textarea, { target: { value: 'Some note' } }); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save observation/i })); });

      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('post-save callbacks', () => {
    it('calls onSaved and onClose after successful save', async () => {
      renderSheet();
      const textarea = screen.getByPlaceholderText(/add a specific note/i);
      await act(async () => { fireEvent.change(textarea, { target: { value: 'Great practice' } }); });
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: /save observation/i })); });

      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('dismiss behaviour', () => {
    it('calls onClose when the X button is clicked', () => {
      renderSheet();
      fireEvent.click(screen.getByRole('button', { name: /close quick observation/i }));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', () => {
      renderSheet();
      fireEvent.click(screen.getByRole('presentation'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      renderSheet();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
