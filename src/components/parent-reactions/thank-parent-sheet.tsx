'use client';

/**
 * ThankParentSheet — the coach's one-tap UI for the parent-reaction
 * thank-you reply (ticket 0056).
 *
 * Lifecycle:
 *   1. Caller renders the sheet with `open=true` after the coach taps the
 *      "Thank <parent>" button (or after the inbox page consumes
 *      ?openReply=<id> on first render).
 *   2. On open the sheet POSTs to /api/parent-reactions/<id>/draft-reply
 *      and renders the returned `draft` in an editable textarea.
 *   3. The coach can edit the draft. Tap Send → POST send-reply with the
 *      final text. On success the sheet fires `onSent({ coach_reply_id })`
 *      so the inbox row can collapse to the "Replied" pill.
 *
 * Dark/zinc/orange aesthetic. 44px touch targets per AGENTS.md rule 7.
 * Stable data-testid="thank-parent-sheet" for the e2e spec (LESSONS#0081).
 *
 * The component does NOT use `query()` / `mutate()` because those helpers
 * are scoped to /api/data. The thank-you routes are dedicated endpoints
 * (the typed-endpoint pattern from LESSONS#97), so a thin fetch() call is
 * the right shape here. No state effect on every re-render — the draft
 * fetch fires once via a useEffect gated by `open`.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ThankParentSheetProps {
  open: boolean;
  reactionId: string;
  parentFirstName: string;
  playerFirstName: string;
  onClose: () => void;
  onSent: (args: { coach_reply_id: string }) => void;
}

export function ThankParentSheet(props: ThankParentSheetProps) {
  const { open, reactionId, parentFirstName, playerFirstName, onClose, onSent } = props;
  const [draft, setDraft] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef<string | null>(null);

  useEffect(() => {
    // Fire the draft fetch once per (open=true, reactionId) edge — never on
    // every re-render.
    if (!open) {
      fetchedRef.current = null;
      setDraft('');
      setError(null);
      return;
    }
    if (fetchedRef.current === reactionId) return;
    fetchedRef.current = reactionId;
    setLoading(true);
    setError(null);
    fetch(`/api/parent-reactions/${reactionId}/draft-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to draft reply');
        const body = (await res.json()) as { draft?: string };
        setDraft(body.draft ?? '');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Could not draft a reply');
      })
      .finally(() => setLoading(false));
  }, [open, reactionId]);

  if (!open) return null;

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/parent-reactions/${reactionId}/send-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft }),
      });
      const body = (await res.json()) as { coach_reply_id?: string; error?: string };
      if (!res.ok || !body.coach_reply_id) {
        throw new Error(body.error || 'Failed to send');
      }
      onSent({ coach_reply_id: body.coach_reply_id });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      data-testid="thank-parent-sheet"
      role="dialog"
      aria-label={`Thank ${parentFirstName}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center"
    >
      <div className="w-full max-w-md rounded-t-2xl border border-zinc-800 bg-zinc-950 p-5 sm:rounded-2xl">
        <div className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">
              Thank {parentFirstName}
            </h2>
            <p className="mt-1 text-sm text-zinc-400">
              A short reply about {playerFirstName}. Edit anything you want, then send.
            </p>
          </div>

          {loading ? (
            <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-4 text-sm text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Drafting a reply…
            </div>
          ) : (
            <textarea
              aria-label="Draft reply"
              className="min-h-[140px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-[15px] text-zinc-100 placeholder-zinc-600 focus:border-orange-500/60 focus:outline-none"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={500}
            />
          )}

          {error && (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              variant="ghost"
              className="h-11 px-4 text-zinc-400 hover:text-zinc-200"
              onClick={onClose}
              disabled={sending}
            >
              Cancel
            </Button>
            <Button
              className="h-11 bg-orange-500 px-5 text-white hover:bg-orange-600 active:scale-[0.98]"
              onClick={handleSend}
              disabled={sending || loading || draft.trim().length === 0}
            >
              {sending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                'Send'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
