'use client';

/**
 * Ticket 0079 — ParentForwardOnTeamButton.
 * Ticket 0080 — extended with a second "In your program" tab for the
 *               cross-team-same-program forward.
 *
 * Mounted at the bottom of the existing parent-portal report page
 * (src/app/share/[token]/page.tsx) BELOW every existing CTA. Renders
 * a small zinc-500 line + one orange-pill trigger. Tapping it opens
 * a sheet with TWO tabs:
 *
 *   1) "On your team" — the 0079 same-team forward. Candidate list
 *      = OTHER players on the SAME team whose parent_email exists.
 *      Pre-fills the templated copy ("I thought you'd want to read
 *      this — <recipient> and <my kid> are on the same team…").
 *
 *   2) "In your program" — the 0080 cross-team-same-program forward.
 *      Candidate list = OTHER players on DIFFERENT teams in the SAME
 *      `org_id` whose parent_email exists AND whose team has a head
 *      coach on SportsIQ. First-name + team-name labelled
 *      ("Devon — Bears U12"). Pre-fills the templated copy
 *      naming both teams + the program.
 *
 * Consent posture (mirrors LESSONS#0096 + the 0060 share-sheet
 * shape): the sheet renders FIRST NAMES ONLY (never a surname,
 * never the recipient parent's name, never their email or phone).
 * The team_name in the program tab is the team the candidate is
 * ON, which is already public coach-level info.
 *
 * Data-testids cover the strict-mode parent-portal multi-CTA page
 * per LESSONS#0022 / #0029 / #0082 — every interactive element
 * carries one. The program-tab testids carry the
 * `parent-forward-in-program-*` prefix; the on-team-tab testids
 * inherit the existing 0079 `parent-forward-on-team-*` prefix
 * byte-identical.
 */

import { useMemo, useState } from 'react';

export interface ParentForwardTeamMate {
  player_id: string;
  first_name: string;
}

// Ticket 0080 — cross-team candidate row. The team_name is the
// candidate's team's display name; the program-tab candidate-row
// labels it next to the first name ("Devon — Bears U12").
export interface ParentForwardProgramMate {
  player_id: string;
  first_name: string;
  team_name: string;
}

interface ParentForwardOnTeamButtonProps {
  shareToken: string;
  /** Other players on the team whose parent_email exists. Empty array
   *  renders nothing (silence beats a dead button). */
  teamMates: ParentForwardTeamMate[];
  /** Ticket 0080 — Other players on DIFFERENT teams in the SAME
   *  program whose parent_email exists AND whose team has a coach on
   *  SportsIQ. Optional (defaults to empty array): when both
   *  teamMates and programMates are empty the surface renders
   *  nothing; when only programMates is empty the second tab is
   *  hidden but the first tab still renders. */
  programMates?: ParentForwardProgramMate[];
  /** The sender's own kid's first name — used to populate the
   *  templated forwarding copy. */
  myKidFirstName: string;
}

type Phase =
  | 'idle'
  | 'open'
  | 'sending'
  | 'sent'
  | 'already'
  // Ticket 0080 — cross-team phases (mirror the same-team set with
  // their own toast surfaces so the multi-CTA page is strict-mode-
  // safe per LESSONS#0022).
  | 'program-sending'
  | 'program-sent'
  | 'program-already';

type ActiveTab = 'on-team' | 'in-program';

function buildDefaultNote(
  recipientFirstName: string,
  myKidFirstName: string,
  senderFirstName: string,
): string {
  // The AC's literal template (0079). The em-dash is intentional —
  // it matches the existing 0060 / 0050 parent-side voice exactly.
  const sender = senderFirstName.trim();
  const senderTag = sender ? ` — ${sender}.` : '';
  return `I thought you'd want to read this — ${recipientFirstName} and ${myKidFirstName} are on the same team, and the coach's reports have been really helpful.${senderTag}`;
}

// Ticket 0080 — cross-team template. Names BOTH the sender's team
// + the recipient's team to anchor the cross-team context. The
// sender's name comes off as a sign-off in the same cardboard voice
// the 0079 template uses.
function buildCrossTeamNote(
  recipientFirstName: string,
  recipientTeamName: string,
  myKidFirstName: string,
  senderFirstName: string,
): string {
  const sender = senderFirstName.trim();
  const senderTag = sender ? ` — ${sender}.` : '';
  return `I thought you'd want to read this — ${myKidFirstName} and ${recipientFirstName} are on different teams in the same program (${recipientTeamName}), and the coaches' reports have been really helpful.${senderTag}`;
}

