'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { query, mutate } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Loader2, Trash2, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import type { Player } from '@/types/database';
import { SYSTEM_DEFAULTS } from '@/lib/config/defaults';

export default function EditPlayerPage({ params }: { params: Promise<{ playerId: string }> }) {
  const { playerId } = use(params);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showDelete, setShowDelete] = useState(false);
  const [form, setForm] = useState({
    name: '',
    nickname: '',
    position: 'Flex',
    jersey_number: '',
    age_group: '8-10',
    date_of_birth: '',
    parent_name: '',
    parent_email: '',
    parent_phone: '',
    notes: '',
    name_variants: '',
  });

  useEffect(() => {
    async function loadPlayer() {
      try {
        const player = await query<Player>({
          table: 'players',
          select: '*',
          filters: { id: playerId },
          single: true,
        });
        if (player) {
          setForm({
            name: player.name || '',
            nickname: player.nickname || '',
            position: player.position || 'Flex',
            jersey_number: player.jersey_number?.toString() || '',
            age_group: player.age_group || '8-10',
            date_of_birth: player.date_of_birth || '',
            parent_name: player.parent_name || '',
            parent_email: player.parent_email || '',
            parent_phone: player.parent_phone || '',
            notes: player.notes || '',
            name_variants: (player.name_variants || []).join(', '),
          });
        }
      } catch {
        setError('Failed to load player');
      } finally {
        setLoading(false);
      }
    }
    loadPlayer();
  }, [playerId]);

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');

    try {
      const variants = form.name_variants
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);

      await mutate({
        table: 'players',
        operation: 'update',
        filters: { id: playerId },
        data: {
          name: form.name.trim(),
          nickname: form.nickname.trim() || null,
          position: form.position,
          jersey_number: form.jersey_number ? parseInt(form.jersey_number, 10) : null,
          age_group: form.age_group,
          date_of_birth: form.date_of_birth || null,
          parent_name: form.parent_name.trim() || null,
          parent_email: form.parent_email.trim() || null,
          parent_phone: form.parent_phone.trim() || null,
          notes: form.notes.trim() || null,
          name_variants: variants.length > 0 ? variants : null,
        },
      });

      router.push(`/roster/${playerId}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    try {
      await mutate({
        table: 'players',
        operation: 'update',
        filters: { id: playerId },
        data: { is_active: false },
      });
      router.push('/roster');
      router.refresh();
    } catch {
      setError('Failed to remove player');
    }
  }

  if (loading) {
    return (
      <div className="p-4 lg:p-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 pb-8">
      <Link href={`/roster/${playerId}`} className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-4 w-4" /> Back to player
      </Link>

      <Card className="mt-4 max-w-lg">
        <CardHeader>
          <CardTitle>Edit Player</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Name *</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Nickname</label>
            <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="How the coach calls them" />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Name Variants (for voice recognition)</label>
            <Input value={form.name_variants} onChange={(e) => setForm({ ...form, name_variants: e.target.value })} placeholder="Comma separated: ah-mean, a mean" />
            <p className="text-xs text-zinc-500">Add how the name might sound in speech-to-text</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Position</label>
              <select
                value={form.position}
                onChange={(e) => setForm({ ...form, position: e.target.value })}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                {SYSTEM_DEFAULTS.sport.positions.map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Jersey #</label>
              <Input type="number" value={form.jersey_number} onChange={(e) => setForm({ ...form, jersey_number: e.target.value })} />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Age Group</label>
            <select
              value={form.age_group}
              onChange={(e) => setForm({ ...form, age_group: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {SYSTEM_DEFAULTS.sport.age_groups.map((ag) => (
                <option key={ag} value={ag}>{ag}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Birthday <span className="text-zinc-600">(optional)</span></label>
            <input
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
            />
            <p className="text-xs text-zinc-500">Used for birthday recognition on the home dashboard.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Parent Name</label>
            <Input value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Parent Email</label>
            <Input type="email" value={form.parent_email} onChange={(e) => setForm({ ...form, parent_email: e.target.value })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Parent Phone</label>
            <Input type="tel" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} />
          </div>

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Notes</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
            <Button variant="ghost" onClick={() => router.back()}>Cancel</Button>
          </div>

          <div className="border-t border-zinc-800 pt-4">
            {showDelete ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-red-400">Remove this player?</span>
                <Button size="sm" variant="destructive" onClick={handleDelete}>Yes, remove</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowDelete(false)}>Cancel</Button>
              </div>
            ) : (
              <Button variant="ghost" className="text-red-400 hover:text-red-300" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-4 w-4 mr-2" /> Remove Player
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
