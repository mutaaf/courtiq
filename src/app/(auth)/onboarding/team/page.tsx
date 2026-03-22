'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';

export default function TeamSetupPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('8-10');
  const [season, setSeason] = useState('Spring 2026');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!teamName.trim()) return;
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: coach } = await supabase.from('coaches').select('org_id').eq('id', user.id).single();
    if (!coach) return;

    const { data: sport } = await supabase.from('sports').select('id').eq('slug', 'basketball').single();

    // Get default curriculum
    const { data: curriculum } = await supabase.from('curricula').select('id').eq('is_default', true).single();

    const { data: team } = await supabase.from('teams').insert({
      org_id: coach.org_id,
      sport_id: sport?.id,
      curriculum_id: curriculum?.id,
      name: teamName,
      age_group: ageGroup,
      season,
    }).select().single();

    if (team) {
      await supabase.from('team_coaches').insert({
        team_id: team.id,
        coach_id: user.id,
        role: 'head_coach',
      });
    }

    router.push('/onboarding/roster');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Create your team</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Team Name</label>
            <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} placeholder="Blue Tigers" />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Age Group</label>
            <select value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100">
              <option value="5-7">Mini Ballers (5-7)</option>
              <option value="8-10">Fundamentals (8-10)</option>
              <option value="11-13">Competitive Prep (11-13)</option>
              <option value="14-18">Advanced (14-18)</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Season</label>
            <Input value={season} onChange={(e) => setSeason(e.target.value)} placeholder="Spring 2026" />
          </div>
          <Button onClick={handleCreate} className="w-full" disabled={!teamName.trim() || loading} size="lg">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Create Team
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
