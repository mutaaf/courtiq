/**
 * Component tests for the roster page's practice-focus-mode behaviour.
 *
 * Covers:
 *  - Practice banner visible when practiceActive && !selectMode
 *  - Practice banner hidden when practice is inactive
 *  - Tapping a player card in practice mode opens the PlayerFocusEntry sheet
 *  - onSwitchPlayer cycles to the next player in sorted order and wraps around
 *  - Closing the sheet via onClose clears focusedPlayer
 *  - Normal mode: navigates to player detail (no sheet)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RosterPage from '@/app/(dashboard)/roster/page';
import { playerFactory } from './factories';
import type { Player } from '@/types/database';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const PLAYERS: Player[] = [
  { ...playerFactory.build({ name: 'Alice Smith',   id: 'p-alice', team_id: 'team-1', position: 'PG' }), created_at: '', updated_at: '' } as Player,
  { ...playerFactory.build({ name: 'Bob Johnson',   id: 'p-bob',   team_id: 'team-1', position: 'SG' }), created_at: '', updated_at: '' } as Player,
  { ...playerFactory.build({ name: 'Carlos Rivera', id: 'p-carlos', team_id: 'team-1', position: 'SF' }), created_at: '', updated_at: '' } as Player,
];

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}));

vi.mock('@/hooks/use-active-team', () => ({
  useActiveTeam: () => ({
    activeTeam: { id: 'team-1', sport_id: 'basketball', name: 'Tigers', org_id: 'org-1' },
    activeTeamId: 'team-1',
    coach: { id: 'coach-1', full_name: 'Coach Smith' },
  }),
}));

vi.mock('@/lib/api', () => ({
  query: vi.fn((params: { table: string }) => {
    if (params.table === 'players') return Promise.resolve(PLAYERS);
    if (params.table === 'observations') return Promise.resolve([]);
    return Promise.resolve([]);
  }),
  mutate: vi.fn().mockResolvedValue(null),
}));

// Mock fetch for /api/team-momentum and /api/player-availability
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ players: [], availability: {} }),
} as Response);

// Mutable store state — tests can flip practiceActive
const mockStoreState = vi.hoisted(() => ({
  practiceActive: false,
  practiceSessionId: null as string | null,
}));
vi.mock('@/lib/store', () => ({
  useAppStore: (selector: (s: typeof mockStoreState) => unknown) =>
    selector(mockStoreState),
}));

// Heavy layout components not under test
vi.mock('@/components/ui/pull-to-refresh', () => ({
  PullToRefresh: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/roster/parent-engagement-panel', () => ({
  ParentEngagementPanel: () => null,
}));
vi.mock('@/components/roster/team-attendance-panel', () => ({
  TeamAttendancePanel: () => null,
}));
vi.mock('@/components/roster/bulk-actions-bar', () => ({
  BulkActionsBar: () => null,
}));
vi.mock('@/components/roster/player-availability-modal', () => ({
  PlayerAvailabilityModal: () => null,
}));

// Stub PlayerFocusEntry so we can verify which player is focused and click Switch/Close
vi.mock('@/components/observations/PlayerFocusEntry', () => ({
  PlayerFocusEntry: ({ player, onSwitchPlayer, onClose }: {
    player: { name: string };
    onSwitchPlayer?: () => void;
    onClose?: () => void;
  }) => (
    <div data-testid="player-focus-entry">
      <span data-testid="focused-name">{player.name}</span>
      {onSwitchPlayer && (
        <button onClick={onSwitchPlayer} data-testid="switch-player">
          Switch
        </button>
      )}
      {onClose && (
        <button onClick={onClose} data-testid="close-focus">
          Close
        </button>
      )}
    </div>
  ),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function renderRoster() {
  const client = makeClient();
  return render(
    <QueryClientProvider client={client}>
      <RosterPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  mockPush.mockClear();
  mockStoreState.practiceActive = false;
  mockStoreState.practiceSessionId = null;
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Roster — practice focus mode', () => {
  describe('practice banner', () => {
    it('shows "Practice is live" banner when practiceActive && !selectMode', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();
      expect(await screen.findByText('Practice is live')).toBeInTheDocument();
    });

    it('does NOT show the banner when practice is inactive', async () => {
      mockStoreState.practiceActive = false;
      renderRoster();
      await screen.findByText('Alice Smith');
      expect(screen.queryByText('Practice is live')).not.toBeInTheDocument();
    });
  });

  describe('bottom sheet — open / close', () => {
    it('opens PlayerFocusEntry sheet when a player card is tapped in practice mode', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();

      fireEvent.click(await screen.findByText('Alice Smith'));

      expect(await screen.findByTestId('player-focus-entry')).toBeInTheDocument();
      expect(screen.getByTestId('focused-name')).toHaveTextContent('Alice Smith');
    });

    it('does NOT navigate to player detail when practice mode is active', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();

      fireEvent.click(await screen.findByText('Alice Smith'));

      expect(mockPush).not.toHaveBeenCalled();
    });

    it('closes the sheet when onClose is called', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();

      fireEvent.click(await screen.findByText('Alice Smith'));
      expect(await screen.findByTestId('player-focus-entry')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('close-focus'));
      await waitFor(() => {
        expect(screen.queryByTestId('player-focus-entry')).not.toBeInTheDocument();
      });
    });

    it('closes the sheet when the backdrop overlay is clicked', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();

      fireEvent.click(await screen.findByText('Alice Smith'));
      expect(await screen.findByTestId('player-focus-entry')).toBeInTheDocument();

      const backdrop = screen.getByRole('dialog');
      fireEvent.click(backdrop);
      await waitFor(() => {
        expect(screen.queryByTestId('player-focus-entry')).not.toBeInTheDocument();
      });
    });
  });

  describe('onSwitchPlayer cycling', () => {
    it('advances to the next player in sorted order on Switch', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();

      fireEvent.click(await screen.findByText('Alice Smith'));
      expect(await screen.findByTestId('focused-name')).toHaveTextContent('Alice Smith');

      fireEvent.click(screen.getByTestId('switch-player'));
      await waitFor(() => {
        expect(screen.getByTestId('focused-name')).toHaveTextContent('Bob Johnson');
      });

      fireEvent.click(screen.getByTestId('switch-player'));
      await waitFor(() => {
        expect(screen.getByTestId('focused-name')).toHaveTextContent('Carlos Rivera');
      });
    });

    it('wraps from the last player back to the first', async () => {
      mockStoreState.practiceActive = true;
      mockStoreState.practiceSessionId = 'sess-1';
      renderRoster();

      fireEvent.click(await screen.findByText('Carlos Rivera'));
      expect(await screen.findByTestId('focused-name')).toHaveTextContent('Carlos Rivera');

      fireEvent.click(screen.getByTestId('switch-player'));
      await waitFor(() => {
        expect(screen.getByTestId('focused-name')).toHaveTextContent('Alice Smith');
      });
    });
  });

  describe('normal mode (practiceActive=false)', () => {
    it('navigates to player detail when practice is inactive', async () => {
      mockStoreState.practiceActive = false;
      renderRoster();

      fireEvent.click(await screen.findByText('Alice Smith'));
      expect(mockPush).toHaveBeenCalledWith('/roster/p-alice');
      expect(screen.queryByTestId('player-focus-entry')).not.toBeInTheDocument();
    });
  });
});
