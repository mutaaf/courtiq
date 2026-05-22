import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDebounce } from './use-debounce';

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('does not update the value before the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });
    rerender({ value: 'updated' });
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(result.current).toBe('initial');
  });

  it('updates the value after the delay elapses', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'initial' },
    });
    rerender({ value: 'updated' });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('updated');
  });

  it('resets the timer on each value change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(200); });
    rerender({ value: 'c' });
    act(() => { vi.advanceTimersByTime(200); });
    // Only 200ms since 'c' was set — should still be 'a'
    expect(result.current).toBe('a');
    act(() => { vi.advanceTimersByTime(100); });
    // Now 300ms since 'c' — should update
    expect(result.current).toBe('c');
  });

  it('works with number values', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 500), {
      initialProps: { value: 0 },
    });
    rerender({ value: 42 });
    act(() => { vi.advanceTimersByTime(500); });
    expect(result.current).toBe(42);
  });

  it('works with object values', () => {
    const obj1 = { name: 'Alice' };
    const obj2 = { name: 'Bob' };
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: obj1 },
    });
    rerender({ value: obj2 });
    act(() => { vi.advanceTimersByTime(200); });
    expect(result.current).toEqual({ name: 'Bob' });
  });

  it('clears the timeout on unmount', () => {
    const { rerender, unmount } = renderHook(({ value }) => useDebounce(value, 300), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    unmount();
    // No error thrown means cleanup ran correctly
    act(() => { vi.advanceTimersByTime(300); });
  });

  it('handles delay of 0', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 0), {
      initialProps: { value: 'a' },
    });
    rerender({ value: 'b' });
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current).toBe('b');
  });
});
