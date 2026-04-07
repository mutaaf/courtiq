'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Loader2, AlertCircle } from 'lucide-react';

export default function RosterSetupPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<string[]>(['', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addRow() { setPlayers([...players, '']); }
  function removeRow(i: number) { setPlayers(players.filter((_, j) => j !== i)); }
  function updateRow(i: number, val: string) { setPlayers(players.map((p, j) => j === i ? val : p)); }

  async function handleSave() {
    const names = players.filter((p) => p.trim());
    setLoading(true);
    setError('');

    try {
      if (names.length > 0) {
        const res = await fetch('/api/auth/add-players', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerNames: names }),
        });

        if (!res.ok) {
          const data = await res.json();
          setError(data.error || 'Failed to add players');
          setLoading(false);
          return;
        }
      }

      router.push('/onboarding/tutorial');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Add your players</CardTitle>
          <p className="text-sm text-zinc-400">You can always add more later</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
          {players.map((name, i) => (
            <div key={i} className="flex gap-2">
              <Input value={name} onChange={(e) => updateRow(i, e.target.value)} placeholder={`Player ${i + 1}`} />
              {players.length > 1 && (
                <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button variant="ghost" onClick={addRow} className="w-full"><Plus className="h-4 w-4 mr-2" />Add Player</Button>
          <div className="flex gap-2 pt-4">
            <Button variant="ghost" onClick={() => router.push('/onboarding/tutorial')} className="flex-1">Skip</Button>
            <Button onClick={handleSave} disabled={loading} className="flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Save & Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
