'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const sports = [
  { slug: 'basketball', name: 'Basketball', icon: '🏀' },
  { slug: 'flag_football', name: 'Flag Football', icon: '🏈' },
  { slug: 'soccer', name: 'Soccer', icon: '⚽' },
];

export default function SportSelectionPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleContinue() {
    if (!selected) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/select-sport', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sportSlug: selected }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to select sport');
        setLoading(false);
        return;
      }

      router.push('/onboarding/team');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Choose your sport</h1>
          <p className="mt-2 text-zinc-400">We&apos;ll customize everything for your sport</p>
        </div>
        {error && (
          <div className="rounded-lg bg-red-500/10 p-3 text-center text-sm text-red-400">{error}</div>
        )}
        <div className="grid grid-cols-3 gap-4">
          {sports.map((sport) => (
            <Card
              key={sport.slug}
              className={`cursor-pointer transition-all ${selected === sport.slug ? 'border-orange-500 ring-2 ring-orange-500/20' : 'hover:border-zinc-600'}`}
              onClick={() => setSelected(sport.slug)}
            >
              <CardContent className="flex flex-col items-center gap-2 p-6">
                <span className="text-4xl">{sport.icon}</span>
                <span className="text-sm font-medium">{sport.name}</span>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button onClick={handleContinue} className="w-full" disabled={!selected || loading} size="lg">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
