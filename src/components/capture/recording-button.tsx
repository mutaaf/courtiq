'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RecordingButtonProps {
  isRecording: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function RecordingButton({ isRecording, onToggle, disabled = false }: RecordingButtonProps) {
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRecording) {
      setElapsed(0);
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRecording]);

  const handleClick = () => {
    if (disabled) return;

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(isRecording ? [50, 30, 50] : [100]);
    }

    onToggle();
  };

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Timer */}
      <div
        className={cn(
          'text-3xl sm:text-2xl font-mono font-bold tabular-nums transition-opacity duration-300',
          isRecording ? 'text-red-400 opacity-100' : 'text-zinc-600 opacity-0'
        )}
      >
        {formatTimer(elapsed)}
      </div>

      {/* Button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          'relative flex h-32 w-32 sm:h-28 md:h-24 md:w-24 sm:w-28 items-center justify-center rounded-full transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-500/50',
          'active:scale-95 touch-manipulation',
          'disabled:cursor-not-allowed disabled:opacity-50',
          isRecording
            ? 'bg-red-500 shadow-[0_0_60px_rgba(239,68,68,0.5)] hover:bg-red-600'
            : 'bg-orange-500 shadow-[0_0_40px_rgba(249,115,22,0.4)] hover:bg-orange-600 hover:shadow-[0_0_50px_rgba(249,115,22,0.5)]'
        )}
      >
        {/* Pulse rings when recording */}
        {isRecording && (
          <>
            <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-20" />
            <span
              className="absolute inset-[-12px] sm:inset-[-8px] animate-pulse rounded-full border-2 border-red-500/30"
            />
          </>
        )}

        {isRecording ? (
          <Square className="relative z-10 h-10 w-10 sm:h-8 sm:w-8 text-white" fill="white" />
        ) : (
          <Mic className="relative z-10 h-12 w-12 sm:h-10 sm:w-10 text-white" />
        )}
      </button>

      {/* Label */}
      <p className="text-base sm:text-sm font-medium text-zinc-400">
        {isRecording ? 'Tap to stop' : 'Tap to record'}
      </p>
    </div>
  );
}
