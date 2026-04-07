'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { createClient } from '@/lib/supabase/client';
import { mutate } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecordingButton } from '@/components/capture/recording-button';
import { Loader2, Send, Keyboard, Mic, AlertCircle } from 'lucide-react';
import { generateId } from '@/lib/utils';

type CaptureState = 'idle' | 'recording' | 'processing' | 'error';

export default function CapturePage() {
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [quickNoteSending, setQuickNoteSending] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!activeTeam) return;
    setErrorMessage(null);
    setTranscript('');
    setLiveTranscript('');
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        await processRecording(audioBlob, mimeType);
      };

      mediaRecorder.start(1000); // Collect data every second
      setCaptureState('recording');

      // Start live transcription via SpeechRecognition if available
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let interim = '';
          let final = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              final += event.results[i][0].transcript + ' ';
            } else {
              interim += event.results[i][0].transcript;
            }
          }
          setLiveTranscript(final + interim);
        };

        recognition.onerror = () => {
          // Silently fail - live transcript is a nice-to-have
        };

        try {
          recognition.start();
          (mediaRecorderRef.current as any)._recognition = recognition;
        } catch {
          // SpeechRecognition may not be available
        }
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setErrorMessage('Microphone access denied. Please allow microphone access and try again.');
      } else {
        setErrorMessage('Failed to start recording. Please check your microphone.');
      }
      setCaptureState('error');
    }
  }, [activeTeam]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      // Stop live transcription
      const recognition = (recorder as any)._recognition;
      if (recognition) {
        try { recognition.stop(); } catch {}
      }
      recorder.stop();
      setCaptureState('processing');
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (captureState === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }, [captureState, startRecording, stopRecording]);

  const processRecording = async (audioBlob: Blob, mimeType: string) => {
    if (!activeTeam) return;

    try {
      if (!coach) throw new Error('Not authenticated');

      const recordingId = generateId();
      const storagePath = `recordings/${activeTeam.id}/${recordingId}.webm`;

      // Upload audio via storage (requires supabase client)
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage
        .from('recordings')
        .upload(storagePath, audioBlob, { contentType: mimeType });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        // Continue without upload - store locally
      }

      // Create recording record
      await mutate({
        table: 'recordings',
        operation: 'insert',
        data: {
          id: recordingId,
          team_id: activeTeam.id,
          coach_id: coach.id,
          storage_path: uploadError ? null : storagePath,
          mime_type: mimeType,
          file_size_bytes: audioBlob.size,
          status: 'uploaded' as const,
          raw_transcript: liveTranscript || null,
        },
      });

      // Send for transcription + parsing via API
      const response = await fetch('/api/ai/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recording_id: recordingId,
          team_id: activeTeam.id,
        }),
      });

      if (!response.ok) {
        // If API isn't ready yet, redirect to review with recording_id
        router.push(`/capture/review?recording_id=${recordingId}`);
        return;
      }

      const result = await response.json();
      setTranscript(result.transcript || liveTranscript);

      // Store parsed observations in sessionStorage for review page
      if (result.observations) {
        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: recordingId,
            observations: result.observations,
            transcript: result.transcript,
          })
        );
      }

      router.push(`/capture/review?recording_id=${recordingId}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to process recording.');
      setCaptureState('error');
    }
  };

  const handleQuickNote = async () => {
    if (!activeTeam || !quickNote.trim()) return;
    setQuickNoteSending(true);
    setErrorMessage(null);

    try {
      // Send quick note for AI parsing
      const response = await fetch('/api/ai/parse-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: quickNote.trim(),
          team_id: activeTeam.id,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: null,
            observations: result.observations || [],
            transcript: quickNote.trim(),
            source: 'typed',
          })
        );
      } else {
        // If API not available, pass raw text
        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: null,
            observations: [],
            transcript: quickNote.trim(),
            source: 'typed',
          })
        );
      }

      router.push('/capture/review');
    } catch {
      // Fallback: pass raw text to review
      sessionStorage.setItem(
        'pending_observations',
        JSON.stringify({
          recording_id: null,
          observations: [],
          transcript: quickNote.trim(),
          source: 'typed',
        })
      );
      router.push('/capture/review');
    } finally {
      setQuickNoteSending(false);
    }
  };

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <Mic className="mb-4 h-12 w-12 text-zinc-600" />
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-1 text-sm text-zinc-500">Select a team to start capturing observations.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col items-center justify-center p-4 lg:p-8">
      <div className="w-full max-w-lg space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Capture</h1>
          <p className="mt-1 text-sm text-zinc-400">{activeTeam.name}</p>
        </div>

        {/* Recording Area */}
        {captureState !== 'processing' && (
          <div className="flex flex-col items-center">
            <RecordingButton
              isRecording={captureState === 'recording'}
              onToggle={toggleRecording}
              disabled={false}
            />
          </div>
        )}

        {/* Processing State */}
        {captureState === 'processing' && (
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-zinc-800">
              <Loader2 className="h-10 w-10 animate-spin text-orange-500" />
            </div>
            <p className="text-lg font-medium text-zinc-300">Processing...</p>
            <p className="text-sm text-zinc-500">Transcribing and parsing your observations</p>
          </div>
        )}

        {/* Live Transcript */}
        {(captureState === 'recording' || liveTranscript) && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                <span className="text-xs font-medium text-zinc-400">Live Transcript</span>
              </div>
              <p className="min-h-[3rem] text-sm text-zinc-300">
                {liveTranscript || (
                  <span className="italic text-zinc-600">Listening...</span>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {captureState === 'error' && errorMessage && (
          <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
            <div>
              <p className="text-sm font-medium text-red-400">Recording Error</p>
              <p className="mt-1 text-sm text-red-400/80">{errorMessage}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setCaptureState('idle'); setErrorMessage(null); }}
              >
                Try Again
              </Button>
            </div>
          </div>
        )}

        {/* Divider */}
        {captureState === 'idle' && (
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-xs text-zinc-600">or</span>
            <div className="h-px flex-1 bg-zinc-800" />
          </div>
        )}

        {/* Quick Note Toggle */}
        {captureState === 'idle' && (
          <>
            {!showQuickNote ? (
              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  onClick={() => setShowQuickNote(true)}
                  className="text-zinc-400"
                >
                  <Keyboard className="h-4 w-4" />
                  Type a quick note
                </Button>
              </div>
            ) : (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-300">Quick Note</span>
                    <button
                      type="button"
                      onClick={() => { setShowQuickNote(false); setQuickNote(''); }}
                      className="text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., Marcus showed great ball handling today..."
                      value={quickNote}
                      onChange={(e) => setQuickNote(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && quickNote.trim()) handleQuickNote();
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={handleQuickNote}
                      disabled={!quickNote.trim() || quickNoteSending}
                    >
                      {quickNoteSending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-zinc-600">
                    AI will parse your note into individual player observations.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
