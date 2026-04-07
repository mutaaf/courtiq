'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Mic, Users, ClipboardList, Share2, ChevronRight, Loader2 } from 'lucide-react';

const slides = [
  { icon: Mic, title: 'Capture observations', description: 'Record voice notes during practice. AI segments them into individual player observations.' },
  { icon: Users, title: 'Track player progress', description: "See each player's skill progression over time with curriculum-aligned report cards." },
  { icon: ClipboardList, title: 'Generate AI plans', description: 'Get curriculum-aware practice plans, game day sheets, and development cards.' },
  { icon: Share2, title: 'Share with parents', description: 'Send beautiful, interactive progress reports to parents with one tap.' },
];

export default function TutorialPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  async function handleFinish() {
    setLoading(true);
    try {
      await fetch('/api/auth/complete-onboarding', { method: 'POST' });
      router.push('/home');
      router.refresh();
    } catch {
      // Still redirect even if the API call fails
      router.push('/home');
      router.refresh();
    }
  }

  const slide = slides[step];
  const Icon = slide.icon;
  const isLast = step === slides.length - 1;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/20">
            <Icon className="h-8 w-8 text-orange-500" />
          </div>
          <h2 className="text-xl font-bold">{slide.title}</h2>
          <p className="mt-3 text-sm text-zinc-400">{slide.description}</p>
          <div className="mt-6 flex gap-1">
            {slides.map((_, i) => (
              <div key={i} className={`h-1.5 w-8 rounded-full ${i === step ? 'bg-orange-500' : 'bg-zinc-700'}`} />
            ))}
          </div>
          <div className="mt-8 flex w-full gap-3">
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)} className="flex-1">Back</Button>}
            {isLast ? (
              <Button onClick={handleFinish} className="flex-1" size="lg" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Get Started
              </Button>
            ) : (
              <Button onClick={() => setStep(step + 1)} className="flex-1" size="lg">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
