import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '@/hooks/use-debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebounce', () => {
  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300));
    expect(result.current).toBe('initial');
  });

  it('does not update before the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'first' },
    });

    rerender({ value: 'second' });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('first');
  });

  it('updates after the delay has elapsed', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'first' },
    });

    rerender({ value: 'second' });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe('second');
  });

  it('resets the timer on each value change (only debounces the last value)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(100); });

    rerender({ value: 'c' });
    act(() => { vi.advanceTimersByTime(100); });

    rerender({ value: 'd' });
    act(() => { vi.advanceTimersByTime(100); });

    // 300ms hasn't elapsed since the last change
    expect(result.current).toBe('a');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe('d');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 0 },
    });

    rerender({ value: 42 });

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current).toBe(42);
  });

  it('works with object values', () => {
    const obj1 = { q: 'defense' };
    const obj2 = { q: 'passing' };

    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: obj1 },
    });

    rerender({ value: obj2 });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current).toBe(obj2);
  });

  it('respects different delay values', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 1000), {
      initialProps: { value: 'slow' },
    });

    rerender({ value: 'updated' });

    act(() => { vi.advanceTimersByTime(999); });
    expect(result.current).toBe('slow');

    act(() => { vi.advanceTimersByTime(1); });
    expect(result.current).toBe('updated');
  });
});
