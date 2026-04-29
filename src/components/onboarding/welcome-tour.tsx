'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, ChevronRight, Mic, Calendar, ClipboardList } from 'lucide-react';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import { trackEvent } from '@/lib/analytics';

const TOUR_STORAGE_KEY = 'sportsiq-tour-complete';

interface TourStep {
  title: string;
  description: string;
  icon: React.ElementType;
  targetSelector: string | null; // CSS selector for the spotlight target, null = full overlay
  position: 'center' | 'bottom-left' | 'bottom-right' | 'top-right';
}

// 3 tooltips total. Roster + Settings tooltips were dropped — they're discoverable.
// Tour now triggers AFTER the coach has logged at least one observation, which is a
// signal of intent and prevents wasting a teaching moment on someone who hasn't
// committed yet.
const TOUR_STEPS: TourStep[] = [
  {
    title: 'Capture is your superpower',
    description:
      "You've already done it once — keep tapping here during practice and we'll segment voice into per-player observations automatically.",
    icon: Mic,
    targetSelector: '[data-tour="capture"]',
    position: 'top-right',
  },
  {
    title: 'Sessions hold it all together',
    description:
      'Every observation lives inside a session. Open one to see grouped notes, AI debrief, and a recap you can share with parents.',
    icon: Calendar,
    targetSelector: '[data-tour="sessions"]',
    position: 'top-right',
  },
  {
    title: 'Plans write themselves',
    description:
      'Generate practice plans, game-day prep sheets, and parent reports from your real data — usually in under 30 seconds.',
    icon: ClipboardList,
    targetSelector: '[data-tour="plans"]',
    position: 'top-right',
  },
];

interface Props {
  /**
   * When false, the tour stays dormant. The dashboard layout passes true only
   * after the coach has at least one real observation — by then they've crossed
   * the activation threshold and the tour is reinforcing, not interrupting.
   */
  enabled?: boolean;
}

export function WelcomeTour({ enabled = true }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!enabled) return;
    const done = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!done) {
      // Small delay to let the dashboard render first
      const timer = setTimeout(() => {
        setVisible(true);
        trackEvent('welcome_tour_shown', { step_count: TOUR_STEPS.length });
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [enabled]);

  const updateTarget = useCallback((stepIndex: number) => {
    const step = TOUR_STEPS[stepIndex];
    if (!step?.targetSelector) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.targetSelector);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      updateTarget(currentStep);
    }
  }, [currentStep, visible, updateTarget]);

  // Update target rect on scroll/resize
  useEffect(() => {
    if (!visible) return;
    const handler = () => updateTarget(currentStep);
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [visible, currentStep, updateTarget]);

  const completeTour = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setVisible(false);
    trackEvent('welcome_tour_completed', {
      reached_step: currentStep,
      total_steps: TOUR_STEPS.length,
    });
  }, [currentStep]);

  const trapRef = useFocusTrap<HTMLDivElement>({
    enabled: visible,
    onEscape: completeTour,
  });

  const nextStep = useCallback(() => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      completeTour();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }, [currentStep, completeTour]);

  if (!visible) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  // Compute tooltip position
  let tooltipStyle: React.CSSProperties = {};
  if (step.position === 'center' || !targetRect) {
    tooltipStyle = {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  } else {
    // Position the tooltip near the target
    const pad = 16;
    tooltipStyle = {
      top: Math.min(targetRect.bottom + pad, window.innerHeight - 280),
      left: Math.max(pad, Math.min(targetRect.left, window.innerWidth - 340)),
    };
  }

  return (
    <div ref={trapRef} className="fixed inset-0 z-[100]" aria-modal="true" role="dialog" aria-labelledby="tour-title">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" />

      {/* Spotlight cutout */}
      {targetRect && (
        <div
          className="absolute rounded-xl ring-4 ring-orange-500/50 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            zIndex: 101,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute z-[102] w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
        style={tooltipStyle}
      >
        {/* Close */}
        <button
          onClick={completeTour}
          className="absolute right-3 top-3 rounded-full p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          aria-label="Skip tour"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex flex-col items-start">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20">
            <Icon className="h-5 w-5 text-orange-500" />
          </div>
          <h3 id="tour-title" className="text-lg font-semibold text-zinc-100">{step.title}</h3>
          <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
            {step.description}
          </p>
        </div>

        {/* Step dots */}
        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i === currentStep ? 'bg-orange-500' : i < currentStep ? 'bg-orange-500/40' : 'bg-zinc-700'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={completeTour}
              className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={nextStep}
              className="flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 transition-colors active:scale-95"
            >
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
