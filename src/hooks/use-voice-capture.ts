'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { localDB } from '@/lib/storage/local-db';
import { generateId } from '@/lib/utils';

interface UseVoiceCaptureOptions {
  teamId: string;
  coachId: string;
  sessionId?: string;
  onTranscript?: (text: string) => void;
}

interface VoiceCaptureState {
  isRecording: boolean;
  duration: number;
  transcript: string;
  error: string | null;
}

export function useVoiceCapture(options: UseVoiceCaptureOptions) {
  const { teamId, coachId, sessionId, onTranscript } = options;
  const [state, setState] = useState<VoiceCaptureState>({
    isRecording: false,
    duration: 0,
    transcript: '',
    error: null,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      // Set up MediaRecorder for audio capture
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(1000); // Collect data every second

      // Set up Web Speech API for live transcript (fallback)
      try {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.lang = 'en-US';

          let finalTranscript = '';

          recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const result = event.results[i];
              if (result.isFinal) {
                finalTranscript += result[0].transcript + ' ';
              } else {
                interim += result[0].transcript;
              }
            }
            const full = finalTranscript + interim;
            setState((s) => ({ ...s, transcript: full }));
            onTranscript?.(full);
          };

          recognition.onerror = (event: any) => {
            if (event.error !== 'no-speech') {
              console.warn('Speech recognition error:', event.error);
            }
          };

          recognition.start();
          recognitionRef.current = recognition;
        }
      } catch {
        // Speech recognition not available — audio still records
      }

      // Timer
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setState((s) => ({
          ...s,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        }));
      }, 1000);

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate(50);

      setState((s) => ({ ...s, isRecording: true, duration: 0, error: null }));
    } catch (err: any) {
      setState((s) => ({ ...s, error: err.message || 'Failed to start recording' }));
    }
  }, [onTranscript]);

  const stopRecording = useCallback(async (): Promise<{ localId: string; transcript: string } | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        resolve(null);
        return;
      }

      // Stop speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }

      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Haptic feedback
      if (navigator.vibrate) navigator.vibrate([50, 50, 50]);

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType });
        const localId = generateId();
        const duration = (Date.now() - startTimeRef.current) / 1000;

        // Save to IndexedDB
        if (localDB) {
          await localDB.recordings.add({
            localId,
            teamId,
            coachId,
            sessionId: sessionId || null,
            audioBlob: blob,
            mimeType: mediaRecorder.mimeType,
            duration,
            rawTranscript: state.transcript || null,
            status: 'recorded',
            isSynced: false,
            createdAt: new Date().toISOString(),
          });
        }

        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());

        setState((s) => ({ ...s, isRecording: false }));
        resolve({ localId, transcript: state.transcript });
      };

      mediaRecorder.stop();
    });
  }, [teamId, coachId, sessionId, state.transcript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      }
      if (recognitionRef.current) recognitionRef.current.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    ...state,
    startRecording,
    stopRecording,
    setTranscript: (text: string) => setState((s) => ({ ...s, transcript: text })),
  };
}
