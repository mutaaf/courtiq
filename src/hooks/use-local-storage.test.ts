import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from './use-local-storage';

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns the initial value when nothing is stored', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(result.current[0]).toBe('default');
  });

  it('persists the value to localStorage on update', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    act(() => {
      result.current[1]('new value');
    });
    expect(localStorage.getItem('key')).toBe(JSON.stringify('new value'));
  });

  it('reads existing value from localStorage on mount', () => {
    localStorage.setItem('key', JSON.stringify('stored'));
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(result.current[0]).toBe('stored');
  });

  it('works with object values', () => {
    const { result } = renderHook(() => useLocalStorage<{ count: number }>('obj', { count: 0 }));
    act(() => {
      result.current[1]({ count: 5 });
    });
    expect(result.current[0]).toEqual({ count: 5 });
    expect(JSON.parse(localStorage.getItem('obj')!)).toEqual({ count: 5 });
  });

  it('works with array values', () => {
    const { result } = renderHook(() => useLocalStorage<string[]>('arr', []));
    act(() => {
      result.current[1](['a', 'b', 'c']);
    });
    expect(result.current[0]).toEqual(['a', 'b', 'c']);
  });

  it('works with boolean values', () => {
    const { result } = renderHook(() => useLocalStorage('collapsed', false));
    act(() => {
      result.current[1](true);
    });
    expect(result.current[0]).toBe(true);
    expect(JSON.parse(localStorage.getItem('collapsed')!)).toBe(true);
  });

  it('works with number values', () => {
    const { result } = renderHook(() => useLocalStorage('count', 0));
    act(() => {
      result.current[1](42);
    });
    expect(result.current[0]).toBe(42);
  });

  it('falls back to initial value when localStorage contains invalid JSON', () => {
    localStorage.setItem('key', 'not-valid-json{{{');
    const { result } = renderHook(() => useLocalStorage('key', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('does not throw when localStorage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { result } = renderHook(() => useLocalStorage('key', 'default'));
    expect(() => {
      act(() => {
        result.current[1]('value');
      });
    }).not.toThrow();
  });

  it('returns a stable setter reference', () => {
    const { result, rerender } = renderHook(() => useLocalStorage('key', 'default'));
    const setter1 = result.current[1];
    rerender();
    const setter2 = result.current[1];
    expect(setter1).toBe(setter2);
  });
});
