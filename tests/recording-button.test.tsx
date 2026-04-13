/**
 * Component tests for RecordingButton.
 *
 * Covers:
 *  - Correct label text (Tap to record / Tap to stop)
 *  - aria-label and aria-pressed reflect recording state
 *  - Calls onToggle on click
 *  - Does not call onToggle when disabled
 *  - Haptic feedback (navigator.vibrate) with correct pattern
 *  - Haptic skipped when navigator.vibrate is unavailable
 *  - Timer visible (opacity-100) only when recording
 *  - Timer resets to 00:00 when recording starts
 *  - Timer counts up while recording (fake timers)
 *  - Timer stops and resets when recording stops
 *  - Pulse rings rendered only while recording
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { RecordingButton } from '@/components/capture/recording-button';

// ------------------------------------------------------------------
// Setup
// ------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
  // Default: vibrate is available
  Object.defineProperty(navigator, 'vibrate', {
    value: vi.fn(),
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe('RecordingButton', () => {
  describe('label text', () => {
    it('shows "Tap to record" when not recording', () => {
      const onToggle = vi.fn();
      render(<RecordingButton isRecording={false} onToggle={onToggle} />);
      expect(screen.getByText('Tap to record')).toBeInTheDocument();
    });

    it('shows "Tap to stop" when recording', () => {
      const onToggle = vi.fn();
      render(<RecordingButton isRecording onToggle={onToggle} />);
      expect(screen.getByText('Tap to stop')).toBeInTheDocument();
    });
  });

  describe('accessibility attributes', () => {
    it('has aria-label "Start recording" when not recording', () => {
      render(<RecordingButton isRecording={false} onToggle={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-label', 'Start recording');
    });

    it('has aria-label "Stop recording" when recording', () => {
      render(<RecordingButton isRecording onToggle={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-label', 'Stop recording');
    });

    it('has aria-pressed=false when not recording', () => {
      render(<RecordingButton isRecording={false} onToggle={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-pressed', 'false');
    });

    it('has aria-pressed=true when recording', () => {
      render(<RecordingButton isRecording onToggle={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('click interaction', () => {
    it('calls onToggle when clicked', () => {
      const onToggle = vi.fn();
      render(<RecordingButton isRecording={false} onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('button'));
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('does NOT call onToggle when disabled', () => {
      const onToggle = vi.fn();
      render(<RecordingButton isRecording={false} onToggle={onToggle} disabled />);
      fireEvent.click(screen.getByRole('button'));
      expect(onToggle).not.toHaveBeenCalled();
    });

    it('button element is marked disabled when disabled prop is true', () => {
      render(<RecordingButton isRecording={false} onToggle={vi.fn()} disabled />);
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('haptic feedback', () => {
    it('calls navigator.vibrate([100]) when starting to record (not recording → click)', () => {
      const vibrateSpy = vi.spyOn(navigator, 'vibrate');
      const onToggle = vi.fn();
      render(<RecordingButton isRecording={false} onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('button'));
      expect(vibrateSpy).toHaveBeenCalledWith([100]);
    });

    it('calls navigator.vibrate([50, 30, 50]) when stopping recording (recording → click)', () => {
      const vibrateSpy = vi.spyOn(navigator, 'vibrate');
      const onToggle = vi.fn();
      render(<RecordingButton isRecording onToggle={onToggle} />);
      fireEvent.click(screen.getByRole('button'));
      expect(vibrateSpy).toHaveBeenCalledWith([50, 30, 50]);
    });

    it('skips vibrate when navigator.vibrate is not available', () => {
      // Remove vibrate API
      Object.defineProperty(navigator, 'vibrate', {
        value: undefined,
        writable: true,
        configurable: true,
      });
      const onToggle = vi.fn();
      // Should not throw
      expect(() => {
        render(<RecordingButton isRecording={false} onToggle={onToggle} />);
        fireEvent.click(screen.getByRole('button'));
      }).not.toThrow();
      // onToggle should still be called
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('skips vibrate when disabled', () => {
      const vibrateSpy = vi.spyOn(navigator, 'vibrate');
      render(<RecordingButton isRecording={false} onToggle={vi.fn()} disabled />);
      fireEvent.click(screen.getByRole('button'));
      expect(vibrateSpy).not.toHaveBeenCalled();
    });
  });

  describe('timer display', () => {
    it('timer div is hidden (opacity-0) when not recording', () => {
      const { container } = render(<RecordingButton isRecording={false} onToggle={vi.fn()} />);
      const timerDiv = container.querySelector('[aria-live="polite"]');
      expect(timerDiv?.className).toContain('opacity-0');
    });

    it('timer div is visible (opacity-100) when recording', () => {
      const { container } = render(<RecordingButton isRecording onToggle={vi.fn()} />);
      const timerDiv = container.querySelector('[aria-live="polite"]');
      expect(timerDiv?.className).toContain('opacity-100');
    });

    it('shows 00:00 immediately when recording starts', () => {
      render(<RecordingButton isRecording onToggle={vi.fn()} />);
      expect(screen.getByText('00:00')).toBeInTheDocument();
    });

    it('increments timer each second while recording', () => {
      render(<RecordingButton isRecording onToggle={vi.fn()} />);
      expect(screen.getByText('00:00')).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(3000); });
      expect(screen.getByText('00:03')).toBeInTheDocument();
    });

    it('shows minutes correctly after 60 seconds', () => {
      render(<RecordingButton isRecording onToggle={vi.fn()} />);
      act(() => { vi.advanceTimersByTime(65000); });
      expect(screen.getByText('01:05')).toBeInTheDocument();
    });

    it('timer is empty string when not recording', () => {
      const { container } = render(<RecordingButton isRecording={false} onToggle={vi.fn()} />);
      const timerDiv = container.querySelector('[aria-live="polite"]');
      expect(timerDiv?.textContent).toBe('');
    });
  });

  describe('pulse rings', () => {
    it('renders animate-ping ring when recording', () => {
      const { container } = render(<RecordingButton isRecording onToggle={vi.fn()} />);
      const pingRing = container.querySelector('.animate-ping');
      expect(pingRing).not.toBeNull();
    });

    it('renders animate-pulse ring when recording', () => {
      const { container } = render(<RecordingButton isRecording onToggle={vi.fn()} />);
      const pulseRing = container.querySelector('.animate-pulse');
      expect(pulseRing).not.toBeNull();
    });

    it('does NOT render pulse rings when not recording', () => {
      const { container } = render(<RecordingButton isRecording={false} onToggle={vi.fn()} />);
      expect(container.querySelector('.animate-ping')).toBeNull();
      expect(container.querySelector('.animate-pulse')).toBeNull();
    });
  });

  describe('button color states', () => {
    it('uses red background when recording', () => {
      const { container } = render(<RecordingButton isRecording onToggle={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-red-500');
    });

    it('uses orange background when not recording', () => {
      render(<RecordingButton isRecording={false} onToggle={vi.fn()} />);
      const btn = screen.getByRole('button');
      expect(btn.className).toContain('bg-orange-500');
    });
  });
});
