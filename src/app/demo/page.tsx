'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Mic, MicOff, Sparkles, ArrowRight, Check, Edit2, Trash2 } from 'lucide-react';
import Link from 'next/link';

// Demo mock data — simulates what AI would return
const DEMO_OBSERVATIONS = [
  { player_name: 'Marcus', category: 'Offense', sentiment: 'positive' as const, text: 'Great cut to the basket after the pass. Showed excellent timing and awareness.' },
  { player_name: 'Jayden', category: 'Defense', sentiment: 'needs-work' as const, text: 'Needs to work on closing out to shooters. Getting caught flat-footed on rotations.' },
  { player_name: 'Sofia', category: 'IQ', sentiment: 'positive' as const, text: 'Made a smart extra pass to the open player instead of forcing the shot. Great decision making.' },
  { player_name: 'Marcus', category: 'Effort', sentiment: 'positive' as const, text: 'Hustled back on defense after the turnover. Great effort and leadership.' },
];

type DemoStep = 'capture' | 'processing' | 'results' | 'signup';

export default function DemoPage() {
  const [step, setStep] = useState<DemoStep>('capture');
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [observations] = useState(DEMO_OBSERVATIONS);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startRef = useRef(0);
  const wordTimerRef = useRef<NodeJS.Timeout | null>(null);

  const SAMPLE_TRANSCRIPT = "Marcus had a great cut to the basket after the pass, really nice timing. Jayden needs to work on closing out, he's getting caught flat-footed. Sofia made a smart extra pass instead of forcing the shot. Marcus also hustled back on defense after the turnover.";

  const startRecording = useCallback(() => {
    setIsRecording(true);
    startRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);

    // Simulate transcript appearing
    const words = SAMPLE_TRANSCRIPT.split(' ');
    let i = 0;
    wordTimerRef.current = setInterval(() => {
      if (i < words.length) {
        i++;
        setTranscript(words.slice(0, i).join(' '));
      } else {
        if (wordTimerRef.current) clearInterval(wordTimerRef.current);
      }
    }, 150);
  }, [SAMPLE_TRANSCRIPT]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (wordTimerRef.current) clearInterval(wordTimerRef.current);
    setTranscript(SAMPLE_TRANSCRIPT);

    // Simulate AI processing
    setStep('processing');
    setTimeout(() => setStep('results'), 2000);
  }, [SAMPLE_TRANSCRIPT]);

  const handleProcessText = useCallback(() => {
    setStep('processing');
    setTimeout(() => setStep('results'), 2000);
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  if (step === 'capture') {
    return (
      <div className="min-h-screen bg-zinc-950 p-4">
        <div className="mx-auto max-w-lg">
          <div className="mb-6 flex items-center justify-between">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">← Back</Link>
            <Badge variant="warning">Demo Mode</Badge>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-xl font-bold text-zinc-100">Try Voice Capture</h1>
            <p className="text-sm text-zinc-400 mt-1">Tap the mic and talk about your players — or just tap to see a demo</p>
          </div>

          {/* Mic button */}
          <div className="flex justify-center mb-8">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={`flex h-24 w-24 items-center justify-center rounded-full transition-all ${
                isRecording
                  ? 'bg-red-500 shadow-lg shadow-red-500/30 animate-pulse'
                  : 'bg-orange-500 shadow-lg shadow-orange-500/30 hover:bg-orange-600'
              }`}
            >
              {isRecording ? <MicOff className="h-10 w-10 text-white" /> : <Mic className="h-10 w-10 text-white" />}
            </button>
          </div>

          {isRecording && (
            <p className="text-center text-sm text-red-400 mb-4">Recording... {formatTime(duration)}</p>
          )}

          {/* Transcript */}
          {transcript && (
            <Card className="mb-4">
              <CardHeader><CardTitle className="text-sm">Live Transcript</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-zinc-300">{transcript}</p>
              </CardContent>
            </Card>
          )}

          {!isRecording && !transcript && (
            <div className="text-center">
              <p className="text-xs text-zinc-500 mb-3">Or paste/type coaching notes:</p>
              <Textarea
                placeholder="Marcus had a great cut to the basket..."
                className="mb-3"
                rows={4}
                onChange={(e) => setTranscript(e.target.value)}
              />
            </div>
          )}

          {!isRecording && transcript && !isRecording && (
            <div className="text-center">
              <Button onClick={handleProcessText}>
                <Sparkles className="h-4 w-4 mr-1" /> Process with AI
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'processing') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <h2 className="text-lg font-semibold text-zinc-100">AI is parsing your observations...</h2>
          <p className="text-sm text-zinc-400 mt-2">Identifying players, categorizing, and structuring</p>
        </div>
      </div>
    );
  }

  if (step === 'results') {
    return (
      <div className="min-h-screen bg-zinc-950 p-4">
        <div className="mx-auto max-w-lg">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-bold text-zinc-100">AI-Parsed Observations</h1>
            <Badge variant="success">{observations.length} found</Badge>
          </div>

          <div className="space-y-3 mb-6">
            {observations.map((obs, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-500">
                        {obs.player_name[0]}
                      </div>
                      <span className="font-medium text-zinc-100">{obs.player_name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Badge variant={obs.sentiment === 'positive' ? 'success' : 'warning'} className="text-xs">
                        {obs.sentiment === 'positive' ? '👍' : '📝'} {obs.category}
                      </Badge>
                    </div>
                  </div>
                  <p className="text-sm text-zinc-300">{obs.text}</p>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" variant="ghost" className="text-xs"><Check className="h-3 w-3 mr-1" />Confirm</Button>
                    <Button size="sm" variant="ghost" className="text-xs"><Edit2 className="h-3 w-3 mr-1" />Edit</Button>
                    <Button size="sm" variant="ghost" className="text-xs text-red-400"><Trash2 className="h-3 w-3 mr-1" />Discard</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

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
      </div>
    );
  }

  return null;
}
