'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StickyNote,
  Pin,
  PinOff,
  Trash2,
  Plus,
  Pencil,
  X,
  Check,
  Lock,
  Loader2,
  Search,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { sortNotes, truncateNote, searchNotes, isValidNoteContent, MAX_NOTE_LENGTH } from '@/lib/player-notes-utils';
import type { PlayerNote } from '@/types/database';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotesResponse {
  notes: PlayerNote[];
}

interface Props {
  playerId: string;
  teamId: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PlayerNotesPanel({ playerId, teamId }: Props) {
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when composing opens
  useEffect(() => {
    if (composing) {
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [composing]);

  useEffect(() => {
    if (editingId) {
      setTimeout(() => editTextareaRef.current?.focus(), 60);
    }
  }, [editingId]);

  // ─── Query ──────────────────────────────────────────────────────────────────

  const { data, isLoading } = useQuery<NotesResponse>({
    queryKey: queryKeys.playerNotes.player(playerId),
    queryFn: async () => {
      const res = await fetch(`/api/player-notes?player_id=${playerId}`);
      if (!res.ok) throw new Error('Failed to load notes');
      return res.json();
    },
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
  });

  const notes = sortNotes(data?.notes ?? []);
  const filtered = searchNotes(notes, searchQuery);

  // ─── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async (content: string) => {
      const res = await fetch('/api/player-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player_id: playerId, team_id: teamId, content }),
      });
      if (!res.ok) throw new Error('Failed to create note');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.playerNotes.player(playerId) });
      setDraft('');
      setComposing(false);
    },
  });

  const patchMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: { content?: string; pinned?: boolean } }) => {
      const res = await fetch(`/api/player-notes?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update note');
      return res.json();
    },
    onMutate: async ({ id, updates }) => {
      await qc.cancelQueries({ queryKey: queryKeys.playerNotes.player(playerId) });
      const prev = qc.getQueryData<NotesResponse>(queryKeys.playerNotes.player(playerId));
      qc.setQueryData<NotesResponse>(queryKeys.playerNotes.player(playerId), old => ({
        notes: (old?.notes ?? []).map(n =>
          n.id === id ? { ...n, ...updates, updated_at: new Date().toISOString() } : n
        ),
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.playerNotes.player(playerId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.playerNotes.player(playerId) });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/player-notes?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
      return res.json();
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: queryKeys.playerNotes.player(playerId) });
      const prev = qc.getQueryData<NotesResponse>(queryKeys.playerNotes.player(playerId));
      qc.setQueryData<NotesResponse>(queryKeys.playerNotes.player(playerId), old => ({
        notes: (old?.notes ?? []).filter(n => n.id !== id),
      }));
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKeys.playerNotes.player(playerId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: queryKeys.playerNotes.player(playerId) });
    },
  });

  // ─── Handlers ───────────────────────────────────────────────────────────────

  function handleCreate() {
    if (!isValidNoteContent(draft) || createMutation.isPending) return;
    createMutation.mutate(draft.trim());
  }

  function handleTogglePin(note: PlayerNote) {
    patchMutation.mutate({ id: note.id, updates: { pinned: !note.pinned } });
  }

  function startEdit(note: PlayerNote) {
    setEditingId(note.id);
    setEditDraft(note.content);
  }

  function handleSaveEdit(note: PlayerNote) {
    if (!isValidNoteContent(editDraft) || patchMutation.isPending) return;
    patchMutation.mutate({ id: note.id, updates: { content: editDraft.trim() } });
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditDraft('');
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Skeleton key={i} className="h-24 w-full rounded-xl bg-zinc-800/60" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StickyNote className="h-5 w-5 text-amber-400" />
          <h3 className="text-base font-semibold text-zinc-100">Coach Notes</h3>
          {notes.length > 0 && (
            <span className="text-xs text-zinc-500 tabular-nums">({notes.length})</span>
          )}
        </div>
        {!composing && (
          <Button
            size="sm"
            onClick={() => setComposing(true)}
            className="h-9 gap-1.5 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/20"
            aria-label="Add note"
          >
            <Plus className="h-4 w-4" />
            Add Note
          </Button>
        )}
      </div>

      {/* Privacy notice */}
      <div className="flex items-center gap-2 rounded-lg bg-zinc-900/60 border border-zinc-800 px-3 py-2 text-xs text-zinc-500">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span>These notes are private to coaches and never shown in parent reports.</span>
      </div>

      {/* Compose area */}
      {composing && (
        <Card className="bg-zinc-900/80 border-amber-500/30">
          <CardContent className="pt-4 space-y-3">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Write a private note… (e.g. parent call scheduled, injury follow-up, scouting notes)"
              rows={4}
              maxLength={MAX_NOTE_LENGTH}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
              aria-label="Note content"
              onKeyDown={e => {
                if (e.key === 'Escape') { setComposing(false); setDraft(''); }
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleCreate();
              }}
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs tabular-nums ${draft.length > MAX_NOTE_LENGTH * 0.9 ? 'text-amber-400' : 'text-zinc-600'}`}>
                {draft.length}/{MAX_NOTE_LENGTH}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setComposing(false); setDraft(''); }}
                  className="h-9 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreate}
                  disabled={!isValidNoteContent(draft) || createMutation.isPending}
                  className="h-9 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
                  aria-label="Save note"
                >
                  {createMutation.isPending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <><Check className="h-4 w-4 mr-1" />Save</>
                  }
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search (only shown when there are multiple notes) */}
      {notes.length > 2 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search notes…"
            className="w-full rounded-lg bg-zinc-800/60 border border-zinc-700 pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-600"
            aria-label="Search notes"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {/* Notes list */}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-zinc-500">
          {notes.length === 0
            ? (
              <div className="space-y-2">
                <StickyNote className="h-10 w-10 mx-auto text-zinc-700" />
                <p className="text-sm">No private notes yet.</p>
                <p className="text-xs text-zinc-600">Tap "Add Note" to jot something down.</p>
              </div>
            )
            : <p className="text-sm">No notes match "{searchQuery}"</p>
          }
        </div>
      )}

      <div className="space-y-2">
        {filtered.map(note => {
          const isExpanded = expandedId === note.id;
          const isEditing = editingId === note.id;
          const isLong = note.content.length > 120;

          return (
            <Card
              key={note.id}
              className={`bg-zinc-900/60 border transition-colors ${
                note.pinned ? 'border-amber-500/30' : 'border-zinc-800'
              }`}
            >
              <CardContent className="pt-3 pb-3">
                {isEditing ? (
                  /* ── Edit mode ── */
                  <div className="space-y-2">
                    <textarea
                      ref={editTextareaRef}
                      value={editDraft}
                      onChange={e => setEditDraft(e.target.value)}
                      rows={4}
                      maxLength={MAX_NOTE_LENGTH}
                      className="w-full rounded-lg bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40 resize-none"
                      aria-label="Edit note content"
                      onKeyDown={e => {
                        if (e.key === 'Escape') handleCancelEdit();
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSaveEdit(note);
                      }}
                    />
                    <div className="flex items-center justify-between">
                      <span className={`text-xs tabular-nums ${editDraft.length > MAX_NOTE_LENGTH * 0.9 ? 'text-amber-400' : 'text-zinc-600'}`}>
                        {editDraft.length}/{MAX_NOTE_LENGTH}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCancelEdit}
                          className="h-8 text-zinc-400 hover:text-zinc-200"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(note)}
                          disabled={!isValidNoteContent(editDraft) || patchMutation.isPending}
                          className="h-8 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-semibold"
                        >
                          {patchMutation.isPending
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <><Check className="h-3.5 w-3.5 mr-1" />Save</>
                          }
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── View mode ── */
                  <div className="space-y-2">
                    {/* Note content */}
                    <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                      {isLong && !isExpanded ? truncateNote(note.content) : note.content}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : note.id)}
                        className="text-xs text-amber-400 hover:text-amber-300 font-medium"
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? 'Show less' : 'Show more'}
                      </button>
                    )}

                    {/* Footer row */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-2">
                        {note.pinned && (
                          <span className="flex items-center gap-1 text-xs text-amber-400">
                            <Pin className="h-3 w-3" />
                            Pinned
                          </span>
                        )}
                        <span className="text-xs text-zinc-600">
                          {note.updated_at !== note.created_at
                            ? `Edited ${formatDate(note.updated_at)}`
                            : formatDate(note.created_at)}
                        </span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleTogglePin(note)}
                          className={`p-1.5 rounded-md transition-colors ${
                            note.pinned
                              ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-500/10'
                              : 'text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800'
                          }`}
                          aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
                          title={note.pinned ? 'Unpin' : 'Pin'}
                        >
                          {note.pinned
                            ? <PinOff className="h-3.5 w-3.5" />
                            : <Pin className="h-3.5 w-3.5" />
                          }
                        </button>
                        <button
                          onClick={() => startEdit(note)}
                          className="p-1.5 rounded-md text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800 transition-colors"
                          aria-label="Edit note"
                          title="Edit"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMutation.mutate(note.id)}
                          disabled={deleteMutation.isPending}
                          className="p-1.5 rounded-md text-zinc-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                          aria-label="Delete note"
                          title="Delete"
                        >
                          {deleteMutation.isPending && deleteMutation.variables === note.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5" />
                          }
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
