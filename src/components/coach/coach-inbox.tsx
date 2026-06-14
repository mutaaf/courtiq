'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// ─── Ticket 0081 — coach inbox panel + nav badge ────────────────────────────
//
// Mounted on /home. Renders a small "Inbox" nav entry at the top
// with a tiny zinc-500 "1" badge when an unread thank-you message
// exists. Tapping the nav reveals a small panel listing the unread
// + read messages. On reveal, fires POST /api/coach/inbox/mark-read
// for the rendered unread ids (mark-as-seen on view, NOT mark-as-
// replied — there is no reply primitive). LESSONS#0027 — the reveal
// effect reads the ids as a SNAPSHOT and uses an empty deps list.
//
// Privacy (LESSONS#0036): the panel renders ONLY the sender's first
// name + program name + drill/plan title + sanitized body. Never the
// sender's surname / email / phone / team name beyond the program.
// Player ids and parent contact NEVER reach this surface.
//
// Voice contract (LESSONS#0023): every rendered string carries no
// AGENTS.md banned word.
//
// Tier posture: universal — every coach who has an inbox row sees
// their inbox regardless of tier.

interface InboxMessage {
  id: string;
  sender_first_name: string;
  sender_program_name: string;
  drill_or_plan_title: string;
  body: string;
  sent_at: string;
  read_at: string | null;
}

interface InboxResponse {
  messages: InboxMessage[];
}

export function CoachInboxNavBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      data-testid="coach-inbox-nav-badge"
      className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-700 px-1 text-[10px] font-semibold text-zinc-200"
    >
      {count}
    </span>
  );
}

export function CoachInbox() {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ['coach-inbox'],
    staleTime: 60 * 1000,
    retry: false,
    queryFn: async (): Promise<InboxResponse> => {
      const res = await fetch('/api/coach/inbox');
      if (!res.ok) return { messages: [] };
      return (await res.json()) as InboxResponse;
    },
  });

  const messages = useMemo(() => data?.messages ?? [], [data]);
  const unreadCount = useMemo(
    () => messages.filter((m) => m.read_at === null).length,
    [messages],
  );

  // LESSONS#0027 — empty deps. The reveal effect reads the unread
  // ids as a SNAPSHOT and fires the mark-read POST exactly once per
  // reveal. We track "fired for which open state" in a ref-like
  // sentinel so a re-render of the panel doesn't re-fire the POST.
  const [markReadFiredFor, setMarkReadFiredFor] = useState<string>('');
  useEffect(() => {
    if (!open) return;
    const unreadIds = messages
      .filter((m) => m.read_at === null)
      .map((m) => m.id);
    if (unreadIds.length === 0) return;
    const fingerprint = unreadIds.sort().join(',');
    if (fingerprint === markReadFiredFor) return;
    setMarkReadFiredFor(fingerprint);
    fetch('/api/coach/inbox/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds: unreadIds }),
    }).catch(() => {
      // Best-effort: never throw on the home screen.
    });
    // Intentionally empty deps — read as a snapshot when the panel
    // first opens (LESSONS#0027). The fingerprint sentinel inside
    // handles re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="mb-4 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-sm font-medium text-zinc-100">
          Inbox
          <CoachInboxNavBadge count={unreadCount} />
        </span>
        <span className="text-[11px] text-zinc-500">
          {open ? 'Hide' : messages.length === 0 ? '' : 'Show'}
        </span>
      </button>
      {open && (
        <div data-testid="coach-inbox-panel" className="mt-3 space-y-2">
          {messages.length === 0 ? (
            <p
              data-testid="coach-inbox-empty"
              className="text-xs text-zinc-500"
            >
              No messages yet.
            </p>
          ) : (
            messages.map((m) => (
              <InboxMessageCard key={m.id} message={m} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InboxMessageCard({ message }: { message: InboxMessage }) {
  return (
    <div
      data-testid="coach-inbox-message"
      className="rounded-lg border border-zinc-800 bg-zinc-950 p-3"
    >
      <p className="text-xs text-zinc-300">
        Coach {message.sender_first_name} at the {message.sender_program_name}{' '}
        program thanked you for running their {message.drill_or_plan_title}.
      </p>
      <blockquote className="mt-2 border-l-2 border-zinc-700 pl-2 text-xs italic text-zinc-400">
        {message.body}
      </blockquote>
    </div>
  );
}
