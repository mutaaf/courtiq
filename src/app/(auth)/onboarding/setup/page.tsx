'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';

const SPORTS = [
  { slug: 'basketball', name: 'Basketball', icon: '🏀' },
  { slug: 'flag_football', name: 'Flag Football', icon: '🏈' },
  { slug: 'soccer', name: 'Soccer', icon: '⚽' },
];

const AGE_GROUPS = [
  { value: '5-7', label: 'Mini Ballers (5-7)' },
  { value: '8-10', label: 'Fundamentals (8-10)' },
  { value: '11-13', label: 'Competitive Prep (11-13)' },
  { value: '14-18', label: 'Advanced (14-18)' },
];

function defaultSeason(): string {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  const phase = month <= 4 ? 'Spring' : month <= 7 ? 'Summer' : 'Fall';
  return `${phase} ${year}`;
}

export default function CombinedSetupPage() {
  const router = useRouter();
  const [sport, setSport] = useState<string | null>(null);
  const [teamName, setTeamName] = useState('');
  const [ageGroup, setAgeGroup] = useState('8-10');
  const [season, setSeason] = useState(defaultSeason());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    trackEvent('onboarding_started', { step: 'setup' });
  }, []);

  async function handleContinue() {
    if (!sport || !teamName.trim()) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/configure-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sportSlug: sport,
          teamName: teamName.trim(),
          ageGroup,
          season,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create team');
        trackEvent('onboarding_setup_failed', { reason: data.error || 'unknown' });
        setLoading(false);
        return;
      }

      trackEvent('onboarding_setup_submitted', {
        sport,
        age_group: ageGroup,
      });
      router.push('/onboarding/roster');
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  }

  const canSubmit = !!sport && teamName.trim().length > 0;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Set up your team</CardTitle>
          <p className="text-sm text-zinc-400">Sport, name, and age group — that&apos;s it.</p>
        </CardHeader>
        <CardContent className="space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Sport */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Sport</label>
            <div className="grid grid-cols-3 gap-2">
              {SPORTS.map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setSport(s.slug)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-4 transition-all active:scale-95 touch-manipulation ${
                    sport === s.slug
                      ? 'border-orange-500 bg-orange-500/10 ring-2 ring-orange-500/20'
                      : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  <span className="text-3xl">{s.icon}</span>
                  <span className="text-xs font-medium text-zinc-200">{s.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Team name */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Team Name</label>
            <Input
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="Blue Tigers"
              autoFocus
            />
          </div>

          {/* Age group */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Age Group</label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {AGE_GROUPS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>

          {/* Season */}
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">
              Season <span className="text-zinc-600">(optional)</span>
            </label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="Spring 2026"
            />
          </div>

          <Button
            onClick={handleContinue}
            disabled={!canSubmit || loading}
            size="lg"
            className="w-full"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Continue
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
