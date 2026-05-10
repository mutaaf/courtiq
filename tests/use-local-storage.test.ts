import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage } from '@/hooks/use-local-storage';

beforeEach(() => {
  localStorage.clear();
});

describe('useLocalStorage', () => {
  it('returns the initial value when storage is empty', () => {
    const { result } = renderHook(() => useLocalStorage('key', 42));
    expect(result.current[0]).toBe(42);
  });

  it('returns a stored value over the initial value', () => {
    localStorage.setItem('existing-key', JSON.stringify('hello'));
    const { result } = renderHook(() => useLocalStorage('existing-key', 'default'));
    expect(result.current[0]).toBe('hello');
  });

  it('persists a new value to localStorage after setValue', () => {
    const { result } = renderHook(() => useLocalStorage('num', 0));

    act(() => {
      result.current[1](99);
    });

    expect(result.current[0]).toBe(99);
    expect(JSON.parse(localStorage.getItem('num')!)).toBe(99);
  });

  it('works with object values', () => {
    const initial = { name: 'Alex', score: 0 };
    const { result } = renderHook(() => useLocalStorage('player', initial));

    act(() => {
      result.current[1]({ name: 'Alex', score: 10 });
    });

    expect(result.current[0]).toEqual({ name: 'Alex', score: 10 });
    expect(JSON.parse(localStorage.getItem('player')!)).toEqual({ name: 'Alex', score: 10 });
  });

  it('works with array values', () => {
    const { result } = renderHook(() => useLocalStorage<string[]>('tags', []));

    act(() => {
      result.current[1](['defense', 'passing']);
    });

    expect(result.current[0]).toEqual(['defense', 'passing']);
  });

  it('works with boolean values', () => {
    const { result } = renderHook(() => useLocalStorage('flag', false));

    act(() => {
      result.current[1](true);
    });

    expect(result.current[0]).toBe(true);
    expect(JSON.parse(localStorage.getItem('flag')!)).toBe(true);
  });

  it('falls back to initialValue when stored JSON is corrupted', () => {
    localStorage.setItem('bad-json', '{not valid json');
    const { result } = renderHook(() => useLocalStorage('bad-json', 'fallback'));
    expect(result.current[0]).toBe('fallback');
  });

  it('supports functional updates', () => {
    const { result } = renderHook(() => useLocalStorage('counter', 5));

    act(() => {
      result.current[1]((prev) => prev + 1);
    });

    expect(result.current[0]).toBe(6);
  });
});
