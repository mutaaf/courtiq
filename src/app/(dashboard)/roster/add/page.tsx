'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQueryClient } from '@tanstack/react-query';
import { mutate } from '@/lib/api';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Loader2, Shield, Users, UserPlus, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';
import { trackEvent } from '@/lib/analytics';

type Mode = 'single' | 'paste';

export default function AddPlayerPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('single');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Single player form ───────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    nickname: '',
    name_variants: '',
    position: SYSTEM_DEFAULTS.sport.positions[0],
    jersey_number: '',
    age_group: SYSTEM_DEFAULTS.sport.age_groups[0],
    date_of_birth: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
  });

  // ── Paste roster state ───────────────────────────────────────────────────
  const [pasteText, setPasteText] = useState('');
  const [savedCount, setSavedCount] = useState<number | null>(null);

  const parsedNames = pasteText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 80);

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  // ── Single save ──────────────────────────────────────────────────────────
  const handleSaveSingle = async () => {
    if (!activeTeam) return;
    if (!form.name.trim()) {
      setError('Player name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const nameVariants = form.name_variants
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      await mutate({
        table: 'players',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          name: form.name.trim(),
          nickname: form.nickname.trim() || null,
          name_variants: nameVariants.length > 0 ? nameVariants : null,
          position: form.position,
          jersey_number: form.jersey_number ? parseInt(form.jersey_number, 10) : null,
          age_group: form.age_group,
          date_of_birth: form.date_of_birth || null,
          parent_name: form.parent_name.trim() || null,
          parent_email: form.parent_email.trim() || null,
          parent_phone: form.parent_phone.trim() || null,
          is_active: true,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: queryKeys.players.all(activeTeam.id),
      });

      trackEvent('player_added', {
        has_jersey: !!form.jersey_number,
        has_parent_contact: !!(form.parent_email || form.parent_name),
        method: 'single',
      });

      router.push('/roster');
    } catch (err: any) {
      setError(err.message || 'Failed to save player.');
    } finally {
      setSaving(false);
    }
  };

  // ── Paste save ───────────────────────────────────────────────────────────
  const handleSavePaste = async () => {
    if (!activeTeam) return;
    if (parsedNames.length === 0) {
      setError('Enter at least one player name (one per line).');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await Promise.all(
        parsedNames.map((name) =>
          mutate({
            table: 'players',
            operation: 'insert',
            data: {
              team_id: activeTeam.id,
              name,
              age_group: SYSTEM_DEFAULTS.sport.age_groups[0],
              is_active: true,
            },
          })
        )
      );

      await queryClient.invalidateQueries({
        queryKey: queryKeys.players.all(activeTeam.id),
      });

      trackEvent('players_bulk_added', {
        count: parsedNames.length,
        method: 'paste',
      });

      setSavedCount(parsedNames.length);
    } catch (err: any) {
      setError(err.message || 'Failed to save players.');
    } finally {
      setSaving(false);
    }
  };

  if (!activeTeam) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <h2 className="text-lg font-semibold text-zinc-300">No Active Team</h2>
        <p className="mt-1 text-sm text-zinc-500">Select a team first.</p>
      </div>
    );
  }

  // ── Success screen after paste save ─────────────────────────────────────
  if (savedCount !== null) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8 pb-36">
        <Link
          href="/roster"
          className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Roster
        </Link>
        <div className="flex flex-col items-center gap-6 py-10 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-500/15">
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-100">
              {savedCount} player{savedCount !== 1 ? 's' : ''} added!
            </h2>
            <p className="mt-2 text-sm text-zinc-400">
              You can now add jersey numbers and parent contacts from each player&apos;s profile.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <Link href="/roster">
              <Button className="w-full sm:w-auto h-12 sm:h-10">
                <Users className="h-4 w-4" />
                View Roster
              </Button>
            </Link>
            <Button
              variant="outline"
              className="w-full sm:w-auto h-12 sm:h-10"
              onClick={() => {
                setSavedCount(null);
                setPasteText('');
                setError(null);
              }}
            >
              <UserPlus className="h-4 w-4" />
              Add More
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8 pb-36">
      {/* Back link */}
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Roster
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100">Add Player{mode === 'paste' ? 's' : ''}</h1>

      {/* Mode toggle */}
      <div className="flex rounded-xl border border-zinc-800 bg-zinc-900 p-1 gap-1">
        <button
          onClick={() => { setMode('single'); setError(null); }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors touch-manipulation ${
            mode === 'single'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UserPlus className="h-4 w-4" />
          Add One
        </button>
        <button
          onClick={() => { setMode('paste'); setError(null); }}
          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors touch-manipulation ${
            mode === 'paste'
              ? 'bg-orange-500 text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users className="h-4 w-4" />
          Paste Roster
        </button>
      </div>

      {/* ── Paste mode ── */}
      {mode === 'paste' ? (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400">
              Player data is stored securely and only visible to authorized coaches. No accounts are created for minors.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paste Your Roster</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-zinc-400 leading-relaxed">
                Paste your full player list — one name per line. Copy from an email, league website, or Google Doc.
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => { setPasteText(e.target.value); setError(null); }}
                placeholder={'Marcus Johnson\nSarah Williams\nJordan Lee\n...'}
                rows={10}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">
                  {parsedNames.length > 0
                    ? <span className="text-orange-400 font-medium">{parsedNames.length} player{parsedNames.length !== 1 ? 's' : ''} detected</span>
                    : 'Enter one name per line'}
                </span>
                {parsedNames.length > 0 && (
                  <button
                    onClick={() => setPasteText('')}
                    className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Preview of detected names */}
              {parsedNames.length > 0 && parsedNames.length <= 20 && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-2">Preview</p>
                  <div className="flex flex-wrap gap-1.5">
                    {parsedNames.map((name, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-full bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-zinc-500">
                Jersey numbers, positions, and parent contacts can be added from each player&apos;s profile after import.
              </p>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link href="/roster">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button
              onClick={handleSavePaste}
              disabled={saving || parsedNames.length === 0}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              {saving
                ? `Adding ${parsedNames.length} player${parsedNames.length !== 1 ? 's' : ''}…`
                : `Add ${parsedNames.length > 0 ? parsedNames.length + ' ' : ''}Player${parsedNames.length !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </>
      ) : (
        /* ── Single player mode ── */
        <>
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <Shield className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-400">
              Player data is stored securely and only visible to authorized coaches. No accounts are created for minors.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Player Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Name */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">
                  Name <span className="text-red-400">*</span>
                </label>
                <Input
                  placeholder="Full name"
                  value={form.name}
                  onChange={(e) => updateField('name', e.target.value)}
                />
              </div>

              {/* Nickname */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">Nickname</label>
                <Input
                  placeholder="e.g. AJ, Mikey"
                  value={form.nickname}
                  onChange={(e) => updateField('nickname', e.target.value)}
                />
              </div>

              {/* Voice recognition variants */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">
                  Voice Recognition Variants <span className="text-zinc-500 font-normal">(optional)</span>
                </label>
                <Input
                  placeholder="Comma separated: duh-shawn, da-shon"
                  value={form.name_variants}
                  onChange={(e) => updateField('name_variants', e.target.value)}
                />
                <p className="text-[11px] text-zinc-500">Add phonetic spellings so voice capture recognizes this player by name.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Position */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">Position</label>
                  <select
                    value={form.position}
                    onChange={(e) => updateField('position', e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    {SYSTEM_DEFAULTS.sport.positions.map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Jersey Number */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-zinc-300">Jersey Number</label>
                  <Input
                    type="number"
                    placeholder="#"
                    min={0}
                    max={99}
                    value={form.jersey_number}
                    onChange={(e) => updateField('jersey_number', e.target.value)}
                  />
                </div>
              </div>

              {/* Age Group */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">Age Group</label>
                <select
                  value={form.age_group}
                  onChange={(e) => updateField('age_group', e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                >
                  {SYSTEM_DEFAULTS.sport.age_groups.map((ag) => (
                    <option key={ag} value={ag}>
                      {ag}
                    </option>
                  ))}
                </select>
              </div>

              {/* Birthday */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">Birthday <span className="text-zinc-500 font-normal">(optional)</span></label>
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => updateField('date_of_birth', e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                />
                <p className="text-[11px] text-zinc-500">Used for birthday recognition cards and age-appropriate coaching tips.</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Parent / Guardian</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">Parent Name</label>
                <Input
                  placeholder="Parent or guardian name"
                  value={form.parent_name}
                  onChange={(e) => updateField('parent_name', e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">Parent Email</label>
                <Input
                  type="email"
                  placeholder="parent@example.com"
                  value={form.parent_email}
                  onChange={(e) => updateField('parent_email', e.target.value)}
                />
                <p className="text-[11px] text-zinc-500">
                  Used for sharing progress reports. By providing this, you confirm parental consent to share this child&apos;s progress data.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-300">Parent Phone <span className="text-zinc-500 font-normal">(optional)</span></label>
                <Input
                  type="tel"
                  placeholder="+1 (555) 000-0000"
                  value={form.parent_phone}
                  onChange={(e) => updateField('parent_phone', e.target.value)}
                />
                <p className="text-[11px] text-zinc-500">Used to send player updates directly via WhatsApp after practice.</p>
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Link href="/roster">
              <Button variant="outline">Cancel</Button>
            </Link>
            <Button onClick={handleSaveSingle} disabled={saving}>
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? 'Saving...' : 'Save Player'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
