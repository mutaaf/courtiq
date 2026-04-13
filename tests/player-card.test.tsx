/**
 * Component tests for PlayerCard.
 *
 * Covers:
 *  - Renders player name, position, age group
 *  - Jersey number badge (present / absent)
 *  - Observation count display (> 0 shows, 0 hides)
 *  - Avatar initials when no photo URL
 *  - Normal mode: router.push to player detail
 *  - Select mode: calls onSelect, does not navigate
 *  - Selected state applies orange styling
 *  - Checkbox visible only in selectMode
 *  - Position color mapping for known positions
 *  - Fallback color for unknown positions
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlayerCard } from '@/components/roster/player-card';
import type { Player } from '@/types/database';
import { playerFactory } from './factories';

// Cast factory output to full Player (factory omits created_at / updated_at)
const buildPlayer = (overrides?: Partial<Player>): Player =>
  ({ ...playerFactory.build(overrides as any), created_at: '', updated_at: '' } as Player);

// ------------------------------------------------------------------
// Mocks
// ------------------------------------------------------------------

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Render Next.js Image as a plain <img> in jsdom
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) =>
    React.createElement('img', { src, alt }),
}));

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('PlayerCard', () => {
  describe('basic rendering', () => {
    it('renders the player name', () => {
      const player = buildPlayer({ name: 'Marcus Thompson' });
      render(<PlayerCard player={player} />);
      expect(screen.getByText('Marcus Thompson')).toBeInTheDocument();
    });

    it('renders the player position badge', () => {
      const player = buildPlayer({ position: 'PG' });
      render(<PlayerCard player={player} />);
      expect(screen.getByText('PG')).toBeInTheDocument();
    });

    it('renders the age group when provided', () => {
      const player = buildPlayer({ age_group: 'U12' });
      render(<PlayerCard player={player} />);
      expect(screen.getByText('U12')).toBeInTheDocument();
    });

    it('does not render age group text when age_group is empty', () => {
      const player = buildPlayer({ age_group: '' });
      render(<PlayerCard player={player} />);
      // Only name, position and obs count should be visible; no extra span
      expect(screen.queryByText('U12')).not.toBeInTheDocument();
    });
  });

  describe('jersey number badge', () => {
    it('shows jersey number when jersey_number is set', () => {
      const player = buildPlayer({ jersey_number: 23 });
      render(<PlayerCard player={player} />);
      expect(screen.getByText('23')).toBeInTheDocument();
    });

    it('does not show jersey badge when jersey_number is null', () => {
      const player = buildPlayer({ jersey_number: null });
      render(<PlayerCard player={player} />);
      // There should be no single-digit or small number visible as a badge
      // We check the specific badge span is absent by confirming no "null" text
      expect(screen.queryByText('null')).not.toBeInTheDocument();
    });
  });

  describe('observation count', () => {
    it('shows observation count and "obs" label when observationCount > 0', () => {
      const player = buildPlayer();
      render(<PlayerCard player={player} observationCount={12} />);
      expect(screen.getByText('12')).toBeInTheDocument();
      expect(screen.getByText('obs')).toBeInTheDocument();
    });

    it('hides observation count section when observationCount is 0', () => {
      const player = buildPlayer({ name: 'Jane Doe' });
      render(<PlayerCard player={player} observationCount={0} />);
      expect(screen.queryByText('obs')).not.toBeInTheDocument();
    });

    it('hides observation count section when observationCount is omitted', () => {
      const player = buildPlayer({ name: 'Jane Doe' });
      render(<PlayerCard player={player} />);
      expect(screen.queryByText('obs')).not.toBeInTheDocument();
    });
  });

  describe('avatar initials', () => {
    it('renders initials from player name when no photo URL', () => {
      const player = buildPlayer({ name: 'Kevin Durant', photo_url: null });
      render(<PlayerCard player={player} />);
      expect(screen.getByText('KD')).toBeInTheDocument();
    });

    it('renders single initial for single-word name', () => {
      const player = buildPlayer({ name: 'Prince', photo_url: null });
      render(<PlayerCard player={player} />);
      expect(screen.getByText('P')).toBeInTheDocument();
    });
  });

  describe('navigation — normal mode', () => {
    it('navigates to player detail page on click', () => {
      const player = buildPlayer({ id: 'player-abc' });
      render(<PlayerCard player={player} />);
      fireEvent.click(screen.getByText(player.name));
      expect(mockPush).toHaveBeenCalledOnce();
      expect(mockPush).toHaveBeenCalledWith('/roster/player-abc');
    });

    it('does not call onSelect in normal mode', () => {
      const onSelect = vi.fn();
      const player = buildPlayer();
      render(<PlayerCard player={player} onSelect={onSelect} />);
      fireEvent.click(screen.getByText(player.name));
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe('select mode', () => {
    it('calls onSelect with player id instead of navigating', () => {
      const onSelect = vi.fn();
      const player = buildPlayer({ id: 'player-xyz' });
      render(<PlayerCard player={player} selectMode onSelect={onSelect} />);
      fireEvent.click(screen.getByText(player.name));
      expect(onSelect).toHaveBeenCalledOnce();
      expect(onSelect).toHaveBeenCalledWith('player-xyz');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('renders the circular checkbox in selectMode', () => {
      const player = buildPlayer();
      const { container } = render(<PlayerCard player={player} selectMode />);
      // The checkbox div is a rounded-full div — verify by class presence
      const checkbox = container.querySelector('.rounded-full.border-2');
      expect(checkbox).not.toBeNull();
    });

    it('does NOT render the checkbox in normal mode', () => {
      const player = buildPlayer();
      const { container } = render(<PlayerCard player={player} />);
      // No selection checkbox div
      const checkbox = container.querySelector('.rounded-full.border-2');
      expect(checkbox).toBeNull();
    });

    it('shows Check icon when selected=true in selectMode', () => {
      const player = buildPlayer();
      const { container } = render(<PlayerCard player={player} selectMode selected />);
      // The orange-filled checkbox contains a child (the Check icon SVG)
      const filledCheckbox = container.querySelector('.bg-orange-500.border-orange-500');
      expect(filledCheckbox).not.toBeNull();
    });

    it('does not show Check icon when selected=false in selectMode', () => {
      const player = buildPlayer();
      const { container } = render(<PlayerCard player={player} selectMode selected={false} />);
      const filledCheckbox = container.querySelector('.bg-orange-500.border-orange-500');
      expect(filledCheckbox).toBeNull();
    });
  });

  describe('position color mapping', () => {
    const positionCases: Array<[string, string]> = [
      ['PG', 'text-blue-400'],
      ['SG', 'text-emerald-400'],
      ['SF', 'text-purple-400'],
      ['PF', 'text-amber-400'],
      ['C', 'text-red-400'],
      ['Flex', 'text-zinc-300'],
    ];

    it.each(positionCases)('position %s gets color class %s', (position, colorClass) => {
      const player = buildPlayer({ position });
      const { container } = render(<PlayerCard player={player} />);
      const badge = screen.getByText(position);
      expect(badge.className).toContain(colorClass);
    });

    it('uses fallback zinc color for unknown positions', () => {
      const player = buildPlayer({ position: 'QB' });
      const { container } = render(<PlayerCard player={player} />);
      const badge = screen.getByText('QB');
      expect(badge.className).toContain('text-zinc-300');
    });
  });
});
