'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2 } from 'lucide-react';
import { trackEvent } from '@/lib/analytics';
import { useTeamLimitUpgradeSheet } from '@/hooks/use-team-limit-upgrade-sheet';
import { TeamLimitUpgradeSheet } from '@/components/team/team-limit-upgrade-sheet';

const SPORTS = [
  { slug: 'basketball', name: 'Basketball', icon: '🏀' },
  { slug: 'soccer', name: 'Soccer', icon: '⚽' },
  { slug: 'volleyball', name: 'Volleyball', icon: '🏐' },
  { slug: 'flag_football', name: 'Flag Football', icon: '🏈' },
  { slug: 'baseball', name: 'Baseball', icon: '⚾' },
  { slug: 'softball', name: 'Softball', icon: '🥎' },
  { slug: 'lacrosse', name: 'Lacrosse', icon: '🥍' },
  { slug: 'swimming', name: 'Swimming', icon: '🏊' },
  { slug: 'tennis', name: 'Tennis', icon: '🎾' },
  { slug: 'gymnastics', name: 'Gymnastics', icon: '🤸' },
];

const AGE_GROUPS = [
  { value: '5-7', label: 'Beginners (Ages 5–7)' },
  { value: '8-10', label: 'Juniors (Ages 8–10)' },
  { value: '11-13', label: 'Intermediate (Ages 11–13)' },
  { value: '14-18', label: 'Advanced (Ages 14–18)' },
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
  // Ticket 0086 — intercept the structured tier_limit_max_teams 4xx so the
  // contextual sheet renders instead of the flat error toast. The hook
  // surfaces the sheet body; any OTHER 4xx falls back to the existing toast.
  const { submit, sheetBody, closeSheet } = useTeamLimitUpgradeSheet();

  useEffect(() => {
    trackEvent('onboarding_started', { step: 'setup' });
  }, []);

  async function handleContinue() {
    if (!sport || !teamName.trim()) return;
    setLoading(true);
    setError('');

    const result = await submit({
      endpoint: '/api/auth/configure-team',
      body: {
        sportSlug: sport,
        teamName: teamName.trim(),
        ageGroup,
        season,
      },
    });

    if (result.ok) {
      trackEvent('onboarding_setup_submitted', { sport, age_group: ageGroup });
      router.push('/onboarding/roster');
      return;
    }

    // Tier-limit case: the sheet is now mounted via the hook's state.
    if ('sheet' in result) {
      trackEvent('onboarding_setup_failed', { reason: 'tier_limit_max_teams' });
      setLoading(false);
      return;
    }

    setError(result.error || 'Failed to create team');
    trackEvent('onboarding_setup_failed', { reason: result.error || 'unknown' });
    setLoading(false);
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
            <div className="grid grid-cols-2 gap-2">
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
      {sheetBody && <TeamLimitUpgradeSheet body={sheetBody} onClose={closeSheet} />}
    </div>
  );
}
