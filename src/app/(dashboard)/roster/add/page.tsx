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
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';

export default function AddPlayerPage() {
  const router = useRouter();
  const { activeTeam } = useActiveTeam();
  const queryClient = useQueryClient();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: '',
    nickname: '',
    position: SYSTEM_DEFAULTS.sport.positions[0],
    jersey_number: '',
    age_group: SYSTEM_DEFAULTS.sport.age_groups[0],
    parent_name: '',
    parent_email: '',
  });

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSave = async () => {
    if (!activeTeam) return;
    if (!form.name.trim()) {
      setError('Player name is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await mutate({
        table: 'players',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          name: form.name.trim(),
          nickname: form.nickname.trim() || null,
          position: form.position,
          jersey_number: form.jersey_number ? parseInt(form.jersey_number, 10) : null,
          age_group: form.age_group,
          parent_name: form.parent_name.trim() || null,
          parent_email: form.parent_email.trim() || null,
          is_active: true,
        },
      });

      await queryClient.invalidateQueries({
        queryKey: queryKeys.players.all(activeTeam.id),
      });

      router.push('/roster');
    } catch (err: any) {
      setError(err.message || 'Failed to save player.');
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 lg:p-8">
      {/* Back link */}
      <Link
        href="/roster"
        className="inline-flex items-center gap-1 text-sm text-zinc-400 transition-colors hover:text-zinc-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Roster
      </Link>

      <h1 className="text-2xl font-bold text-zinc-100">Add Player</h1>

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
              placeholder="Optional nickname"
              value={form.nickname}
              onChange={(e) => updateField('nickname', e.target.value)}
            />
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
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {saving ? 'Saving...' : 'Save Player'}
        </Button>
      </div>
    </div>
  );
}
