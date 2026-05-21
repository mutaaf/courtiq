/**
 * Tests for QuickObserveModal
 *
 * Covers:
 *  - Renders dialog with correct ARIA attributes
 *  - Shows player name in the header
 *  - Renders positive and needs-work template buttons
 *  - Tapping a positive template calls mutate() with correct shape
 *    (player_id, session_id, sentiment: 'positive', source: 'template')
 *  - Tapping a needs-work template calls mutate() with sentiment: 'needs-work'
 *  - Shows error banner when mutate() rejects
 *  - Calling onClose via X button
 *  - Calling onClose when backdrop is clicked
 *  - Escape key fires onClose (via useFocusTrap)
 *  - "Voice or detailed note" link has correct href (escape hatch)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { QuickObserveModal } from '@/components/home/quick-observe-modal';

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
  player: { id: 'player-1', name: 'Marcus Johnson' },
  teamId: 'team-1',
  coachId: 'coach-1',
  sessionId: 'session-1',
  sportId: null as string | null,
  onClose,
  onSaved,
};

function renderModal(overrides: Partial<typeof DEFAULT_PROPS> = {}) {
  const props = { ...DEFAULT_PROPS, ...overrides };
  const client = makeClient();
  return {
    props,
    client,
    ...render(
      <QueryClientProvider client={client}>
        <QuickObserveModal {...props} />
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

describe('QuickObserveModal', () => {
  describe('accessibility and structure', () => {
    it('renders a dialog with correct ARIA attributes', () => {
      renderModal();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Quick observe Marcus Johnson');
    });

    it('shows the player name in the header', () => {
      renderModal();
      expect(screen.getByText('Marcus Johnson')).toBeInTheDocument();
    });

    it('shows first name in the positive section heading', () => {
      renderModal();
      expect(screen.getByText(/great job, Marcus/i)).toBeInTheDocument();
    });
  });

  describe('template rendering', () => {
    it('renders positive observation template buttons', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /great shooting form/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /outstanding hustle/i })).toBeInTheDocument();
    });

    it('renders needs-work observation template buttons', () => {
      renderModal();
      expect(screen.getByRole('button', { name: /shooting needs work/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /needs more effort/i })).toBeInTheDocument();
    });
  });

  describe('saving a positive observation', () => {
    it('calls mutate() with correct shape when a positive template is tapped', async () => {
      renderModal();
      const btn = screen.getByRole('button', { name: /great shooting form/i });

      await act(async () => {
        fireEvent.click(btn);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const call = mockMutate.mock.calls[0][0];
      expect(call.table).toBe('observations');
      expect(call.operation).toBe('insert');
      expect(call.data.player_id).toBe('player-1');
      expect(call.data.session_id).toBe('session-1');
      expect(call.data.coach_id).toBe('coach-1');
      expect(call.data.team_id).toBe('team-1');
      expect(call.data.sentiment).toBe('positive');
      expect(call.data.source).toBe('template');
      expect(call.data.ai_parsed).toBe(false);
    });

    it('calls onClose and onSaved after successful save', async () => {
      renderModal();
      const btn = screen.getByRole('button', { name: /great shooting form/i });

      await act(async () => {
        fireEvent.click(btn);
      });

      // onSaved/onClose fire after a real 600ms delay inside the component
      await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1), { timeout: 1500 });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('saving a needs-work observation', () => {
    it('calls mutate() with sentiment: needs-work', async () => {
      renderModal();
      const btn = screen.getByRole('button', { name: /needs more effort/i });

      await act(async () => {
        fireEvent.click(btn);
      });

      expect(mockMutate).toHaveBeenCalledTimes(1);
      const call = mockMutate.mock.calls[0][0];
      expect(call.data.sentiment).toBe('needs-work');
      expect(call.data.source).toBe('template');
    });
  });

  describe('error handling', () => {
    it('shows an error banner when mutate() rejects', async () => {
      mockMutate.mockRejectedValueOnce(new Error('Network error'));
      renderModal();
      const btn = screen.getByRole('button', { name: /great shooting form/i });

      await act(async () => {
        fireEvent.click(btn);
      });

      expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('dismiss behaviour', () => {
    it('calls onClose when the X button is clicked', () => {
      renderModal();
      const closeBtn = screen.getByRole('button', { name: /close quick observe/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', () => {
      renderModal();
      const backdrop = screen.getByRole('presentation');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed (useFocusTrap)', () => {
      renderModal();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('escape hatch', () => {
    it('renders the "Voice or detailed note" link with the correct href', () => {
      renderModal();
      const link = screen.getByRole('link', { name: /voice or detailed note/i });
      expect(link).toHaveAttribute(
        'href',
        '/capture?sessionId=session-1&playerId=player-1&player=Marcus%20Johnson'
      );
    });
  });
});
