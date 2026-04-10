'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Sparkles, ArrowRight, Check, Edit2, Trash2, X, Lock } from 'lucide-react';
import Link from 'next/link';

// Enhanced mock data that plausibly matches common coaching observations
const ENHANCED_MOCK_OBSERVATIONS = [
  {
    player_name: 'Marcus',
    category: 'Offense',
    sentiment: 'positive' as const,
    text: 'Excellent cut to the basket with great timing. Shows strong off-ball awareness and reads the defense well.',
    stats: { points: 2 },
    tendency: null,
  },
  {
    player_name: 'Jayden',
    category: 'Defense',
    sentiment: 'needs-work' as const,
    text: 'Needs to improve closeout technique on perimeter shooters. Getting caught flat-footed on defensive rotations.',
    stats: null,
    tendency: 'hesitates on closeouts',
  },
  {
    player_name: 'Sofia',
    category: 'IQ',
    sentiment: 'positive' as const,
    text: 'Made a smart extra pass to the open player instead of forcing a contested shot. Great court vision and decision making.',
    stats: { assists: 1 },
    tendency: 'always looks for the extra pass',
  },
  {
    player_name: 'Marcus',
    category: 'Effort',
    sentiment: 'positive' as const,
    text: 'Hustled back on defense after the turnover. Led the transition defense and set the tone for the team.',
    stats: null,
    tendency: null,
  },
  {
    player_name: 'Jayden',
    category: 'Offense',
    sentiment: 'positive' as const,
    text: 'Hit a nice pull-up jumper from the mid-range. Showing confidence in his shot.',
    stats: { points: 2 },
    tendency: 'prefers right hand drives',
  },
];

const DEMO_TEAM_CONTEXT = {
  teamId: 'demo-team',
  roster: [
    { name: 'Marcus', nickname: null, position: 'Guard', jersey_number: 12, name_variants: [] },
    { name: 'Jayden', nickname: 'Jay', position: 'Forward', jersey_number: 7, name_variants: [] },
    { name: 'Sofia', nickname: null, position: 'Guard', jersey_number: 23, name_variants: [] },
    { name: 'Alex', nickname: null, position: 'Center', jersey_number: 5, name_variants: [] },
    { name: 'Mia', nickname: null, position: 'Forward', jersey_number: 15, name_variants: [] },
  ],
};

const DEMO_DURATION = 20; // seconds

type DemoStep = 'intro' | 'recording' | 'processing' | 'results';

