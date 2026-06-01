'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Save, Loader2, LogOut, User, Mail } from 'lucide-react';
import { isParentDigestEnabled, enableParentDigest, disableParentDigest } from '@/lib/parent-digest-utils';
import { isDigestDisabled } from '@/lib/weekly-digest-utils';
import { isReminderDisabled } from '@/lib/practice-reminder-utils';
import { isCoachPaused } from '@/lib/coach-pause-utils';
import { SundayPlanPromptToggle } from '@/components/settings/sunday-plan-prompt-toggle';
import { SilentPlayerNudgeToggle } from '@/components/settings/silent-player-nudge-toggle';
import Link from 'next/link';

export default function ProfileSettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [autoParentDigest, setAutoParentDigest] = useState(false);
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestSaved, setDigestSaved] = useState(false);
  const [weeklyDigestEnabled, setWeeklyDigestEnabled] = useState(true);
  const [weeklyDigestSaving, setWeeklyDigestSaving] = useState(false);
  const [weeklyDigestSaved, setWeeklyDigestSaved] = useState(false);
  const [practiceReminderEnabled, setPracticeReminderEnabled] = useState(true);
  const [practiceReminderSaving, setPracticeReminderSaving] = useState(false);
  const [practiceReminderSaved, setPracticeReminderSaved] = useState(false);
  const [unpauseSaving, setUnpauseSaving] = useState(false);

  const { data: meData, isLoading } = useQuery({
    queryKey: queryKeys.coach.current(),
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.coach;
    },
  });
  const coach = meData;

  useEffect(() => {
    if (coach && !initialized) {
      setFullName(coach.full_name || '');
      setEmail(coach.email || '');
      setAvatarUrl(coach.avatar_url || '');
      setAutoParentDigest(isParentDigestEnabled(coach.preferences));
      setWeeklyDigestEnabled(!isDigestDisabled(coach.preferences));
      setPracticeReminderEnabled(!isReminderDisabled(coach.preferences));
      setInitialized(true);
    }
  }, [coach, initialized]);

  async function toggleAutoParentDigest(enabled: boolean) {
    if (!coach) return;
    setDigestSaving(true);
    setDigestSaved(false);
    const newPrefs = enabled
      ? enableParentDigest(coach.preferences)
      : disableParentDigest(coach.preferences);
    try {
      await mutate({
        table: 'coaches',
        operation: 'update',
        data: { preferences: newPrefs },
        filters: { id: coach.id },
      });
      setAutoParentDigest(enabled);
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
      setDigestSaved(true);
      setTimeout(() => setDigestSaved(false), 2500);
    } finally {
      setDigestSaving(false);
    }
  }

  async function toggleWeeklyDigest(enabled: boolean) {
    if (!coach) return;
    setWeeklyDigestSaving(true);
    setWeeklyDigestSaved(false);
    const prefs = coach.preferences ?? {};
    const newPrefs = enabled
      ? Object.fromEntries(Object.entries({ ...prefs }).filter(([k]) => k !== 'disable_weekly_digest'))
      : { ...prefs, disable_weekly_digest: true };
    try {
      await mutate({
        table: 'coaches',
        operation: 'update',
        data: { preferences: newPrefs },
        filters: { id: coach.id },
      });
      setWeeklyDigestEnabled(enabled);
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
      setWeeklyDigestSaved(true);
      setTimeout(() => setWeeklyDigestSaved(false), 2500);
    } finally {
      setWeeklyDigestSaving(false);
    }
  }

  async function handleUnpause() {
    if (!coach) return;
    setUnpauseSaving(true);
    try {
      // Goes through `mutate()` per AGENTS.md rule 3. The /api/data/mutate
      // route enforces `filters.id === user.id` for the coaches table
      // (ticket 0042) so a forged coach_id cannot ride through.
      await mutate({
        table: 'coaches',
        operation: 'update',
        data: { paused_until: null },
        filters: { id: coach.id },
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
    } finally {
      setUnpauseSaving(false);
    }
  }

  async function togglePracticeReminder(enabled: boolean) {
    if (!coach) return;
    setPracticeReminderSaving(true);
    setPracticeReminderSaved(false);
    const prefs = coach.preferences ?? {};
    const newPrefs = enabled
      ? Object.fromEntries(Object.entries({ ...prefs }).filter(([k]) => k !== 'disable_practice_reminders'))
      : { ...prefs, disable_practice_reminders: true };
    try {
      await mutate({
        table: 'coaches',
        operation: 'update',
        data: { preferences: newPrefs },
        filters: { id: coach.id },
      });
      setPracticeReminderEnabled(enabled);
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
      setPracticeReminderSaved(true);
      setTimeout(() => setPracticeReminderSaved(false), 2500);
    } finally {
      setPracticeReminderSaving(false);
    }
  }

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!coach) throw new Error('Not authenticated');

      await mutate({
        table: 'coaches',
        operation: 'update',
        data: {
          full_name: fullName,
          avatar_url: avatarUrl || null,
        },
        filters: { id: coach.id },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coach.current() });
    },
  });

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" aria-label="Back to settings">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Profile</h1>
          <p className="text-zinc-400 text-sm">Manage your personal information</p>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 w-20 rounded-full mx-auto" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <>
          {/* Avatar */}
          <div className="flex justify-center">
            <div className="relative">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={fullName}
                  className="h-20 w-20 rounded-full object-cover border-2 border-zinc-700"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-800 border-2 border-zinc-700 text-xl font-bold text-zinc-300">
                  {initials || <User className="h-8 w-8" />}
                </div>
              )}
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Personal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Full Name</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Email</label>
                <Input value={email} disabled className="opacity-60" />
                <p className="text-xs text-zinc-500">
                  Email cannot be changed here. Contact support to update.
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-300">Avatar URL</label>
                <Input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => updateMutation.mutate()}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Save Changes
                </Button>
              </div>

              {updateMutation.isSuccess && (
                <p className="text-xs text-emerald-400">Profile updated successfully.</p>
              )}
              {updateMutation.isError && (
                <p className="text-xs text-red-400">Failed to update profile. Please try again.</p>
              )}
            </CardContent>
          </Card>

          {/* Communication preferences */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-orange-400" />
                Communication
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Paused state — ticket 0042. Renders only when paused_until is
                  a real future timestamp. The unpause button POSTs through the
                  generic mutate() helper; the API route enforces ownership. */}
              {coach && isCoachPaused({ paused_until: coach.paused_until ?? null }) && (
                <div
                  className="rounded-lg border border-orange-500/40 bg-orange-500/5 p-3 flex items-start justify-between gap-4"
                  data-testid="coach-paused-banner"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100">
                      Paused until {new Date(coach.paused_until as string).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </p>
                    <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
                      We&#39;ve stopped the digest emails. Tap unpause when you&#39;re back.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={handleUnpause}
                    disabled={unpauseSaving}
                    aria-label="Unpause my account"
                  >
                    {unpauseSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Unpause'}
                  </Button>
                </div>
              )}

              {/* Auto parent progress emails */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">
                    Auto parent progress emails
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    Every Sunday, parents with an email on file automatically receive
                    their child&apos;s latest progress report link — no manual sharing needed.
                  </p>
                  {digestSaved && (
                    <p className="text-xs text-emerald-400 mt-1">Saved!</p>
                  )}
                </div>
                <button
                  role="switch"
                  aria-checked={autoParentDigest}
                  aria-label="Auto parent progress emails"
                  disabled={digestSaving}
                  onClick={() => toggleAutoParentDigest(!autoParentDigest)}
                  className={[
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50',
                    autoParentDigest ? 'bg-orange-500' : 'bg-zinc-700',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                      autoParentDigest ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>

              {/* Weekly coaching digest */}
              <div className="border-t border-zinc-800 pt-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">
                    Weekly coaching digest
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    Every Monday morning, get a personalised week-in-review email: observations, player spotlight, and top skill trend.
                  </p>
                  {weeklyDigestSaved && (
                    <p className="text-xs text-emerald-400 mt-1">Saved!</p>
                  )}
                </div>
                <button
                  role="switch"
                  aria-checked={weeklyDigestEnabled}
                  aria-label="Weekly coaching digest email"
                  disabled={weeklyDigestSaving}
                  onClick={() => toggleWeeklyDigest(!weeklyDigestEnabled)}
                  className={[
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50',
                    weeklyDigestEnabled ? 'bg-orange-500' : 'bg-zinc-700',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                      weeklyDigestEnabled ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>

              {/* Practice day reminders */}
              <div className="border-t border-zinc-800 pt-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200">
                    Practice day reminders
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">
                    On days you have a session scheduled, get a midday reminder with neglected players and last-session highlights.
                  </p>
                  {practiceReminderSaved && (
                    <p className="text-xs text-emerald-400 mt-1">Saved!</p>
                  )}
                </div>
                <button
                  role="switch"
                  aria-checked={practiceReminderEnabled}
                  aria-label="Practice day reminder emails"
                  disabled={practiceReminderSaving}
                  onClick={() => togglePracticeReminder(!practiceReminderEnabled)}
                  className={[
                    'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50',
                    practiceReminderEnabled ? 'bg-orange-500' : 'bg-zinc-700',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform',
                      practiceReminderEnabled ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>

              {/* Sunday planning prompt — ticket 0058. Mirrors the
                  practice-reminder row's shape; opt-out key
                  `disable_planning_prompts` lives in `coaches.preferences`
                  (no migration). */}
              {coach && (
                <SundayPlanPromptToggle
                  coachId={coach.id}
                  preferences={coach.preferences ?? {}}
                />
              )}

              {/* Silent-player nudge — ticket 0062. Mirrors the Sunday-plan-
                  prompt row's shape; opt-out key
                  `disable_silent_player_nudge` lives in `coaches.preferences`
                  (no migration). */}
              {coach && (
                <SilentPlayerNudgeToggle
                  coachId={coach.id}
                  preferences={coach.preferences ?? {}}
                />
              )}

              <p className="text-xs text-zinc-600 leading-relaxed border-t border-zinc-800 pt-3">
                Add parent emails in Roster → player cards to start sending auto parent emails.
                Requires a Coach plan or higher (parent sharing feature).
              </p>
            </CardContent>
          </Card>

          {/* Sign out */}
          <Card className="border-red-900/30">
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-sm">Sign Out</p>
                <p className="text-xs text-zinc-500">Sign out of your SportsIQ account</p>
              </div>
              <Button variant="destructive" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                Sign Out
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
