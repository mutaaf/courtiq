'use client';

import { useRef, useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useReducedMotion } from '@/hooks/use-reduced-motion';

const THRESHOLD = 72;
const MAX_PULL = 100;
const RESISTANCE = 2.5;

type IndicatorState = 'hidden' | 'pulling' | 'ready' | 'refreshing';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

export function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef(0);
  const pullDistRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });
  const reducedMotion = useReducedMotion();

  const [indicatorState, setIndicatorState] = useState<IndicatorState>('hidden');
  const [pullHeight, setPullHeight] = useState(0);

  useEffect(() => {
    const getScrollEl = (): Element | null => {
      let el = wrapperRef.current?.parentElement ?? null;
      while (el && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        if (['auto', 'scroll', 'overlay'].includes(style.overflowY)) return el;
        el = el.parentElement;
      }
      return null;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshingRef.current) return;
      const scrollEl = getScrollEl();
      const atTop = scrollEl ? scrollEl.scrollTop <= 0 : window.scrollY <= 0;
      if (!atTop) return;
      startYRef.current = e.touches[0].clientY;
      isDraggingRef.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      const dy = e.touches[0].clientY - startYRef.current;
      if (dy <= 0) {
        pullDistRef.current = 0;
        if (indicatorRef.current) indicatorRef.current.style.transition = 'none';
        setPullHeight(0);
        setIndicatorState('hidden');
        return;
      }
      e.preventDefault();
      const dist = Math.min(dy / RESISTANCE, MAX_PULL);
      pullDistRef.current = dist;
      if (indicatorRef.current) indicatorRef.current.style.transition = 'none';
      setPullHeight(dist);
      const wasReady = pullDistRef.current >= THRESHOLD;
      setIndicatorState(dist >= THRESHOLD ? 'ready' : 'pulling');
      // Haptic bump when crossing the threshold — skip when reduced motion preferred
      if (dist >= THRESHOLD && !wasReady && !reducedMotion && navigator.vibrate) {
        navigator.vibrate(50);
      }
    };

    const handleTouchEnd = async () => {
      if (!isDraggingRef.current) return;
      isDraggingRef.current = false;

      const dist = pullDistRef.current;

      if (dist >= THRESHOLD && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        if (!reducedMotion && navigator.vibrate) navigator.vibrate([50, 50, 50]);
        setIndicatorState('refreshing');
        // Use a short transition unless the user prefers reduced motion
        if (indicatorRef.current) {
          indicatorRef.current.style.transition = reducedMotion ? 'none' : 'height 0.2s ease';
        }
        setPullHeight(THRESHOLD);
        try {
          await onRefreshRef.current();
        } finally {
          isRefreshingRef.current = false;
        }
        if (indicatorRef.current) {
          indicatorRef.current.style.transition = reducedMotion ? 'none' : 'height 0.3s ease';
        }
        setIndicatorState('hidden');
        setPullHeight(0);
        pullDistRef.current = 0;
      } else {
        if (indicatorRef.current) {
          indicatorRef.current.style.transition = reducedMotion ? 'none' : 'height 0.25s ease';
        }
        setIndicatorState('hidden');
        setPullHeight(0);
        pullDistRef.current = 0;
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [reducedMotion]);

  const progress = Math.min(pullHeight / THRESHOLD, 1);

  return (
    <div ref={wrapperRef}>
      {/* Pull indicator — hidden on desktop (touch won't fire anyway) */}
      <div
        ref={indicatorRef}
        style={{ height: pullHeight, overflow: 'hidden' }}
        aria-hidden="true"
      >
        {indicatorState !== 'hidden' && (
          <div className="flex h-full items-center justify-center">
            <div
              className={`flex h-9 w-9 items-center justify-center rounded-full border bg-zinc-800 shadow-md transition-colors duration-150 ${
                indicatorState === 'ready' || indicatorState === 'refreshing'
                  ? 'border-orange-500/50 bg-orange-500/10'
                  : 'border-zinc-700'
              }`}
            >
              <RefreshCw
                className={`h-4 w-4 transition-colors duration-150 ${
                  indicatorState === 'refreshing'
                    ? 'animate-spin text-orange-400'
                    : indicatorState === 'ready'
                    ? 'text-orange-400'
                    : 'text-zinc-500'
                }`}
                style={
                  indicatorState !== 'refreshing'
                    ? { transform: `rotate(${progress * 360}deg)` }
                    : undefined
                }
              />
            </div>
          </div>
        )}
      </div>
      {children}
    </div>
  );
}
