'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface VoiceInputState {
  isRecording: boolean;
  isSupported: boolean;
  /** Finalized transcript segments accumulated so far */
  transcript: string;
  /** Current partial (interim) recognition result */
  interimTranscript: string;
}

/**
 * Lightweight voice-to-text hook using the Web Speech API.
 * Designed for the AI assistant input — no MediaRecorder, no IndexedDB.
 *
 * Usage:
 *   const { isRecording, isSupported, transcript, interimTranscript, start, stop, reset } = useVoiceInput();
 *
 *   start()  — begin listening; clears previous transcript
 *   stop()   — stop listening; returns the final transcript string
 *   reset()  — stop + clear everything
 */
export function useVoiceInput() {
  const [state, setState] = useState<VoiceInputState>({
    isRecording: false,
    isSupported: false,
    transcript: '',
    interimTranscript: '',
  });

  const recognitionRef = useRef<any>(null);
  // Use a ref so the onresult closure always reads the latest accumulated value
  const finalTranscriptRef = useRef('');

  // Detect browser support once on mount
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    setState((s) => ({ ...s, isSupported: !!SR }));
  }, []);

  const start = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) return;

    // Clean up any previous session
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    finalTranscriptRef.current = '';
    setState((s) => ({
      ...s,
      isRecording: true,
      transcript: '',
      interimTranscript: '',
    }));

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setState((s) => ({
        ...s,
        transcript: finalTranscriptRef.current,
        interimTranscript: interim,
      }));
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' is normal when user is quiet — ignore silently
      if (event.error !== 'no-speech') {
        console.warn('SpeechRecognition error:', event.error);
      }
      setState((s) => ({ ...s, isRecording: false, interimTranscript: '' }));
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setState((s) => ({ ...s, isRecording: false, interimTranscript: '' }));
      recognitionRef.current = null;
    };

    recognition.start();
    recognitionRef.current = recognition;

    if (navigator.vibrate) navigator.vibrate(30);
  }, []);

  /** Stop recognition and return the final transcript string. */
  const stop = useCallback((): string => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    const result = finalTranscriptRef.current.trim();
    setState((s) => ({ ...s, isRecording: false, interimTranscript: '' }));
    if (navigator.vibrate) navigator.vibrate([30, 30, 30]);
    return result;
  }, []);

  /** Stop recognition and clear all transcript state. */
  const reset = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    finalTranscriptRef.current = '';
    setState((s) => ({
      ...s,
      isRecording: false,
      transcript: '',
      interimTranscript: '',
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return { ...state, start, stop, reset };
}