export function ParentForwardOnTeamButton({
  shareToken,
  teamMates,
  programMates = [],
  myKidFirstName,
}: ParentForwardOnTeamButtonProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [activeTab, setActiveTab] = useState<ActiveTab>('on-team');
  const [search, setSearch] = useState('');
  const [senderFirstName, setSenderFirstName] = useState('');
  const [selected, setSelected] = useState<ParentForwardTeamMate | null>(null);
  const [note, setNote] = useState('');

  // Ticket 0080 — program-tab local state. Kept separate from the
  // on-team-tab state so switching tabs never collides selections.
  const [programSearch, setProgramSearch] = useState('');
  const [programSenderFirstName, setProgramSenderFirstName] = useState('');
  const [programSelected, setProgramSelected] =
    useState<ParentForwardProgramMate | null>(null);
  const [programNote, setProgramNote] = useState('');

  // Filter the candidate list by the typed first-name search. Empty
  // search shows every candidate. Memo placed BEFORE any early
  // return so the Hook order stays stable.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teamMates;
    return teamMates.filter((m) =>
      m.first_name.toLowerCase().includes(q),
    );
  }, [search, teamMates]);

  const filteredProgram = useMemo(() => {
    const q = programSearch.trim().toLowerCase();
    if (!q) return programMates;
    return programMates.filter(
      (m) =>
        m.first_name.toLowerCase().includes(q) ||
        m.team_name.toLowerCase().includes(q),
    );
  }, [programSearch, programMates]);

  const hasOnTeam = !!teamMates && teamMates.length > 0;
  const hasInProgram = !!programMates && programMates.length > 0;

  // Silence beats a dead button — when neither lane has candidates
  // the surface renders nothing. The 0079 same-team-only render
  // path stays byte-identical when programMates is empty.
  if (!hasOnTeam && !hasInProgram) {
    return null;
  }

  const onSelect = (m: ParentForwardTeamMate) => {
    setSelected(m);
    setNote(buildDefaultNote(m.first_name, myKidFirstName, senderFirstName));
  };

  const onSenderChange = (v: string) => {
    setSenderFirstName(v);
    if (selected) {
      setNote(buildDefaultNote(selected.first_name, myKidFirstName, v));
    }
  };

  const onProgramSelect = (m: ParentForwardProgramMate) => {
    setProgramSelected(m);
    setProgramNote(
      buildCrossTeamNote(m.first_name, m.team_name, myKidFirstName, programSenderFirstName),
    );
  };

  const onProgramSenderChange = (v: string) => {
    setProgramSenderFirstName(v);
    if (programSelected) {
      setProgramNote(
        buildCrossTeamNote(
          programSelected.first_name,
          programSelected.team_name,
          myKidFirstName,
          v,
        ),
      );
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
      setPhase('open');
    } catch {
      setPhase('open');
    }
  };

  const onProgramSend = async () => {
    if (!programSelected) return;
    setPhase('program-sending');
    try {
      const res = await fetch('/api/share/parent-forward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shareToken,
          recipientPlayerId: programSelected.player_id,
          senderFirstName: programSenderFirstName.trim(),
          note: programNote.trim(),
        }),
      });
      if (res.status === 200) {
        setPhase('program-sent');
        return;
      }
      if (res.status === 429) {
        setPhase('program-already');
        return;
      }
      setPhase('open');
    } catch {
      setPhase('open');
    }
  };

  // ─── Phase rendering ────────────────────────────────────────────

  // 0079 sent toast (200).
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

  // 0079 already-sent toast (429).
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

  // Ticket 0080 — cross-team sent toast (200).
  if (phase === 'program-sent') {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-sm font-medium text-emerald-800"
        data-testid="parent-forward-in-program-sent-toast"
      >
        Sent to one parent in your program.
      </div>
    );
  }

  // Ticket 0080 — cross-team already-sent toast (429).
  if (phase === 'program-already') {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-5 py-4 text-center text-sm font-medium text-zinc-700"
        data-testid="parent-forward-in-program-already-toast"
      >
        You sent this to {programSelected?.first_name ?? 'them'} already this week.
      </div>
    );
  }

  const showSheet = phase === 'open' || phase === 'sending' || phase === 'program-sending';

  return (
    <div className="mx-4 mt-6">
      <div className="mb-2 text-xs text-zinc-500">
        Want another parent to see this? Send it to one of them.
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
        <div className="mt-4">
          {/* Tab strip — only renders the in-program tab when there
              ARE program candidates; otherwise the 0079 single-tab
              render is byte-identical. */}
          <div className="mb-2 flex gap-2" role="tablist">
            <button
              type="button"
              role="tab"
              data-testid="parent-forward-on-team-tab"
              aria-selected={activeTab === 'on-team'}
              onClick={() => setActiveTab('on-team')}
              className={
                'rounded-full px-4 py-1 text-xs font-semibold transition-colors ' +
                (activeTab === 'on-team'
                  ? 'bg-orange-500 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')
              }
            >
              On your team
            </button>
            {hasInProgram && (
              <button
                type="button"
                role="tab"
                data-testid="parent-forward-in-program-tab"
                aria-selected={activeTab === 'in-program'}
                onClick={() => setActiveTab('in-program')}
                className={
                  'rounded-full px-4 py-1 text-xs font-semibold transition-colors ' +
                  (activeTab === 'in-program'
                    ? 'bg-orange-500 text-white'
                    : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200')
                }
              >
                In your program
              </button>
            )}
          </div>

          {/* On-team sheet (0079 byte-identical when activeTab is
              on-team). */}
          {activeTab === 'on-team' && hasOnTeam && (
            <div
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
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

          {/* Ticket 0080 — in-program sheet (cross-team-same-program
              forward). Separate testid namespace + separate local
              state so the on-team tab stays byte-identical. */}
          {activeTab === 'in-program' && hasInProgram && (
            <div
              className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
              data-testid="parent-forward-in-program-sheet"
              data-share-url={
                programSelected
                  ? `/api/share/parent-forward?recipientPlayerId=${programSelected.player_id}`
                  : ''
              }
            >
              <div className="mb-3">
                <label
                  className="mb-1 block text-xs font-medium text-zinc-700"
                  htmlFor="parent-forward-in-program-sender"
                >
                  Your first name
                </label>
                <input
                  id="parent-forward-in-program-sender"
                  type="text"
                  value={programSenderFirstName}
                  onChange={(e) => onProgramSenderChange(e.target.value)}
                  maxLength={30}
                  data-testid="parent-forward-in-program-sender-first-name"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Sarah"
                />
              </div>

              <div className="mb-3">
                <label
                  className="mb-1 block text-xs font-medium text-zinc-700"
                  htmlFor="parent-forward-in-program-search"
                >
                  Find a parent in your program by first name or team
                </label>
                <input
                  id="parent-forward-in-program-search"
                  type="text"
                  value={programSearch}
                  onChange={(e) => setProgramSearch(e.target.value)}
                  data-testid="parent-forward-in-program-search"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                  placeholder="Devon"
                />
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {filteredProgram.map((m) => {
                    const isSelected = programSelected?.player_id === m.player_id;
                    const initial = m.first_name.charAt(0).toUpperCase();
                    return (
                      <button
                        key={m.player_id}
                        type="button"
                        onClick={() => onProgramSelect(m)}
                        data-testid={`parent-forward-in-program-candidate-${m.player_id}`}
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
                        <span className="text-xs text-zinc-500">— {m.team_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mb-3">
                <label
                  className="mb-1 block text-xs font-medium text-zinc-700"
                  htmlFor="parent-forward-in-program-note"
                >
                  Note to {programSelected?.first_name ?? 'them'}
                </label>
                <textarea
                  id="parent-forward-in-program-note"
                  value={programNote}
                  onChange={(e) => setProgramNote(e.target.value)}
                  maxLength={200}
                  rows={4}
                  data-testid="parent-forward-in-program-note"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>

              <button
                type="button"
                onClick={onProgramSend}
                disabled={
                  !programSelected ||
                  !programSenderFirstName.trim() ||
                  !programNote.trim() ||
                  phase === 'program-sending'
                }
                data-testid="parent-forward-in-program-send"
                className="inline-flex w-full items-center justify-center rounded-full bg-orange-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {phase === 'program-sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
