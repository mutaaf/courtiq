'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Star, Heart, MessageSquare, Share2 } from 'lucide-react';

const PROMPT_KEY_PREFIX = 'sportsiq-nps-';
const SNOOZE_DAYS = 30;
const SNOOZE_MS = SNOOZE_DAYS * 24 * 60 * 60 * 1000;

function getPromptKey(coachId: string) {
  return `${PROMPT_KEY_PREFIX}${coachId}`;
}

function shouldShowPrompt(coachId: string): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(getPromptKey(coachId));
  if (!raw) return true;
  try {
    const { dismissed, snoozedAt } = JSON.parse(raw) as { dismissed?: boolean; snoozedAt?: number };
    if (dismissed) return false;
    if (snoozedAt && Date.now() - snoozedAt < SNOOZE_MS) return false;
    return true;
  } catch {
    return true;
  }
}

function dismissPrompt(coachId: string, permanent: boolean) {
  if (typeof window === 'undefined') return;
  const value = permanent
    ? JSON.stringify({ dismissed: true })
    : JSON.stringify({ snoozedAt: Date.now() });
  localStorage.setItem(getPromptKey(coachId), value);
}

interface Props {
  coachId: string;
  observationCount: number;
}

type Step = 'rating' | 'positive' | 'critical' | 'done';

export function TestimonialPrompt({ coachId, observationCount }: Props) {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('rating');
  const [hoveredStar, setHoveredStar] = useState(0);
  const [selectedStar, setSelectedStar] = useState(0);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    if (observationCount < 10) return;
    if (!shouldShowPrompt(coachId)) return;
    const timer = setTimeout(() => setVisible(true), 2500);
    return () => clearTimeout(timer);
  }, [coachId, observationCount]);

  const close = useCallback(
    (permanent: boolean) => {
      dismissPrompt(coachId, permanent);
      setVisible(false);
    },
    [coachId]
  );

  const handleStarClick = useCallback(
    (star: number) => {
      setSelectedStar(star);
      if (star >= 4) {
        setStep('positive');
      } else {
        setStep('critical');
      }
    },
    []
  );

  const handleSubmitFeedback = useCallback(() => {
    setStep('done');
    setTimeout(() => close(true), 2200);
  }, [close]);

  const handleSkipToPositive = useCallback(() => {
    close(true);
  }, [close]);

  if (!visible) return null;

  const displayStars = hoveredStar || selectedStar;

  return (
    <div className="fixed inset-0 z-[100]" aria-modal="true" role="dialog">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={() => close(false)}
      />

      {/* Modal card */}
      <div className="absolute left-1/2 top-1/2 z-[101] w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        {/* Close */}
        <button
          onClick={() => close(false)}
          className="absolute right-3 top-3 rounded-full p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors touch-manipulation"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ── Step: Rating ── */}
        {step === 'rating' && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-500/15">
              <Star className="h-6 w-6 text-orange-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">
              Enjoying SportsIQ?
            </h3>
            <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
              You&apos;ve logged {observationCount} observations — you&apos;re making a
              difference! How would you rate your experience?
            </p>

            {/* Star row */}
            <div
              className="mt-5 flex gap-2"
              onMouseLeave={() => setHoveredStar(0)}
              role="group"
              aria-label="Rating"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStarClick(star)}
                  onMouseEnter={() => setHoveredStar(star)}
                  className="rounded-full p-1 transition-transform hover:scale-110 active:scale-95 touch-manipulation"
                  aria-label={`${star} star${star !== 1 ? 's' : ''}`}
                >
                  <Star
                    className={`h-9 w-9 transition-colors ${
                      star <= displayStars
                        ? 'fill-orange-400 text-orange-400'
                        : 'fill-zinc-700 text-zinc-700'
                    }`}
                  />
                </button>
              ))}
            </div>

            <button
              onClick={() => close(false)}
              className="mt-5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Remind me later
            </button>
          </div>
        )}

        {/* ── Step: Positive (4-5 stars) ── */}
        {step === 'positive' && (
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
              <Heart className="h-6 w-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">
              Thank you!
            </h3>
            <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
              We love hearing that. Help other coaches discover SportsIQ by
              sharing your experience.
            </p>

            <div className="mt-5 w-full space-y-3">
              <a
                href="mailto:?subject=Check%20out%20SportsIQ&body=I%27ve%20been%20using%20SportsIQ%20to%20track%20player%20observations%20and%20generate%20AI%20practice%20plans.%20It%27s%20been%20great%20for%20my%20coaching!%20https%3A%2F%2Fcourtiq.app"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => close(true)}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors active:scale-[0.98] touch-manipulation"
              >
                <Share2 className="h-4 w-4" />
                Share with a colleague
              </a>
              <button
                onClick={handleSkipToPositive}
                className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-300 hover:border-zinc-600 hover:text-zinc-100 transition-colors active:scale-[0.98] touch-manipulation"
              >
                Maybe later
              </button>
            </div>
          </div>
        )}

        {/* ── Step: Critical (1-3 stars) ── */}
        {step === 'critical' && (
          <div className="flex flex-col items-start">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15">
              <MessageSquare className="h-6 w-6 text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">Help us improve</h3>
            <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">
              We&apos;re sorry you had a rough experience. What could we do
              better? Your feedback goes directly to the team.
            </p>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="What's not working well for you?"
              rows={4}
              className="mt-4 w-full rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-sm text-zinc-100 placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500 transition-colors"
            />

            <div className="mt-4 flex w-full gap-3">
              <button
                onClick={() => close(false)}
                className="flex-1 rounded-xl border border-zinc-700 px-4 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-200 transition-colors active:scale-[0.98] touch-manipulation"
              >
                Cancel
              </button>
              <a
                href={`mailto:feedback@courtiq.app?subject=SportsIQ%20Feedback%20(${selectedStar}%20stars)&body=${encodeURIComponent(feedback || 'No feedback provided.')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleSubmitFeedback}
                className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700 transition-colors active:scale-[0.98] touch-manipulation"
              >
                Send feedback
              </a>
            </div>

            <button
              onClick={() => close(true)}
              className="mt-3 w-full text-center text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Don&apos;t ask again
            </button>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="flex flex-col items-center text-center py-2">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15">
              <Heart className="h-6 w-6 fill-emerald-400 text-emerald-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-100">Thank you!</h3>
            <p className="mt-1.5 text-sm text-zinc-400">
              Your feedback helps us build a better coaching tool.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
