'use client';

import { useState } from 'react';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Megaphone,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import {
  expiryToDate,
  expiryLabel,
  sortByNewest,
  timeUntilExpiry,
  MAX_TITLE_LENGTH,
  MAX_BODY_LENGTH,
} from '@/lib/announcement-utils';
import type { TeamAnnouncement, AnnouncementExpiry } from '@/types/database';

const EXPIRY_OPTIONS: { value: AnnouncementExpiry; label: string }[] = [
  { value: '3d',    label: '3 days' },
  { value: '7d',    label: '7 days' },
  { value: '14d',   label: '2 weeks' },
  { value: 'never', label: 'No expiry' },
];

// ─── Create Form ──────────────────────────────────────────────────────────────

interface CreateFormProps {
  teamId: string;
  onClose: () => void;
  onCreated: () => void;
}

function CreateForm({ teamId, onClose, onCreated }: CreateFormProps) {
  const [title, setTitle]   = useState('');
  const [body, setBody]     = useState('');
  const [expiry, setExpiry] = useState<AnnouncementExpiry>('7d');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/team-announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          title: title.trim(),
          body: body.trim(),
          expires_at: expiryToDate(expiry),
        }),
      });
      if (!res.ok) {
        const { error: msg } = await res.json();
        throw new Error(msg || 'Failed to post announcement');
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Title <span className="text-zinc-500">({title.length}/{MAX_TITLE_LENGTH})</span>
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={MAX_TITLE_LENGTH}
          placeholder="No practice on Friday"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">
          Message <span className="text-zinc-500">({body.length}/{MAX_BODY_LENGTH})</span>
        </label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={MAX_BODY_LENGTH}
          rows={3}
          placeholder="Field is closed this week due to maintenance. Next practice Tuesday."
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1">Show parents for</label>
        <div className="flex flex-wrap gap-2">
          {EXPIRY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setExpiry(opt.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors touch-manipulation ${
                expiry === opt.value
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          disabled={saving || !title.trim() || !body.trim()}
          className="flex-1 bg-orange-500 hover:bg-orange-600 text-white h-11"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Post Announcement'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="h-11 px-4 text-zinc-400"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </form>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export function AnnouncementsPanel() {
  const { activeTeam } = useActiveTeam();
  const queryClient   = useQueryClient();
  const [expanded, setExpanded]       = useState(false);
  const [showForm, setShowForm]       = useState(false);
  const [deletingId, setDeletingId]   = useState<string | null>(null);
  const [justPosted, setJustPosted]   = useState(false);

  const queryKey = ['team-announcements', activeTeam?.id];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!activeTeam) return { announcements: [] };
      const res = await fetch(`/api/team-announcements?team_id=${activeTeam.id}`);
      if (!res.ok) return { announcements: [] };
      return res.json() as Promise<{ announcements: TeamAnnouncement[] }>;
    },
    enabled: !!activeTeam,
  });

  const announcements = sortByNewest(data?.announcements ?? []);
  const count = announcements.length;

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/team-announcements?id=${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey });
    } finally {
      setDeletingId(null);
    }
  }

  function handleCreated() {
    setJustPosted(true);
    queryClient.invalidateQueries({ queryKey });
    setTimeout(() => setJustPosted(false), 2500);
  }

  if (!activeTeam) return null;

  return (
    <Card>
      {/* Header — always visible */}
      <CardHeader
        className="cursor-pointer select-none py-4"
        onClick={() => { setExpanded((v) => !v); setShowForm(false); }}
        role="button"
        aria-expanded={expanded}
        aria-label="Team announcements panel"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-orange-500" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold">Team Announcements</CardTitle>
            {!isLoading && count > 0 && (
              <Badge className="bg-orange-500/20 text-orange-400 border-0 text-xs">
                {count}
              </Badge>
            )}
          </div>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          )}
        </div>
        {!expanded && (
          <p className="text-xs text-zinc-500 mt-0.5">
            Post updates that parents see in the portal
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-4 space-y-4">
          {/* Success flash */}
          {justPosted && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
              <p className="text-xs text-emerald-400">Announcement posted — parents will see it immediately.</p>
            </div>
          )}

          {/* Loading skeletons */}
          {isLoading && (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          )}

          {/* Announcement list */}
          {!isLoading && announcements.length === 0 && !showForm && (
            <p className="text-sm text-zinc-500 text-center py-4">
              No announcements yet. Post one to keep parents in the loop.
            </p>
          )}

          {!isLoading && announcements.map((ann) => (
            <div
              key={ann.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 flex gap-3 items-start"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-200 leading-snug">{ann.title}</p>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{ann.body}</p>
                <p className="text-xs text-zinc-600 mt-1.5">{timeUntilExpiry(ann)}</p>
              </div>
              <button
                onClick={() => handleDelete(ann.id)}
                disabled={deletingId === ann.id}
                aria-label={`Delete announcement: ${ann.title}`}
                className="shrink-0 p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors touch-manipulation active:scale-95 disabled:opacity-40"
              >
                {deletingId === ann.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  : <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                }
              </button>
            </div>
          ))}

          {/* Create form */}
          {showForm ? (
            <CreateForm
              teamId={activeTeam.id}
              onClose={() => setShowForm(false)}
              onCreated={handleCreated}
            />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowForm(true)}
              className="w-full border border-dashed border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 h-10 touch-manipulation"
              aria-label="Post new announcement"
            >
              <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
              Post Announcement
            </Button>
          )}
        </CardContent>
      )}
    </Card>
  );
}