export default function DemoPage() {
  const [step, setStep] = useState<DemoStep>('intro');
  const [timeLeft, setTimeLeft] = useState(DEMO_DURATION);
  const [transcript, setTranscript] = useState('');
  const [observations, setObservations] = useState(ENHANCED_MOCK_OBSERVATIONS);
  const [showSignupModal, setShowSignupModal] = useState(false);
  const [textInput, setTextInput] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptRef = useRef('');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopEverything();
    };
  }, []);

  const stopEverything = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try { mediaRecorderRef.current.stop(); } catch {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    setTranscript('');
    transcriptRef.current = '';
    setTimeLeft(DEMO_DURATION);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Start MediaRecorder (we record but don't upload in demo)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recorder.start(1000);

      // Start Web Speech API for live transcription
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          let finalText = '';
          let interimText = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              finalText += event.results[i][0].transcript + ' ';
            } else {
              interimText += event.results[i][0].transcript;
            }
          }
          const fullText = finalText + interimText;
          setTranscript(fullText);
          transcriptRef.current = fullText;
        };

        recognition.onerror = () => {};
        recognition.start();
        recognitionRef.current = recognition;
      }

      setStep('recording');

      // Countdown timer — auto-stop after DEMO_DURATION
      let remaining = DEMO_DURATION;
      timerRef.current = setInterval(() => {
        remaining--;
        setTimeLeft(remaining);
        if (remaining <= 0) {
          finishRecording();
        }
      }, 1000);
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        alert('Microphone access is required for the demo. Please allow microphone access.');
      }
    }
  }, []);

  const finishRecording = useCallback(() => {
    stopEverything();
    setStep('processing');

    const capturedTranscript = transcriptRef.current;

    // Try to call the real AI endpoint
    processWithAI(capturedTranscript);
  }, []);

  const processWithAI = async (rawTranscript: string) => {
    // If transcript is empty, use mock data
    if (!rawTranscript || !rawTranscript.trim()) {
      setTimeout(() => {
        setObservations(ENHANCED_MOCK_OBSERVATIONS);
        setTranscript('(No speech detected - showing sample observations)');
        setStep('results');
        setTimeout(() => setShowSignupModal(true), 3000);
      }, 1500);
      return;
    }

    try {
      const response = await fetch('/api/ai/segment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: rawTranscript,
          teamId: DEMO_TEAM_CONTEXT.teamId,
          demo: true,
          demoRoster: DEMO_TEAM_CONTEXT.roster,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        if (result.observations && result.observations.length > 0) {
          setObservations(
            result.observations.map((obs: any) => ({
              player_name: obs.player_name,
              category: obs.category,
              sentiment: obs.sentiment,
              text: obs.text,
              stats: obs.stats || null,
              tendency: obs.tendency || null,
            }))
          );
          setStep('results');
          setTimeout(() => setShowSignupModal(true), 3000);
          return;
        }
      }
    } catch {
      // AI not available, fall through to mock
    }

    // Fallback: use enhanced mock data
    setTimeout(() => {
      setObservations(ENHANCED_MOCK_OBSERVATIONS);
      setStep('results');
      setTimeout(() => setShowSignupModal(true), 3000);
    }, 1500);
  };

  const handleTextSubmit = () => {
    if (!textInput.trim()) return;
    setTranscript(textInput.trim());
    transcriptRef.current = textInput.trim();
    setStep('processing');
    processWithAI(textInput.trim());
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  const getSentimentEmoji = (s: string) =>
    s === 'positive' ? '+" ' : s === 'needs-work' ? '!' : '-';

  // -- INTRO SCREEN --
  if (step === 'intro') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="mx-auto max-w-lg text-center">
          <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300 mb-8 inline-block">
            &larr; Back
          </Link>

          <Badge variant="warning" className="mb-4">Demo Mode</Badge>

          <h1 className="text-3xl font-bold text-zinc-100 mb-3">
            Try CourtIQ Voice Capture
          </h1>
          <p className="text-zinc-400 mb-2">
            Tap the mic and talk about your players for 20 seconds.
          </p>
          <p className="text-sm text-zinc-500 mb-8">
            Say things like: &ldquo;Marcus had a great cut to the basket&rdquo; or &ldquo;Jayden needs to work on his closeouts&rdquo;
          </p>

          {/* Demo roster */}
          <Card className="mb-8 text-left">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400">Demo Roster (mention these names)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {DEMO_TEAM_CONTEXT.roster.map((p) => (
                  <span
                    key={p.name}
                    className="rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-300"
                  >
                    #{p.jersey_number} {p.name} <span className="text-zinc-500">({p.position})</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Big mic button */}
          <button
            onClick={startRecording}
            className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-orange-500 shadow-lg shadow-orange-500/30 transition-all hover:bg-orange-600 hover:shadow-orange-500/50 active:scale-95"
          >
            <Mic className="h-12 w-12 text-white" />
          </button>
          <p className="mt-4 text-sm text-zinc-500">Tap to start 20-second recording</p>

          {/* Or type */}
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-px flex-1 bg-zinc-800" />
              <span className="text-xs text-zinc-600">or type coaching notes</span>
              <div className="h-px flex-1 bg-zinc-800" />
            </div>
            <Textarea
              placeholder="Marcus had a great cut to the basket. Jayden needs work on his closeouts..."
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              rows={3}
              className="mb-3"
            />
            {textInput.trim() && (
              <Button onClick={handleTextSubmit} className="w-full">
                <Sparkles className="h-4 w-4 mr-1" />
                Process with AI
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -- RECORDING SCREEN --
  if (step === 'recording') {
    const progress = ((DEMO_DURATION - timeLeft) / DEMO_DURATION) * 100;

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="mx-auto max-w-lg w-full">
          <Badge variant="warning" className="mb-6 mx-auto block w-fit">Demo Mode</Badge>

          {/* Timer ring */}
          <div className="flex flex-col items-center mb-8">
            <div className="relative">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#27272a" strokeWidth="6" />
                <circle
                  cx="60" cy="60" r="52" fill="none"
                  stroke="#f97316" strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 52}`}
                  strokeDashoffset={`${2 * Math.PI * 52 * (1 - progress / 100)}`}
                  className="transition-all duration-1000"
                />
              </svg>
              <button
                onClick={finishRecording}
                className="absolute inset-0 flex flex-col items-center justify-center"
              >
                <MicOff className="h-8 w-8 text-red-400 mb-1" />
                <span className="text-2xl font-bold text-zinc-100 tabular-nums">
                  {formatTime(timeLeft)}
                </span>
              </button>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
              <span className="text-sm text-red-400 font-medium">Recording...</span>
            </div>
            <p className="text-xs text-zinc-500 mt-2">Tap the icon to stop early</p>
          </div>

          {/* Live transcript */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-zinc-400 flex items-center gap-2">
                <div className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                Live Transcript
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="min-h-[4rem] text-sm leading-relaxed text-zinc-300">
                {transcript || (
                  <span className="italic text-zinc-600">Listening... start talking about your players</span>
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // -- PROCESSING SCREEN --
  if (step === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="relative mx-auto mb-6 h-16 w-16">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
            <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-orange-500 animate-pulse" />
          </div>
          <h2 className="text-xl font-semibold text-zinc-100">AI is analyzing your coaching...</h2>
          <p className="text-sm text-zinc-400 mt-2">Identifying players, categorizing observations, and extracting insights</p>
          <div className="mt-6 flex flex-col gap-1 text-xs text-zinc-600">
            <span className="animate-pulse">Matching player names from transcript...</span>
          </div>
        </div>
      </div>
    );
  }

  // -- RESULTS SCREEN --
  if (step === 'results') {
    return (
      <div className="min-h-screen bg-zinc-950 p-4 pb-32">
        <div className="mx-auto max-w-lg">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-bold text-zinc-100">AI-Parsed Observations</h1>
            <Badge variant="success">{observations.length} found</Badge>
          </div>

          {/* Transcript card */}
          {transcript && (
            <Card className="mb-4 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-zinc-500">Your transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-400 italic">&ldquo;{transcript}&rdquo;</p>
              </CardContent>
            </Card>
          )}

          {/* Observation cards */}
          <div className="space-y-3 mb-6">
            {observations.map((obs, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500/20 text-sm font-bold text-orange-500">
                        {obs.player_name[0]}
                      </div>
                      <div>
                        <span className="font-medium text-zinc-100">{obs.player_name}</span>
                      </div>
                    </div>
                    <Badge
                      variant={obs.sentiment === 'positive' ? 'success' : 'warning'}
                      className="text-xs"
                    >
                      {obs.sentiment === 'positive' ? '+' : '!'} {obs.category}
                    </Badge>
                  </div>
                  <p className="text-sm text-zinc-300 leading-relaxed">{obs.text}</p>

                  {/* Stats */}
                  {obs.stats && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {Object.entries(obs.stats).map(([key, val]) => (
                        <span
                          key={key}
                          className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400"
                        >
                          {val} {key}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Tendency */}
                  {obs.tendency && (
                    <p className="mt-2 text-xs text-amber-400/80 italic">
                      Tendency: {obs.tendency}
                    </p>
                  )}

                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="ghost" className="text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Confirm
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs">
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs text-red-400">
                      <Trash2 className="h-3 w-3 mr-1" />
                      Discard
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* CTA card */}
          <Card className="border-orange-500/30 bg-orange-500/5">
            <CardContent className="p-6 text-center">
              <Sparkles className="mx-auto h-8 w-8 text-orange-500 mb-3" />
              <h3 className="font-semibold text-lg text-zinc-100">Like what you see?</h3>
              <p className="text-sm text-zinc-400 mt-1 mb-4">
                Sign up free to save observations, track player progress, generate AI practice plans, and share reports with parents.
              </p>
              <Link href="/signup">
                <Button size="lg" className="w-full">
                  Create free account <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <Link href="/login" className="mt-3 block text-sm text-zinc-500 hover:text-zinc-300">
                Already have an account? Sign in
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* Signup enforcement modal */}
        {showSignupModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="relative w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
              <button
                onClick={() => setShowSignupModal(false)}
                className="absolute right-3 top-3 rounded-full p-1 text-zinc-500 hover:text-zinc-300"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex flex-col items-center text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/20">
                  <Lock className="h-7 w-7 text-orange-500" />
                </div>
                <h3 className="text-xl font-bold text-zinc-100">
                  Create a free account to save your observations
                </h3>
                <p className="mt-2 text-sm text-zinc-400 max-w-xs">
                  Track player progress over time, generate practice plans, and share development reports with parents.
                </p>

                <div className="mt-6 w-full space-y-3">
                  <Link href="/signup" className="block">
                    <Button size="lg" className="w-full">
                      Sign up free <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </Link>
                  <Link href="/login" className="block">
                    <Button variant="outline" size="lg" className="w-full">
                      I already have an account
                    </Button>
                  </Link>
                </div>

                <p className="mt-4 text-xs text-zinc-600">
                  No credit card required. Free for individual coaches.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
