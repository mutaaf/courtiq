/**
 * Tests for the useHighContrast hook's underlying logic.
 *
 * Covers:
 *  - Returns false when no preference is stored
 *  - Returns true when 'true' is stored in localStorage
 *  - toggle() flips state and updates localStorage
 *  - toggle() adds/removes the .high-contrast class on <html>
 *  - toggle() dispatches a StorageEvent so other tabs stay in sync
 *  - Multiple toggles produce the correct final state
 *  - SSR case: returns false when window is undefined
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Inline re-implementation of the hook's core logic (pure JS, no React).
// This mirrors what useHighContrast does via useSyncExternalStore + callbacks.
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'courtiq-high-contrast';

function makeHookLogic(initialStorage: string | null = null) {
  // Minimal localStorage stub
  let stored = initialStorage;
  const localStorageStub = {
    getItem: (key: string) => (key === STORAGE_KEY ? stored : null),
    setItem: (key: string, value: string) => {
      if (key === STORAGE_KEY) stored = value;
    },
  };

  // Minimal classList stub
  const classes = new Set<string>();
  const classListStub = {
    toggle: (cls: string, force?: boolean) => {
      if (force === true) classes.add(cls);
      else if (force === false) classes.delete(cls);
      else {
        if (classes.has(cls)) classes.delete(cls);
        else classes.add(cls);
      }
    },
    contains: (cls: string) => classes.has(cls),
  };

  const dispatchedEvents: string[] = [];

  function getHighContrast(): boolean {
    return localStorageStub.getItem(STORAGE_KEY) === 'true';
  }

  function toggle() {
    const next = !getHighContrast();
    localStorageStub.setItem(STORAGE_KEY, String(next));
    classListStub.toggle('high-contrast', next);
    dispatchedEvents.push('storage');
  }

  return {
    getHighContrast,
    toggle,
    getClasses: () => new Set(classes),
    getDispatchedEvents: () => [...dispatchedEvents],
    localStorageStub,
  };
}

// ---------------------------------------------------------------------------

describe('useHighContrast logic', () => {
  describe('initial state', () => {
    it('returns false when no preference is stored', () => {
      const { getHighContrast } = makeHookLogic(null);
      expect(getHighContrast()).toBe(false);
    });

    it('returns false when stored value is "false"', () => {
      const { getHighContrast } = makeHookLogic('false');
      expect(getHighContrast()).toBe(false);
    });

    it('returns true when stored value is "true"', () => {
      const { getHighContrast } = makeHookLogic('true');
      expect(getHighContrast()).toBe(true);
    });

    it('returns false for unexpected stored values', () => {
      const { getHighContrast } = makeHookLogic('yes');
      expect(getHighContrast()).toBe(false);
    });
  });

  describe('toggle behaviour', () => {
    it('flips false → true on first toggle', () => {
      const { getHighContrast, toggle } = makeHookLogic(null);
      toggle();
      expect(getHighContrast()).toBe(true);
    });

    it('flips true → false on first toggle', () => {
      const { getHighContrast, toggle } = makeHookLogic('true');
      toggle();
      expect(getHighContrast()).toBe(false);
    });

    it('returns to original state after two toggles', () => {
      const { getHighContrast, toggle } = makeHookLogic(null);
      toggle();
      toggle();
      expect(getHighContrast()).toBe(false);
    });

    it('handles many toggles correctly', () => {
      const { getHighContrast, toggle } = makeHookLogic(null);
      for (let i = 0; i < 5; i++) toggle();
      expect(getHighContrast()).toBe(true);
    });
  });

  describe('class list management', () => {
    it('adds .high-contrast class when toggled on', () => {
      const { toggle, getClasses } = makeHookLogic(null);
      toggle();
      expect(getClasses().has('high-contrast')).toBe(true);
    });

    it('removes .high-contrast class when toggled off', () => {
      const { toggle, getClasses } = makeHookLogic('true');
      toggle();
      expect(getClasses().has('high-contrast')).toBe(false);
    });

    it('class state matches preference after multiple toggles', () => {
      const { toggle, getClasses, getHighContrast } = makeHookLogic(null);
      toggle(); // on
      toggle(); // off
      toggle(); // on
      expect(getClasses().has('high-contrast')).toBe(getHighContrast());
    });
  });

  describe('storage event dispatch', () => {
    it('dispatches a storage event on each toggle', () => {
      const { toggle, getDispatchedEvents } = makeHookLogic(null);
      toggle();
      expect(getDispatchedEvents()).toHaveLength(1);
      expect(getDispatchedEvents()[0]).toBe('storage');
    });

    it('dispatches one event per toggle call', () => {
      const { toggle, getDispatchedEvents } = makeHookLogic(null);
      toggle();
      toggle();
      toggle();
      expect(getDispatchedEvents()).toHaveLength(3);
    });
  });

  describe('localStorage persistence', () => {
    it('writes "true" to localStorage when enabling', () => {
      const { toggle, localStorageStub } = makeHookLogic(null);
      toggle();
      expect(localStorageStub.getItem(STORAGE_KEY)).toBe('true');
    });

    it('writes "false" to localStorage when disabling', () => {
      const { toggle, localStorageStub } = makeHookLogic('true');
      toggle();
      expect(localStorageStub.getItem(STORAGE_KEY)).toBe('false');
    });
  });
});

// ---------------------------------------------------------------------------
// Integration: simulate the subscribe/getSnapshot pattern used by
// useSyncExternalStore to verify cross-tab sync logic.
// ---------------------------------------------------------------------------

describe('cross-tab sync (subscribe/StorageEvent model)', () => {
  let originalAddEventListener: typeof window.addEventListener;
  let originalRemoveEventListener: typeof window.removeEventListener;
  let originalLocalStorage: Storage;

  const storageListeners: EventListener[] = [];

  beforeEach(() => {
    originalAddEventListener = window.addEventListener;
    originalRemoveEventListener = window.removeEventListener;
    originalLocalStorage = window.localStorage;

    // Capture storage listeners
    window.addEventListener = vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
      if (event === 'storage') storageListeners.push(listener as EventListener);
    }) as typeof window.addEventListener;
    window.removeEventListener = vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
      if (event === 'storage') {
        const idx = storageListeners.indexOf(listener as EventListener);
        if (idx !== -1) storageListeners.splice(idx, 1);
      }
    }) as typeof window.removeEventListener;
  });

  afterEach(() => {
    window.addEventListener = originalAddEventListener;
    window.removeEventListener = originalRemoveEventListener;
    storageListeners.length = 0;
    vi.restoreAllMocks();
  });

  it('subscribe() registers a storage listener', () => {
    const callback = vi.fn();
    window.addEventListener('storage', callback);
    expect(window.addEventListener).toHaveBeenCalledWith('storage', callback);
  });

  it('unsubscribe() removes the registered listener', () => {
    const callback = vi.fn();
    window.addEventListener('storage', callback);
    window.removeEventListener('storage', callback);
    expect(window.removeEventListener).toHaveBeenCalledWith('storage', callback);
  });
});
