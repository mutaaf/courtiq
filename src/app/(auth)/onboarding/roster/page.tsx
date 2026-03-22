'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, Loader2 } from 'lucide-react';

export default function RosterSetupPage() {
  const router = useRouter();
  const [players, setPlayers] = useState<string[]>(['', '', '']);
  const [loading, setLoading] = useState(false);

  function addRow() { setPlayers([...players, '']); }
  function removeRow(i: number) { setPlayers(players.filter((_, j) => j !== i)); }
  function updateRow(i: number, val: string) { setPlayers(players.map((p, j) => j === i ? val : p)); }

  async function handleSave() {
    const names = players.filter((p) => p.trim());
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: teamCoach } = await supabase.from('team_coaches').select('team_id, teams(age_group)').eq('coach_id', user.id).limit(1).single();
    if (!teamCoach) { router.push('/onboarding/tutorial'); return; }

    if (names.length > 0) {
      await supabase.from('players').insert(
        names.map((name) => ({
          team_id: teamCoach.team_id,
          name,
          age_group: (teamCoach as any).teams?.age_group || '8-10',
        }))
      );
    }
    router.push('/onboarding/tutorial');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Add your players</CardTitle>
          <p className="text-sm text-zinc-400">You can always add more later</p>
        </CardHeader>
        <CardContent className="space-y-3">
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
