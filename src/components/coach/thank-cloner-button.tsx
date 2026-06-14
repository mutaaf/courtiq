'use client';

import { useState } from 'react';

// ─── Ticket 0081 — thank-cloner button + sheet ──────────────────────────────
//
// Mounted INSIDE the existing 0076 stuck milestone card on /home (the
// smallest possible touch — one prop + one button + one sheet). On
// tap, opens a small sheet with a pre-filled textarea ("Thanks for
// running my <drillTitle> — glad it landed for your <programName>.
// — <publisherFirstName>"). Send fires POST /api/coach/thank-cloner.
//
// Voice contract (LESSONS#0023): instructed positively. The button
// label, sheet copy, toast, and pre-fill template carry NO AGENTS.md
// banned word.
//
// Privacy (LESSONS#0036): the button NEVER renders the cloner's
// surname / email / phone. Only their program name + the publisher's
// own first name (which the publisher already owns) cross to the
// pre-fill. The POST sends ONLY `{ milestoneId, body }` — the
// recipient is resolved server-side.
//
// Tier posture: NO new tier feature key. Universal — every
// publishing coach who hits the stuck milestone surface gets the
// button regardless of tier.

interface ThankClonerButtonProps {
  /** The 0076 stuck milestone id this thank is for. */
  milestoneId: string;
  /** The publisher's own first name (rendered into the pre-fill). */
  publisherFirstName: string;
  /** The drill title that stuck (rendered into the pre-fill). */
  drillTitle: string;
  /** The cloner's program name (the existing 0073/0076 milestone
   *  surface already exposes program-scope). */
  clonerProgramName: string;
  /** Pre-existing thank-message id, if a previous tap already wrote
   *  one — the button starts in the Thanked state on re-render. */
  initialMessageId?: string | null;
}

export function ThankClonerButton({
  milestoneId,
  publisherFirstName,
  drillTitle,
  clonerProgramName,
  initialMessageId = null,
}: ThankClonerButtonProps) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [messageId, setMessageId] = useState<string | null>(initialMessageId);
  const [body, setBody] = useState(
    `Thanks for running my ${drillTitle} — glad it landed for your ${clonerProgramName}. — ${publisherFirstName}`,
  );

  const thanked = !!messageId;

  async function handleSend() {
    if (sending || thanked) return;
    setSending(true);
    try {
      const res = await fetch('/api/coach/thank-cloner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneId, body }),
      });
      if (res.ok) {
        const json = (await res.json()) as { ok: boolean; message_id: string };
        if (json.ok && json.message_id) {
          setMessageId(json.message_id);
          setOpen(false);
        }
      }
    } catch {
      // Best-effort: never throw on the home card.
    } finally {
      setSending(false);
    }
  }

  if (thanked) {
    return (
      <button
        type="button"
        data-testid="thank-cloner-thanked-state"
        data-message-id={messageId ?? undefined}
        disabled
        className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-400"
      >
        Thanked
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        data-testid="thank-cloner-button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-full bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
      >
        Thank this coach
      </button>
      {open && (
        <div
          data-testid="thank-cloner-sheet"
          className="mt-3 rounded-lg border border-zinc-800 bg-zinc-900 p-3"
        >
          <textarea
            data-testid="thank-cloner-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={280}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-2 text-xs text-zinc-100"
          />
          <p className="mt-1 text-[11px] text-zinc-500">
            This will land in their SportsIQ inbox. Your email stays
            private; theirs does too.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              data-testid="thank-cloner-send"
              onClick={handleSend}
              disabled={sending || body.trim().length === 0}
              className="inline-flex items-center rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex items-center rounded-md border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
