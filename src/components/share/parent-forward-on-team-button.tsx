'use client';

/**
 * Ticket 0079 — ParentForwardOnTeamButton.
 *
 * Mounted at the bottom of the existing parent-portal report page
 * (src/app/share/[token]/page.tsx) BELOW every existing CTA. Renders
 * a small zinc-500 line + one orange-pill trigger. Tapping it opens
 * a sheet with a first-name search across the OTHER players on the
 * team (the `teamMates` prop is the team-roster GET extension), a
 * one-time sender-first-name input, and a textarea pre-filled with
 * the templated forwarding copy. On Send the component POSTs to
 * /api/share/parent-forward and flips to a toast: "Sent to one
 * parent on your team" on 200 OR the already-sent variant on 429.
 *
 * Consent posture (mirrors LESSONS#0096 + the 0060 share-sheet
 * shape): the sheet renders FIRST NAMES ONLY (never a surname,
 * never the recipient parent's name, never their email or phone).
 * The sender's first name is asked once at the top; we do not
 * store it anywhere (the parent-portal page is auth-free).
 *
 * Data-testids cover the strict-mode parent-portal multi-CTA page
 * per LESSONS#0022 / #0029 / #0082 — every interactive element
 * carries one.
 */

import { useMemo, useState } from 'react';

export interface ParentForwardTeamMate {
  player_id: string;
  first_name: string;
}

interface ParentForwardOnTeamButtonProps {
  shareToken: string;
  /** Other players on the team whose parent_email exists. Empty array
   *  renders nothing (silence beats a dead button). */
  teamMates: ParentForwardTeamMate[];
  /** The sender's own kid's first name — used to populate the
   *  templated forwarding copy. */
  myKidFirstName: string;
}

type Phase = 'idle' | 'open' | 'sending' | 'sent' | 'already';

function buildDefaultNote(
  recipientFirstName: string,
  myKidFirstName: string,
  senderFirstName: string,
): string {
  // The AC's literal template. The em-dash is intentional — it
  // matches the existing 0060 / 0050 parent-side voice exactly.
  const sender = senderFirstName.trim();
  const senderTag = sender ? ` — ${sender}.` : '';
  return `I thought you'd want to read this — ${recipientFirstName} and ${myKidFirstName} are on the same team, and the coach's reports have been really helpful.${senderTag}`;
}

export function ParentForwardOnTeamButton({
  shareToken,
  teamMates,
  myKidFirstName,
}: ParentForwardOnTeamButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [search, setSearch] = useState('');
  const [senderFirstName, setSenderFirstName] = useState('');
  const [selected, setSelected] = useState<ParentForwardTeamMate | null>(null);
  const [note, setNote] = useState('');

  // Filter the candidate list by the typed first-name search. Empty
  // search shows every candidate. Memo placed BEFORE any early
  // return so the Hook order stays stable (LESSONS-style: never
  // gate Hooks behind a conditional).
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teamMates;
    return teamMates.filter((m) =>
      m.first_name.toLowerCase().includes(q),
    );
  }, [search, teamMates]);

  // Silence beats a dead button — if no teammates carry a
  // parent_email, the surface renders nothing.
  if (!teamMates || teamMates.length === 0) {
    return null;
  }

  const onSelect = (m: ParentForwardTeamMate) => {
    setSelected(m);
    setNote(buildDefaultNote(m.first_name, myKidFirstName, senderFirstName));
  };

  const onSenderChange = (v: string) => {
    setSenderFirstName(v);
    // If a candidate was already selected, refresh the templated
    // note so the sender's name flows through.
    if (selected) {
      setNote(buildDefaultNote(selected.first_name, myKidFirstName, v));
    }
  };

  const onSend = async () => {
    if (!selected) return;
    setPhase('sending');
    try {
      const res = await fetch('/api/share/parent-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareToken,
          recipientPlayerId: selected.player_id,
          senderFirstName: senderFirstName.trim(),
          note: note.trim(),
        }),
      });
      if (res.status === 200) {
        setPhase('sent');
        return;
      }
      if (res.status === 429) {
        setPhase('already');
        return;
      }
      // Any other failure — silently flip back to the open state so
      // the parent can retry; we don't surface a raw 400 to the
      // parent portal.
      setPhase('open');
    } catch {
      setPhase('open');
    }
  };

  // ─── Phase rendering ────────────────────────────────────────────

  // Sent toast (200).
  if (phase === 'sent') {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm font-medium text-emerald-800"
        data-testid="parent-forward-on-team-sent-toast"
      >
        Sent to one parent on your team.
      </div>
    );
  }

  // Already-sent toast (429).
  if (phase === 'already') {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-center text-sm font-medium text-zinc-700"
        data-testid="parent-forward-on-team-already-toast"
      >
        You sent this to {selected?.first_name ?? 'them'} already this week.
      </div>
    );
  }

  const showSheet = phase === 'open' || phase === 'sending';

  return (
    <div className="mx-4 mt-6">
      {/* The small prompt + the orange-pill trigger. The button is
          the load-bearing testid the Playwright spec scopes by. */}
      <div className="mb-2 text-xs text-zinc-500">
        Want another parent on the team to see this? Send it to one of them.
      </div>
      <button
        type="button"
        onClick={() => setPhase('open')}
        data-testid="parent-forward-on-team-button"
        className="inline-flex items-center justify-center rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 active:scale-[0.98]"
      >
        Send to one parent
      </button>

      {showSheet && (
        <div
          className="mt-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
          data-testid="parent-forward-on-team-sheet"
          data-share-url={
            selected
              ? `/api/share/parent-forward?recipientPlayerId=${selected.player_id}`
              : ''
          }
        >
          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor="parent-forward-sender">
              Your first name
            </label>
            <input
              id="parent-forward-sender"
              type="text"
              value={senderFirstName}
              onChange={(e) => onSenderChange(e.target.value)}
              maxLength={30}
              data-testid="parent-forward-on-team-sender-first-name"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="Sarah"
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor="parent-forward-search">
              Find a parent on the team by first name
            </label>
            <input
              id="parent-forward-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="parent-forward-on-team-search"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="Liam"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              {filtered.map((m) => {
                const isSelected = selected?.player_id === m.player_id;
                const initial = m.first_name.charAt(0).toUpperCase();
                return (
                  <button
                    key={m.player_id}
                    type="button"
                    onClick={() => onSelect(m)}
                    data-testid={`parent-forward-on-team-candidate-${m.player_id}`}
                    className={
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors ' +
                      (isSelected
                        ? 'border-orange-500 bg-orange-50 text-orange-900'
                        : 'border-gray-200 bg-white text-gray-900 hover:border-orange-300')
                    }
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
                      {initial}
                    </span>
                    <span className="font-medium">{m.first_name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-xs font-medium text-zinc-700" htmlFor="parent-forward-note">
              Note to {selected?.first_name ?? 'them'}
            </label>
            <textarea
              id="parent-forward-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={4}
              data-testid="parent-forward-on-team-note"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>

          <button
            type="button"
            onClick={onSend}
            disabled={!selected || !senderFirstName.trim() || !note.trim() || phase === 'sending'}
            data-testid="parent-forward-on-team-send"
            className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {phase === 'sending' ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}
    </div>
  );
}
