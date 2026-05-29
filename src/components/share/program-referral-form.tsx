'use client';

/**
 * Ticket 0050 — the parent-side modal that forwards the current parent-portal
 * report to the league's program director.
 *
 * Section sits BELOW the existing "share with your other coach" CTA (0011)
 * and the "start your own team" CTA (0019). The header — "Want SportsIQ for
 * your whole league?" — frames the surface as upstream-to-director, not
 * lateral-to-other-parent.
 *
 * Three fields: director first name, director email, optional one-line note.
 * The parent's own first name comes in as a prop (the share page already
 * knows it — `parent_name` or fallback). Client-side email shape validation
 * keeps the modal open with an inline error; the server-side route enforces
 * the same shape (defense in depth, LESSONS#0023 family).
 *
 * On success the section copy swaps to "Sent to <directorFirstName>. They'll
 * get a link to this report." and we set a localStorage flag so the parent's
 * re-visit (no signed identity client-side) renders the confirmation by
 * default — with a small "Share with another director" affordance for
 * multi-director leagues.
 *
 * Voice: positive, factual, no banned words (AGENTS.md / LESSONS#0023). Dark
 * theme is for coach surfaces — this is the parent portal (gray/orange).
 */

import { useEffect, useState } from 'react';
import { Megaphone, CheckCircle2, X } from 'lucide-react';
import { isValidEmailShape } from '@/lib/program-referral-utils';

interface ProgramReferralFormProps {
  shareToken: string;
  parentFirstName: string;
}

interface SubmitResponse {
  success?: boolean;
  alreadySent?: boolean;
  directorFirstName?: string;
  error?: string;
}

const STORAGE_KEY_PREFIX = 'sportsiq_program_referral_sent:';

export function ProgramReferralForm({
  shareToken,
  parentFirstName,
}: ProgramReferralFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [directorFirstName, setDirectorFirstName] = useState('');
  const [directorEmail, setDirectorEmail] = useState('');
  const [note, setNote] = useState('');
  const [emailError, setEmailError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmedDirector, setConfirmedDirector] = useState<string | null>(null);

  // Re-visit detection — a parent who already submitted once sees the
  // confirmation copy by default, with the option to share with another
  // director (multi-director leagues are explicit in scope). localStorage
  // never contains minor data; only the director's first name we just
  // confirmed back to them.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY_PREFIX + shareToken);
      if (stored) setConfirmedDirector(stored);
    } catch {
      // localStorage may throw under sandboxed contexts — degrade silently.
    }
  }, [shareToken]);

  function resetForm() {
    setDirectorFirstName('');
    setDirectorEmail('');
    setNote('');
    setEmailError('');
    setGeneralError('');
  }

  function closeModal() {
    setIsOpen(false);
    resetForm();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');
    setGeneralError('');

    if (!isValidEmailShape(directorEmail)) {
      setEmailError('Please enter a valid email for the director.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/share/${shareToken}/program-referral`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentFirstName,
          directorFirstName: directorFirstName.trim(),
          directorEmail: directorEmail.trim(),
          note: note.trim() || undefined,
        }),
      });
      const data: SubmitResponse = await res.json();

      if (!res.ok) {
        setGeneralError(data.error || 'Something went wrong. Please try again.');
        setLoading(false);
        return;
      }

      const confirmedName = data.directorFirstName || directorFirstName.trim();
      setConfirmedDirector(confirmedName);
      try {
        window.localStorage.setItem(STORAGE_KEY_PREFIX + shareToken, confirmedName);
      } catch {
        // Confirmation still renders this visit; the flag is just for re-visits.
      }
      setIsOpen(false);
      resetForm();
    } catch {
      setGeneralError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Confirmation state (post-success or re-visit) ─────────────────────────
  if (confirmedDirector && !isOpen) {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-5 shadow-sm"
        data-testid="program-referral-section"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
            <CheckCircle2 className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900">
              Sent to {confirmedDirector}.
            </p>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              They&apos;ll get a link to this same report and a way to bring
              the rest of your league onto SportsIQ.
            </p>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              data-testid="program-referral-share-another"
              className="mt-3 text-xs font-semibold text-orange-700 underline underline-offset-2 hover:text-orange-800"
            >
              Share with another director
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Default state — section + button + (optional) modal ───────────────────
  return (
    <div
      className="mx-4 mt-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm"
      data-testid="program-referral-section"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
          <Megaphone className="h-5 w-5 text-orange-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Want SportsIQ for your whole league?
          </h3>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            Forward this update to your program director so every coach in the
            league can run the same playbook.
          </p>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            data-testid="program-referral-open"
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            Send this to our program director
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="program-referral-modal-title"
          data-testid="program-referral-modal"
        >
          <form
            onSubmit={handleSubmit}
            noValidate
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2
                  id="program-referral-modal-title"
                  className="text-base font-semibold text-gray-900"
                >
                  Who runs your league?
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  We&apos;ll send them a link to this update from your coach.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="ml-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
                data-testid="program-referral-close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {generalError && (
              <p
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                data-testid="program-referral-error"
              >
                {generalError}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="director-first-name"
                  className="text-xs font-medium text-gray-700"
                >
                  Director&apos;s first name
                </label>
                <input
                  id="director-first-name"
                  type="text"
                  value={directorFirstName}
                  onChange={(e) => setDirectorFirstName(e.target.value)}
                  required
                  placeholder="Jordan"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  data-testid="program-referral-director-name"
                />
              </div>

              <div>
                <label
                  htmlFor="director-email"
                  className="text-xs font-medium text-gray-700"
                >
                  Director&apos;s email
                </label>
                <input
                  id="director-email"
                  type="email"
                  value={directorEmail}
                  onChange={(e) => {
                    setDirectorEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  required
                  placeholder="jordan@league.org"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  data-testid="program-referral-director-email"
                />
                {emailError && (
                  <p
                    className="mt-1 text-xs text-red-600"
                    data-testid="program-referral-email-error"
                  >
                    {emailError}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="referral-note" className="text-xs font-medium text-gray-700">
                  Add a note (optional)
                </label>
                <textarea
                  id="referral-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={
                    directorFirstName.trim()
                      ? `Optional — anything you want to say to ${directorFirstName.trim()}`
                      : 'Optional — anything you want to say'
                  }
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  data-testid="program-referral-note"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                data-testid="program-referral-submit"
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send'}
              </button>
            </div>

            <p className="mt-3 text-[11px] text-gray-400">
              We&apos;ll send one email and never share your details with anyone else.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
