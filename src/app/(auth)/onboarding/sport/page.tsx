'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

const sports = [
  { slug: 'basketball', name: 'Basketball', icon: '🏀' },
  { slug: 'soccer', name: 'Soccer', icon: '⚽' },
];

export default function SportSelectionPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleContinue() {
    if (!selected) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: coach } = await supabase.from('coaches').select('org_id').eq('id', user.id).single();
    if (!coach) return;

    const { data: sport } = await supabase.from('sports').select('id').eq('slug', selected).single();
    if (sport) {
      await supabase.from('organizations').update({ sport_config: { default_sport_id: sport.id } }).eq('id', coach.org_id);
    }

    router.push('/onboarding/team');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-zinc-100">Choose your sport</h1>
          <p className="mt-2 text-zinc-400">We'll customize everything for your sport</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {sports.map((sport) => (
            <Card
              key={sport.slug}
              className={`cursor-pointer transition-all ${selected === sport.slug ? 'border-orange-500 ring-2 ring-orange-500/20' : 'hover:border-zinc-600'}`}
              onClick={() => setSelected(sport.slug)}
            >
              <CardContent className="flex flex-col items-center gap-2 p-6">
                <span className="text-4xl">{sport.icon}</span>
                <span className="font-medium">{sport.name}</span>
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
