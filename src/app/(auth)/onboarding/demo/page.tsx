'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Sparkles, Loader2, AlertCircle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { trackEvent } from '@/lib/analytics';

export default function DemoOnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setLoading(true);
    setError(null);
    trackEvent('onboarding_demo_started');

    try {
      const res = await fetch('/api/auth/seed-demo', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to seed demo team');
      }
      const data = await res.json();
      trackEvent('onboarding_demo_succeeded', {
        reused: !!data.reused,
        team_id: data.teamId ?? null,
      });
      router.push('/home');
      router.refresh();
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'unknown';
      trackEvent('onboarding_demo_failed', { reason });
      setError(reason);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center p-8 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-500/15 border border-orange-500/30">
            <Sparkles className="h-8 w-8 text-orange-400" />
          </div>

          <h1 className="text-2xl font-bold">Try SportsIQ in 30 seconds</h1>
          <p className="mt-3 text-sm text-zinc-400 max-w-sm leading-relaxed">
            We&apos;ll create a fully-loaded demo team — 8 fictional players, two practice
            sessions, real observations, even an AI-generated practice plan. No real data
            required.
          </p>

          <ul className="mt-6 w-full space-y-2 text-left text-sm text-zinc-300">
            <li className="flex gap-2">
              <span className="mt-0.5 text-orange-400">✓</span>
              <span>See the dashboard with realistic numbers</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-orange-400">✓</span>
              <span>Try the voice capture flow on demo players</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-0.5 text-orange-400">✓</span>
              <span>Generate plans, share-ready reports, and more</span>
            </li>
          </ul>

          {error && (
            <div className="mt-5 flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-left text-xs text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <Button
            onClick={handleStart}
            disabled={loading}
            size="lg"
            className="mt-6 w-full"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Start the demo team
            <ArrowRight className="h-4 w-4" />
          </Button>

          <Link
            href="/onboarding/setup"
            className="mt-3 text-xs text-zinc-500 hover:text-zinc-300 underline-offset-2 hover:underline"
          >
            Skip — set up my real team
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
