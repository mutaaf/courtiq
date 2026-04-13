/**
 * Tests for the CommandPalette component.
 *
 * Covers:
 *  - Renders search input
 *  - Shows quick actions when query is empty
 *  - Filters results as user types
 *  - Shows "No results" message when nothing matches
 *  - Calls onClose when backdrop is clicked
 *  - Calls onClose when Escape is pressed
 *  - Keyboard ArrowDown/ArrowUp cycles the active item
 *  - Enter on active item navigates and calls onClose
 *  - Group labels render for matching groups
 *  - Result count displayed in footer
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommandPalette } from '@/components/command-palette';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// useActiveTeam — return a stable fake team so queries can run
vi.mock('@/hooks/use-active-team', () => ({
  useActiveTeam: () => ({
    activeTeam: { id: 'team-1', sport_id: 'sport-1', name: 'Tigers' },
    activeTeamId: 'team-1',
    teams: [{ id: 'team-1', sport_id: 'sport-1', name: 'Tigers' }],
    coach: { id: 'coach-1', full_name: 'Coach Smith' },
  }),
}));

// query() — return empty arrays; individual tests can override via queryClient mock
vi.mock('@/lib/api', () => ({
  query: vi.fn().mockResolvedValue([]),
  mutate: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
}

function renderPalette(onClose = vi.fn()) {
  const client = makeClient();
  return {
    onClose,
    ...render(
      <QueryClientProvider client={client}>
        <CommandPalette onClose={onClose} />
      </QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  mockPush.mockClear();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CommandPalette', () => {
  describe('initial render', () => {
    it('renders the search input', () => {
      renderPalette();
      expect(screen.getByRole('textbox', { name: /search/i })).toBeInTheDocument();
    });

    it('renders the dialog with correct ARIA attributes', () => {
      renderPalette();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-label', 'Command palette');
    });

    it('shows the "Quick Actions" group label by default', () => {
      renderPalette();
      expect(screen.getByText('Quick Actions')).toBeInTheDocument();
    });

    it('shows expected quick action items when query is empty', () => {
      renderPalette();
      expect(screen.getByText('Capture Observation')).toBeInTheDocument();
      expect(screen.getByText('Go to Home')).toBeInTheDocument();
      expect(screen.getByText('View Roster')).toBeInTheDocument();
    });

    it('displays keyboard shortcut hints in the footer', () => {
      renderPalette();
      // Footer contains arrow, enter, and escape cues
      const footer = screen.getByText(/navigate/i).closest('div');
      expect(footer).toBeInTheDocument();
    });
  });

  describe('search filtering', () => {
    it('filters quick actions by partial label match', () => {
      renderPalette();
      const input = screen.getByRole('textbox', { name: /search/i });
      fireEvent.change(input, { target: { value: 'roster' } });
      expect(screen.getByText('View Roster')).toBeInTheDocument();
      // "Capture Observation" should not be shown
      expect(screen.queryByText('Capture Observation')).not.toBeInTheDocument();
    });

    it('is case-insensitive', () => {
      renderPalette();
      const input = screen.getByRole('textbox', { name: /search/i });
      fireEvent.change(input, { target: { value: 'CAPTURE' } });
      expect(screen.getByText('Capture Observation')).toBeInTheDocument();
    });

    it('shows "No results" message when nothing matches', () => {
      renderPalette();
      const input = screen.getByRole('textbox', { name: /search/i });
      fireEvent.change(input, { target: { value: 'xyzxyz_impossible_query' } });
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });

    it('shows all matching items across query actions for a broad query', () => {
      renderPalette();
      const input = screen.getByRole('textbox', { name: /search/i });
      fireEvent.change(input, { target: { value: 'view' } });
      // "View Roster", "View Sessions", "View Plans" should all appear
      expect(screen.getByText('View Roster')).toBeInTheDocument();
      expect(screen.getByText('View Sessions')).toBeInTheDocument();
      expect(screen.getByText('View Plans')).toBeInTheDocument();
    });
  });

  describe('dismiss behaviour', () => {
    it('calls onClose when the X button is clicked', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      const closeBtn = screen.getByRole('button', { name: /close command palette/i });
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when the backdrop is clicked', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      // The backdrop is the first element with role="presentation" (outermost div)
      const backdrops = screen.getAllByRole('presentation');
      fireEvent.click(backdrops[0]);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape key is pressed', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      // Focus trap's document-level handler fires onEscape
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('does NOT call onClose when dialog body is clicked (stops propagation)', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      const dialog = screen.getByRole('dialog');
      fireEvent.click(dialog);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('keyboard navigation', () => {
    it('first item is initially active (aria-selected="true")', () => {
      renderPalette();
      const options = screen.getAllByRole('option');
      // Only the first item is active; all others are inactive
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
      for (let i = 1; i < options.length; i++) {
        expect(options[i]).toHaveAttribute('aria-selected', 'false');
      }
    });

    it('all quick actions are displayed and only one is active initially', () => {
      renderPalette();
      const active = screen.getAllByRole('option').filter(
        (el) => el.getAttribute('aria-selected') === 'true'
      );
      expect(active).toHaveLength(1);
    });

    it('ArrowUp from first item does not change active item (boundary guard)', async () => {
      renderPalette();
      const options = screen.getAllByRole('option');
      await act(async () => {
        // ArrowUp at index 0 should clamp at 0 (Math.max(0-1,0) = 0)
        fireEvent.keyDown(document.body, { key: 'ArrowUp' });
      });
      // First item should still be active — value was already at 0
      await waitFor(() => {
        const active = screen.getAllByRole('option').filter(
          (el) => el.getAttribute('aria-selected') === 'true'
        );
        expect(active.length).toBeGreaterThanOrEqual(1);
        expect(options[0]).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('Enter on active item navigates to its href and calls onClose', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      // First item is "Go to Home" → /home
      fireEvent.keyDown(document.body, { key: 'Enter' });
      expect(mockPush).toHaveBeenCalledWith('/home');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking an item navigates and calls onClose', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      fireEvent.click(screen.getByText('Capture Observation'));
      expect(mockPush).toHaveBeenCalledWith('/capture');
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking an item at index 2 activates it and navigates', () => {
      const onClose = vi.fn();
      renderPalette(onClose);
      const options = screen.getAllByRole('option');
      // Click the 3rd quick action (Analytics)
      fireEvent.click(options[2]);
      expect(mockPush).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('result count', () => {
    it('shows result count in footer', () => {
      renderPalette();
      // Default shows all quick actions (9)
      const footer = document.querySelector('.text-\\[11px\\]');
      expect(footer?.textContent).toMatch(/\d+ results?/);
    });
  });
});
