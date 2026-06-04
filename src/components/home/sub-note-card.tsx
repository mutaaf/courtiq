'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';

// Ticket 0067 — /home card listing unread sub-notes from the last 7 days.
// Reads GET /api/sub-handoff/recent-notes; tapping Got-it POSTs
// /api/sub-handoff/recent-notes/seen which stamps sub_note_seen_at on
// every matching row.
//
// Self-gating: an empty payload renders nothing. A network failure renders
// nothing (best-effort per LESSONS#0036 — never blocks /home).
//
// Voice: clipboard. No banned words.

interface SubNoteLine {
  id: string;
  subFirstName: string;
  truncatedText: string;
  subNoteAt: string | null;
  sessionId: string;
}

interface SubNotesPayload {
  lines: SubNoteLine[];
}

export function SubNoteCard() {
  const qc = useQueryClient();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery<SubNotesPayload>({
    queryKey: ['sub-handoff-recent-notes'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/sub-handoff/recent-notes');
        if (!res.ok) return { lines: [] };
        return (await res.json()) as SubNotesPayload;
      } catch {
        return { lines: [] };
      }
    },
    staleTime: 5 * 60_000,
  });

  // Reset the dismissed flag when the underlying data refreshes — the
  // coach can receive new sub-notes in a future window.
  useEffect(() => {
    setDismissed(false);
  }, [data?.lines.length]);

  if (dismissed) return null;
  if (!data || data.lines.length === 0) return null;

  const visible = data.lines.slice(0, 3);
  const extra = data.lines.length - visible.length;

  async function acknowledge() {
    setDismissed(true);
    try {
      await fetch('/api/sub-handoff/recent-notes/seen', { method: 'POST' });
    } catch {
      /* swallow — same posture as the new-followers card */
    }
    qc.invalidateQueries({ queryKey: ['sub-handoff-recent-notes'] });
  }

  return (
    <div
      data-testid="sub-note-card"
      className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
          <MessageSquare className="h-5 w-5 text-orange-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            Notes from your sub
          </p>
          <ul className="mt-2 space-y-1.5 text-sm text-zinc-100">
            {visible.map((line) => (
              <li key={line.id} data-testid="sub-note-line">
                <span className="font-semibold">{line.subFirstName}</span>
                {' — '}
                <span className="text-zinc-200">&ldquo;{line.truncatedText}&rdquo;</span>
              </li>
            ))}
          </ul>
          {extra > 0 ? (
            <p data-testid="sub-note-extra" className="mt-1.5 text-xs text-zinc-400">
              + {extra} more
            </p>
          ) : null}
          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={acknowledge}
              data-testid="sub-note-gotit"
              className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
