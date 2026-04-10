'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { mutate } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RecordingButton } from '@/components/capture/recording-button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Send, Keyboard, Mic, AlertCircle, Sparkles, Upload, FileAudio } from 'lucide-react';
import { generateId } from '@/lib/utils';
import Link from 'next/link';

type CaptureState = 'idle' | 'recording' | 'processing' | 'error';

export default function CapturePage() {
  const router = useRouter();
  const { activeTeam, coach } = useActiveTeam();

  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [transcript, setTranscript] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isApiKeyError, setIsApiKeyError] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [quickNote, setQuickNote] = useState('');
  const [quickNoteSending, setQuickNoteSending] = useState(false);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'transcribing' | 'editing'>('idle');
  const [uploadTranscript, setUploadTranscript] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptRef = useRef('');

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
    setIsApiKeyError(false);
    setTranscript('');
    setLiveTranscript('');
    transcriptRef.current = '';
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

        // Wait a moment for final speech recognition results to arrive
        await new Promise(resolve => setTimeout(resolve, 500));

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
          const fullText = final + interim;
          setLiveTranscript(fullText);
          transcriptRef.current = fullText;
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

  const checkApiKeyError = (errorText: string): boolean => {
    const lower = errorText.toLowerCase();
    return lower.includes('api key') || lower.includes('not configured') || lower.includes('no api');
  };

  const processRecording = async (audioBlob: Blob, mimeType: string) => {
    if (!activeTeam) return;

    try {
      if (!coach) throw new Error('Not authenticated');

      // Use ref for latest transcript (state may be stale in callback closure)
      const currentTranscript = transcriptRef.current;

      // Guard: empty transcript
      if (!currentTranscript || !currentTranscript.trim()) {
        setErrorMessage('No speech was detected. Please try recording again and speak clearly.');
        setCaptureState('error');
        return;
      }

      const recordingId = generateId();
      const storagePath = `recordings/${activeTeam.id}/${recordingId}.webm`;

      // Upload audio via API route (uses service role, bypasses RLS)
      let uploadSucceeded = false;
      try {
        const uploadForm = new FormData();
        uploadForm.append('audio', audioBlob);
        uploadForm.append('path', storagePath);
        const uploadRes = await fetch('/api/voice/upload-audio', { method: 'POST', body: uploadForm });
        if (uploadRes.ok) uploadSucceeded = true;
      } catch {
        // Storage upload failed, continue
      }

      // Create recording record — best-effort, don't block the AI call
      try {
        await mutate({
          table: 'recordings',
          operation: 'insert',
          data: {
            id: recordingId,
            team_id: activeTeam.id,
            coach_id: coach.id,
            storage_path: uploadSucceeded ? storagePath : null,
            mime_type: mimeType,
            file_size_bytes: audioBlob.size,
            status: 'uploaded' as const,
            raw_transcript: currentTranscript || null,
          },
        });
      } catch (e) {
        console.error('Recording insert failed:', e);
      }

      // Send for AI segmentation
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: currentTranscript, teamId: activeTeam.id }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || 'AI processing failed';

        if (checkApiKeyError(errMsg)) {
          setIsApiKeyError(true);
          setErrorMessage(errMsg);
          setCaptureState('error');
          return;
        }

        // If API isn't ready yet, redirect to review with recording_id
        router.push(`/capture/review?recording_id=${recordingId}`);
        return;
      }

      const result = await response.json();
      setTranscript(result.transcript || currentTranscript);

      // Check for API key error in response
      if (result.error && checkApiKeyError(result.error)) {
        setIsApiKeyError(true);
        setErrorMessage(result.error);
        setCaptureState('error');
        return;
      }

      // Store parsed observations in sessionStorage for review page
      sessionStorage.setItem(
        'pending_observations',
        JSON.stringify({
          recording_id: recordingId,
          observations: result.observations || [],
          transcript: result.transcript || currentTranscript,
          unmatched_names: result.unmatched_names || [],
          error: result.error || null,
        })
      );

      router.push(`/capture/review?recording_id=${recordingId}`);
    } catch (err: any) {
      const msg = err.message || 'Failed to process recording.';
      if (checkApiKeyError(msg)) {
        setIsApiKeyError(true);
      }
      setErrorMessage(msg);
      setCaptureState('error');
    }
  };

  const handleQuickNote = async () => {
    if (!activeTeam || !quickNote.trim()) return;
    setQuickNoteSending(true);
    setErrorMessage(null);
    setIsApiKeyError(false);

    try {
      // Send quick note for AI segmentation
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: quickNote.trim(), teamId: activeTeam.id }),
      });

      if (response.ok) {
        const result = await response.json();

        // Check for API key error in response
        if (result.error && checkApiKeyError(result.error)) {
          setIsApiKeyError(true);
          setErrorMessage(result.error);
          setQuickNoteSending(false);
          return;
        }

        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: null,
            observations: result.observations || [],
            transcript: quickNote.trim(),
            unmatched_names: result.unmatched_names || [],
            error: result.error || null,
            source: 'typed',
          })
        );
      } else {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || '';

        if (checkApiKeyError(errMsg)) {
          setIsApiKeyError(true);
          setErrorMessage(errMsg);
          setQuickNoteSending(false);
          return;
        }

        // If API not available, pass raw text
        sessionStorage.setItem(
          'pending_observations',
          JSON.stringify({
            recording_id: null,
            observations: [],
            transcript: quickNote.trim(),
            unmatched_names: [],
            error: errMsg || null,
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
          unmatched_names: [],
          error: null,
          source: 'typed',
        })
      );
      router.push('/capture/review');
    } finally {
      setQuickNoteSending(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!activeTeam) return;
    setUploadFile(file);
    setUploadState('transcribing');
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append('audio', file);
      formData.append('teamId', activeTeam.id);

      const res = await fetch('/api/voice/upload-transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (data.transcript) {
        setUploadTranscript(data.transcript);
        setUploadState('editing');
      } else if (data.needsManualTranscript) {
        setUploadTranscript('');
        setUploadState('editing');
        setErrorMessage('Could not auto-transcribe. Please type or paste the transcript below.');
      } else {
        setErrorMessage(data.error || 'Transcription failed');
        setUploadState('idle');
      }
    } catch {
      setErrorMessage('Failed to upload audio');
      setUploadState('idle');
    }
  };

  const handleUploadSubmit = async () => {
    if (!activeTeam || !uploadTranscript.trim()) return;
    setCaptureState('processing');
    setUploadState('idle');

    try {
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: uploadTranscript.trim(), teamId: activeTeam.id }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errMsg = errData.error || 'AI processing failed';
        if (checkApiKeyError(errMsg)) {
          setIsApiKeyError(true);
          setErrorMessage(errMsg);
          setCaptureState('error');
          return;
        }
        setErrorMessage(errMsg);
        setCaptureState('error');
        return;
      }

      const result = await response.json();

      sessionStorage.setItem(
        'pending_observations',
        JSON.stringify({
          recording_id: null,
          observations: result.observations || [],
          transcript: uploadTranscript.trim(),
          unmatched_names: result.unmatched_names || [],
          error: result.error || null,
          source: 'voice',
        })
      );

      router.push('/capture/review');
    } catch {
      setErrorMessage('AI processing failed');
      setCaptureState('error');
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
            <CardContent className="p-5 sm:p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
                <span className="text-sm sm:text-xs font-medium text-zinc-400">Live Transcript</span>
              </div>
              <p className="min-h-[4rem] text-base sm:text-sm leading-relaxed text-zinc-300">
                {liveTranscript || (
                  <span className="italic text-zinc-600">Listening...</span>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Error */}
        {captureState === 'error' && errorMessage && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 sm:p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-6 w-6 sm:h-5 sm:w-5 flex-shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="text-base sm:text-sm font-semibold text-red-400">
                  {isApiKeyError ? 'AI Not Configured' : 'Recording Error'}
                </p>
                <p className="mt-1.5 text-sm text-red-400/80 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
            {isApiKeyError && (
              <Link
                href="/settings/ai"
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500/20 border border-orange-500/30 px-4 py-3 text-sm font-medium text-orange-400 hover:bg-orange-500/30 transition-colors active:scale-[0.98] touch-manipulation"
              >
                <Sparkles className="h-4 w-4" />
                Configure AI Provider
              </Link>
            )}
            {!isApiKeyError && (
              <Button
                variant="outline"
                className="mt-4 w-full h-12 sm:h-10 text-base sm:text-sm"
                onClick={() => { setCaptureState('idle'); setErrorMessage(null); setIsApiKeyError(false); }}
              >
                Try Again
              </Button>
            )}
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

        {/* Upload Voice Memo */}
        {captureState === 'idle' && uploadState === 'idle' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setShowQuickNote(true)}
              className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 active:scale-[0.98] touch-manipulation"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-500/20">
                <Keyboard className="h-6 w-6 text-blue-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">Type a note</p>
                <p className="text-xs text-zinc-500">Quick text observation</p>
              </div>
            </button>
            <label className="flex cursor-pointer items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 text-left transition-colors hover:border-zinc-700 hover:bg-zinc-800/50 active:scale-[0.98] touch-manipulation">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                <Upload className="h-6 w-6 text-purple-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-200">Upload audio</p>
                <p className="text-xs text-zinc-500">Voice memo or recording</p>
              </div>
              <input
                type="file"
                accept="audio/*,video/*,.m4a,.mp3,.wav,.webm,.ogg,.mp4,.mov"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        )}

        {/* Upload transcribing state */}
        {uploadState === 'transcribing' && (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-6">
              <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
              <p className="text-sm font-medium text-zinc-300">Transcribing audio...</p>
              <p className="text-xs text-zinc-500">{uploadFile?.name}</p>
            </CardContent>
          </Card>
        )}

        {/* Upload transcript editing */}
        {uploadState === 'editing' && (
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4 text-orange-500" />
                  <span className="text-sm font-medium text-zinc-300">Voice Memo Transcript</span>
                </div>
                <button
                  type="button"
                  onClick={() => { setUploadState('idle'); setUploadTranscript(''); setUploadFile(null); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >Cancel</button>
              </div>
              {uploadFile && (
                <p className="text-xs text-zinc-500">{uploadFile.name}</p>
              )}
              <Textarea
                value={uploadTranscript}
                onChange={(e) => setUploadTranscript(e.target.value)}
                placeholder="Edit the transcript if needed, or paste your own..."
                rows={6}
              />
              <p className="text-xs text-zinc-500">Review and edit the transcript, then submit for AI analysis.</p>
              <Button onClick={handleUploadSubmit} disabled={!uploadTranscript.trim()} className="w-full">
                <Sparkles className="h-4 w-4" /> Analyze with AI
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Note Toggle */}
        {captureState === 'idle' && uploadState === 'idle' && (
          <>
            {!showQuickNote ? (
              <div className="hidden">
                {/* Buttons moved to combined row above */}
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
