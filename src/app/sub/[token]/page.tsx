'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { Loader2, Send } from 'lucide-react';
import { SubHandoffPageBody, type SubHandoffPayload } from '@/components/sub/sub-handoff-page-body';

// Ticket 0067 — PUBLIC sub-coach page. Parent-portal aesthetic (gray +
// orange, NOT dark). `'use client'` so the GET to /api/sub-handoff/[token]
// is browser-side and Playwright's page.route() can intercept it
// (LESSONS#0036).
//
// Three layers:
//   1) The rendered context (delegated to <SubHandoffPageBody />).
//   2) The "send the regular coach a one-line note" form (POST →
//      /api/sub-handoff/[token]/sub-note).
//   3) The Roster + Made-with-SportsIQ referral footer.

type Phase = 'loading' | 'ready' | 'not-found' | 'expired' | 'error';
type NotePhase = 'idle' | 'submitting' | 'sent' | 'error';

export default function SubHandoffPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [phase, setPhase] = useState<Phase>('loading');
  const [payload, setPayload] = useState<SubHandoffPayload | null>(null);
  const [noteText, setNoteText] = useState('');
  const [notePhase, setNotePhase] = useState<NotePhase>('idle');
  const [noteError, setNoteError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/sub-handoff/${encodeURIComponent(token)}`);
        if (cancelled) return;
        if (res.status === 410) {
          setPhase('expired');
          return;
        }
        if (res.status === 404) {
          setPhase('not-found');
          return;
        }
        if (!res.ok) {
          setPhase('error');
          return;
        }
        const data = (await res.json()) as SubHandoffPayload;
        setPayload({ ...data, token });
        setPhase('ready');
      } catch {
        if (!cancelled) setPhase('error');
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSend() {
    if (!noteText.trim()) return;
    setNotePhase('submitting');
    setNoteError(null);
    try {
      const res = await fetch(`/api/sub-handoff/${encodeURIComponent(token)}/sub-note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (body?.reason === 'voice') {
          setNoteError(
            body?.hint ||
              "write the note like you'd text a friend — keep it short and concrete",
          );
        } else if (res.status === 429) {
          setNoteError("you've sent the regular coach three notes — that's plenty.");
        } else if (res.status === 410) {
          setNoteError('this link has expired.');
        } else {
          setNoteError('could not send — try once more.');
        }
        setNotePhase('error');
        return;
      }
      setNotePhase('sent');
    } catch {
      setNoteError('network hiccup — try once more.');
      setNotePhase('error');
    }
  }

  if (phase === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
      </main>
    );
  }

  if (phase === 'not-found' || phase === 'expired') {
    const headline = phase === 'expired' ? 'This link has expired.' : 'Link not found.';
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <div className="max-w-md px-6 text-center">
          <h1 className="text-2xl font-semibold">{headline}</h1>
          <p className="mt-2 text-sm text-gray-600">
            Ask the regular coach for a fresh one — they can generate a new link in
            a tap.
          </p>
        </div>
      </main>
    );
  }

  if (phase === 'error' || !payload) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-900">
        <div className="max-w-md px-6 text-center">
          <h1 className="text-2xl font-semibold">Could not load the brief.</h1>
          <p className="mt-2 text-sm text-gray-600">Try refreshing the page.</p>
        </div>
      </main>
    );
  }

  return (
    <main data-testid="sub-handoff-page" className="min-h-screen bg-gray-50">
      <SubHandoffPageBody payload={payload} />

      {/* Send-a-note surface */}
      <section className="mx-auto mb-6 max-w-2xl px-5">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
            Send the regular coach a one-line note after practice
          </h2>
          {notePhase === 'sent' ? (
            <p className="mt-2 text-sm text-gray-700">
              Sent. Thanks for stepping in.
            </p>
          ) : (
            <>
              <textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="all 12 showed, did both drills, Caleb did NOT call out a single switch all night"
                data-testid="sub-note-input"
                className="mt-2 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none"
              />
              {noteError ? (
                <p className="mt-2 text-sm text-red-700">{noteError}</p>
              ) : null}
              <button
                type="button"
                onClick={handleSend}
                disabled={notePhase === 'submitting' || !noteText.trim()}
                data-testid="sub-note-send-btn"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
              >
                {notePhase === 'submitting' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </button>
            </>
          )}
        </div>
      </section>

      {/* Roster + footer */}
      <section className="mx-auto max-w-2xl px-5 pb-12">
        <Link
          href={`/observe/${encodeURIComponent(token)}`}
          data-testid="sub-handoff-roster-link"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
        >
          Open the roster
        </Link>
        <footer
          data-testid="sub-handoff-footer"
          className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-600"
        >
          Made with SportsIQ —{' '}
          <Link href="/signup" className="font-medium text-orange-700 underline">
            start your own free team
          </Link>
          .
        </footer>
      </section>
    </main>
  );
}
