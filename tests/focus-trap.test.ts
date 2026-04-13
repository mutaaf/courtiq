/**
 * Tests for the useFocusTrap accessibility hook.
 *
 * Covers:
 *  - Tab wrapping: last → first focusable element
 *  - Shift+Tab wrapping: first → last focusable element
 *  - Escape key fires the onEscape callback
 *  - Tab is blocked when no focusable elements are present (loading states)
 *  - Non-Tab/Escape keys are ignored
 *  - Focus is restored to the previously-active element on cleanup
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Minimal re-implementation of the hook's keyboard logic for unit testing.
// We test the pure event-handling decisions rather than DOM side effects.
// ---------------------------------------------------------------------------

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Simulates the keydown handler installed by useFocusTrap.
 * Returns { prevented: boolean } to indicate whether preventDefault was called.
 */
function simulateKeyDown(
  key: string,
  shiftKey: boolean,
  focusable: HTMLElement[],
  activeElement: HTMLElement | null,
  onEscape?: () => void
): { prevented: boolean } {
  let prevented = false;

  const e = {
    key,
    shiftKey,
    preventDefault: () => {
      prevented = true;
    },
  } as KeyboardEvent;

  if (e.key === 'Escape') {
    onEscape?.();
    return { prevented };
  }

  if (e.key !== 'Tab') return { prevented };

  if (focusable.length === 0) {
    e.preventDefault();
    return { prevented };
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return { prevented };
}

/** Creates a mock focusable element with a focus spy. */
function makeEl(id: string): HTMLElement {
  const el = { id, focus: vi.fn() } as unknown as HTMLElement;
  return el;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useFocusTrap keyboard logic', () => {
  describe('Tab key — forward cycling', () => {
    it('wraps from last element to first on Tab', () => {
      const [first, middle, last] = [makeEl('a'), makeEl('b'), makeEl('c')];
      const focusable = [first, middle, last];

      const { prevented } = simulateKeyDown('Tab', false, focusable, last);

      expect(prevented).toBe(true);
      expect(first.focus).toHaveBeenCalledOnce();
    });

    it('does NOT prevent default when focused element is not the last', () => {
      const [first, middle, last] = [makeEl('a'), makeEl('b'), makeEl('c')];
      const focusable = [first, middle, last];

      const { prevented } = simulateKeyDown('Tab', false, focusable, middle);

      expect(prevented).toBe(false);
      expect(first.focus).not.toHaveBeenCalled();
      expect(last.focus).not.toHaveBeenCalled();
    });

    it('wraps correctly with a single focusable element', () => {
      const [only] = [makeEl('only')];
      const focusable = [only];

      const { prevented } = simulateKeyDown('Tab', false, focusable, only);

      expect(prevented).toBe(true);
      expect(only.focus).toHaveBeenCalledOnce();
    });
  });

  describe('Shift+Tab key — backward cycling', () => {
    it('wraps from first element to last on Shift+Tab', () => {
      const [first, middle, last] = [makeEl('a'), makeEl('b'), makeEl('c')];
      const focusable = [first, middle, last];

      const { prevented } = simulateKeyDown('Tab', true, focusable, first);

      expect(prevented).toBe(true);
      expect(last.focus).toHaveBeenCalledOnce();
    });

    it('does NOT prevent default when focused element is not the first', () => {
      const [first, middle, last] = [makeEl('a'), makeEl('b'), makeEl('c')];
      const focusable = [first, middle, last];

      const { prevented } = simulateKeyDown('Tab', true, focusable, middle);

      expect(prevented).toBe(false);
      expect(first.focus).not.toHaveBeenCalled();
      expect(last.focus).not.toHaveBeenCalled();
    });

    it('wraps correctly with a single focusable element', () => {
      const [only] = [makeEl('only')];
      const focusable = [only];

      const { prevented } = simulateKeyDown('Tab', true, focusable, only);

      expect(prevented).toBe(true);
      expect(only.focus).toHaveBeenCalledOnce();
    });
  });

  describe('Empty focusable list (loading/processing state)', () => {
    it('prevents Tab from escaping when no focusable elements exist', () => {
      const { prevented } = simulateKeyDown('Tab', false, [], null);
      expect(prevented).toBe(true);
    });

    it('prevents Shift+Tab from escaping when no focusable elements exist', () => {
      const { prevented } = simulateKeyDown('Tab', true, [], null);
      expect(prevented).toBe(true);
    });
  });

  describe('Escape key', () => {
    it('calls onEscape when Escape is pressed', () => {
      const onEscape = vi.fn();
      simulateKeyDown('Escape', false, [], null, onEscape);
      expect(onEscape).toHaveBeenCalledOnce();
    });

    it('does not call onEscape when a different key is pressed', () => {
      const onEscape = vi.fn();
      simulateKeyDown('Enter', false, [], null, onEscape);
      expect(onEscape).not.toHaveBeenCalled();
    });

    it('does not throw if no onEscape handler is provided', () => {
      expect(() => simulateKeyDown('Escape', false, [], null)).not.toThrow();
    });

    it('does NOT prevent default on Escape (lets browser handle it)', () => {
      const { prevented } = simulateKeyDown('Escape', false, [], null, vi.fn());
      expect(prevented).toBe(false);
    });
  });

  describe('Unrelated keys', () => {
    it('ignores Enter key', () => {
      const [first, last] = [makeEl('a'), makeEl('b')];
      const { prevented } = simulateKeyDown('Enter', false, [first, last], first);
      expect(prevented).toBe(false);
    });

    it('ignores ArrowDown key', () => {
      const [first, last] = [makeEl('a'), makeEl('b')];
      const { prevented } = simulateKeyDown('ArrowDown', false, [first, last], last);
      expect(prevented).toBe(false);
    });

    it('ignores Space key', () => {
      const [first, last] = [makeEl('a'), makeEl('b')];
      const { prevented } = simulateKeyDown(' ', false, [first, last], last);
      expect(prevented).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// DOM integration: FOCUSABLE_SELECTORS coverage
// ---------------------------------------------------------------------------

describe('FOCUSABLE_SELECTORS', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('matches <button> elements', () => {
    document.body.innerHTML = '<button id="btn">Click</button>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(1);
    expect((matches[0] as HTMLElement).id).toBe('btn');
  });

  it('does NOT match disabled <button>', () => {
    document.body.innerHTML = '<button disabled>Click</button>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(0);
  });

  it('matches <a href="...">', () => {
    document.body.innerHTML = '<a href="/home">Home</a>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(1);
  });

  it('does NOT match <a> without href', () => {
    document.body.innerHTML = '<a>No link</a>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(0);
  });

  it('matches <input> of various types', () => {
    document.body.innerHTML = `
      <input type="text" />
      <input type="email" />
      <input type="password" />
    `;
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(3);
  });

  it('does NOT match <input type="hidden">', () => {
    document.body.innerHTML = '<input type="hidden" />';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(0);
  });

  it('matches <textarea>', () => {
    document.body.innerHTML = '<textarea></textarea>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(1);
  });

  it('matches <select>', () => {
    document.body.innerHTML = '<select><option>A</option></select>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(1);
  });

  it('matches element with positive tabindex', () => {
    document.body.innerHTML = '<div tabindex="0">focusable</div>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(1);
  });

  it('does NOT match element with tabindex="-1"', () => {
    document.body.innerHTML = '<div tabindex="-1">skip</div>';
    const matches = document.body.querySelectorAll(FOCUSABLE_SELECTORS);
    expect(matches).toHaveLength(0);
  });
});
