'use client';

import { useEffect, useState } from 'react';
import { Mail, X } from 'lucide-react';

// Ticket 0065 — the new section beneath the existing 0057 weekly-pulse
// share sheet's Copy-link button. Two short inputs (director first name +
// email), one Send button (label updates with the name), and a small
// dismiss-X.
//
// The section is purely additive — it lives BELOW the existing surfaces
// inside the sheet with a clear divider, so the existing Copy-link +
// caption textarea + preview render byte-identically.
//
// data-testid="director-invite-section" + the Send button exposes
// data-share-url={weeklyPulsePublicUrl} per LESSONS#0056 / #0082 (the
// same URL we send the director, useful for the e2e to assert the right
// token is threaded).
//
// Voice contract (LESSONS#0023): every user-facing string here is
// positive, factual, clipboard-voice; NO AGENTS.md banned token in any
// rendered text. The component test scans the rendered DOM for the banned
// list.

interface ContactPrefill {
  hasContact: boolean;
  directorFirstName?: string;
  directorEmailMasked?: string;
}

type SendState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'sent'; directorFirstName: string }
  | { kind: 'already'; directorFirstName: string }
  | { kind: 'error'; reason: string };

interface DirectorInviteSectionProps {
  teamId: string;
  weeklyPulseToken: string;
  weeklyPulsePublicUrl: string;
}

export function DirectorInviteSection({
  teamId,
  weeklyPulseToken,
  weeklyPulsePublicUrl,
}: DirectorInviteSectionProps) {
  const [dismissed, setDismissed] = useState(false);
  const [prefill, setPrefill] = useState<ContactPrefill | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<SendState>({ kind: 'idle' });

  // Fire the prefill GET exactly once on mount. The component test asserts
  // this exact behavior.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/program-director-invites/contact-prefill');
        if (!res.ok) {
          if (!cancelled) setPrefill({ hasContact: false });
          return;
        }
        const body = (await res.json()) as ContactPrefill;
        if (cancelled) return;
        setPrefill(body);
        if (body.hasContact && body.directorFirstName) {
          setName((prev) => (prev.length === 0 ? body.directorFirstName! : prev));
        }
      } catch {
        if (!cancelled) setPrefill({ hasContact: false });
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissed) return null;

  const trimmedName = name.trim();
  const sendLabel = trimmedName.length > 0 ? `Send to ${trimmedName}` : 'Send to your director';

  async function handleSend() {
    if (state.kind === 'sending') return;
    if (!trimmedName || !email.trim()) {
      setState({ kind: 'error', reason: 'format' });
      return;
    }
    setState({ kind: 'sending' });
    try {
      const res = await fetch('/api/program-director-invites/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId,
          weeklyPulseToken,
          directorFirstName: trimmedName,
          directorEmail: email.trim(),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        sent?: boolean;
        reason?: string;
        inviteCount?: number;
      };
      if (res.status === 200 && body.sent === true) {
        setState({ kind: 'sent', directorFirstName: trimmedName });
        return;
      }
      if (res.status === 200 && body.sent === false) {
        setState({ kind: 'already', directorFirstName: trimmedName });
        return;
      }
      setState({ kind: 'error', reason: body.reason ?? 'unknown' });
    } catch {
      setState({ kind: 'error', reason: 'network' });
    }
  }

  return (
    <div
      className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 space-y-3"
      data-testid="director-invite-section"
    >
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
          <Mail className="h-4 w-4 text-orange-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-zinc-100 leading-snug">
            Send this to your program director?
          </p>
          {prefill?.hasContact && prefill.directorEmailMasked ? (
            <p className="text-xs text-zinc-500 mt-0.5">
              Last invite went to {prefill.directorEmailMasked}.
            </p>
          ) : (
            <p className="text-xs text-zinc-500 mt-0.5">
              Two taps to bring them onto SportsIQ with your team attached.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="rounded-md p-1 text-zinc-600 hover:text-zinc-300 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Hide director invite section"
          data-testid="director-invite-dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {state.kind === 'sent' ? (
        <p
          className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-sm text-emerald-200"
          data-testid="director-invite-success"
        >
          Sent. {state.directorFirstName} will see this card in their inbox.
        </p>
      ) : state.kind === 'already' ? (
        <p
          className="rounded-lg bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-300"
          data-testid="director-invite-already"
        >
          Already invited recently — {state.directorFirstName} will see this on their home.
        </p>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 60))}
              placeholder="Director first name"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
              aria-label="Director first name"
              data-testid="director-invite-name-input"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value.slice(0, 200))}
              placeholder="director@league.org"
              className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600 focus:border-orange-500/50 focus:outline-none"
              aria-label="Director email"
              data-testid="director-invite-email-input"
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleSend}
              disabled={state.kind === 'sending'}
              className="rounded-lg bg-orange-600 hover:bg-orange-500 active:scale-[0.97] disabled:opacity-60 touch-manipulation text-white text-sm font-semibold py-2 px-4 transition-all min-h-[44px]"
              data-testid="director-invite-send-button"
              data-share-url={weeklyPulsePublicUrl}
              aria-label={sendLabel}
            >
              {state.kind === 'sending' ? 'Sending…' : sendLabel}
            </button>
            {state.kind === 'error' && (
              <p className="text-xs text-rose-300">
                That did not go through. Check the email and try again.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
