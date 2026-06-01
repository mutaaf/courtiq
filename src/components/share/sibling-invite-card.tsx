'use client';

/**
 * Ticket 0060 — the parent-portal card that lets a parent reading kid A's
 * report tap once to invite kid B's coach onto SportsIQ.
 *
 * Three states, decided server-side by GET /api/share/[token]/sibling-
 * invite-candidate (the parent surface fetches the result with a small
 * client useEffect on mount — same posture as the existing share-page
 * client components):
 *
 *   1) `candidate` present, `alreadyOnSportsIQ: false` — render the card
 *      with a "Bring <sibling>'s coach onto SportsIQ?" headline and a
 *      single primary button that opens the pre-filled sheet. Sending POSTs
 *      to /sibling-invite and flips the card to the thank-you state.
 *
 *   2) `candidate: null`, `alreadyOnSportsIQ: true` — render the 0019
 *      self-signup pivot copy ("Start your own account / connect <sibling>'s
 *      report").
 *
 *   3) `candidate: null`, `alreadyOnSportsIQ: false` — render NOTHING. The
 *      AC says silence beats a generic invite CTA every time.
 *
 * Aesthetic: parent-portal light-mode (gray/orange), mirrors the existing
 * 0011 "Share with your other coach" card. NEVER dark theme.
 *
 * Voice (LESSONS#0023): instruct positively in this comment header; the
 * user-visible strings never name the AGENTS.md banned tokens (the
 * component test scans the rendered DOM and would fail if they did).
 *
 * Test hooks: `data-testid="sibling-invite-card"` on the outer container
 * (LESSONS#0029 / #0082 — scope page-wide getByText collisions) and
 * `data-share-url={referralUrl}` on the open trigger (LESSONS#0056 / #0082
 * — the card renders no `<a href>`, so the URL the email will carry is
 * exposed as a data attribute for the unit + e2e to assert).
 */

import { useState } from 'react';
import { CheckCircle2, Sparkles, X } from 'lucide-react';
import { isValidEmailShape } from '@/lib/sibling-invite-utils';

export interface SiblingInviteCandidate {
  otherTeamName: string;
  otherCoachName: string;
  otherCoachEmail: string;
  siblingFirstName: string;
  programId: string | null;
}

export interface SiblingInviteCardProps {
  shareToken: string;
  candidate: SiblingInviteCandidate | null;
  alreadyOnSportsIQ: boolean;
  /** The PROGRAM-scoped referral code (NOT the inviting coach's). */
  referralCode: string | null;
}

interface SiblingInviteResponse {
  sent?: boolean;
  reason?: string;
  error?: string;
}

const APP_URL_DEFAULT = 'https://youthsportsiq.com';

function getAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return APP_URL_DEFAULT;
}

export function SiblingInviteCard({
  shareToken,
  candidate,
  alreadyOnSportsIQ,
  referralCode,
}: SiblingInviteCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [siblingFirstName, setSiblingFirstName] = useState(candidate?.siblingFirstName ?? '');
  const [otherCoachEmail, setOtherCoachEmail] = useState(candidate?.otherCoachEmail ?? '');
  const [note, setNote] = useState('');
  const [emailError, setEmailError] = useState('');
  const [generalError, setGeneralError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentToCoachName, setSentToCoachName] = useState<string | null>(null);

  // ─── Empty branch (no candidate, not-already) ─────────────────────────────
  if (!candidate && !alreadyOnSportsIQ) {
    return null;
  }

  // ─── Already-on-SportsIQ pivot to the 0019 self-signup surface ────────────
  if (!candidate && alreadyOnSportsIQ) {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm"
        data-testid="sibling-invite-card"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
            <Sparkles className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900">
              Your other coach is already on SportsIQ
            </h3>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              Start your own account to connect both of your kid&apos;s reports under one inbox.
            </p>
            <a
              href={
                referralCode
                  ? `/signup?ref=${referralCode}`
                  : '/signup'
              }
              data-testid="sibling-invite-self-signup-link"
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] transition-all"
            >
              Start your own account
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ─── Default branch — candidate present, not-already-on-SportsIQ ──────────
  // candidate is non-null in this branch by the guards above.
  const c = candidate!;
  const base = getAppUrl();
  const referralUrl = referralCode && c.programId
    ? `${base}/?ref=${referralCode}&program=${c.programId}`
    : base;

  function closeSheet() {
    setSheetOpen(false);
    setEmailError('');
    setGeneralError('');
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setEmailError('');
    setGeneralError('');

    if (!isValidEmailShape(otherCoachEmail)) {
      setEmailError("Please enter a valid email for the other coach.");
      return;
    }
    if (note.length > 200) {
      setGeneralError('Note is too long — please keep it under 200 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/share/${shareToken}/sibling-invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          siblingFirstName: siblingFirstName.trim(),
          otherCoachEmail: otherCoachEmail.trim(),
          note: note.trim() || undefined,
        }),
      });
      const data: SiblingInviteResponse = await res.json();
      if (!res.ok) {
        if (data.reason === 'rate-limited') {
          setGeneralError("You've sent a few invites from this report already. Try again in a few days.");
        } else {
          setGeneralError(data.error || 'Something went wrong. Please try again.');
        }
        setLoading(false);
        return;
      }
      // Flip the card to the thank-you state regardless of `sent` —
      // dedupe (sent:false, reason:already-invited) ALSO means the
      // recipient has heard from this report; the parent shouldn't be
      // re-prompted.
      const coachFirst = (c.otherCoachName || 'Coach').split(/\s+/).slice(-1)[0];
      setSentToCoachName(coachFirst);
      setSheetOpen(false);
    } catch {
      setGeneralError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // ─── Thank-you state ───────────────────────────────────────────────────────
  if (sentToCoachName) {
    return (
      <div
        className="mx-4 mt-4 rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-5 shadow-sm"
        data-testid="sibling-invite-card"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
            <CheckCircle2 className="h-5 w-5 text-orange-600" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-semibold text-gray-900"
              data-testid="sibling-invite-sent"
            >
              Invite sent to {sentToCoachName}.
            </p>
            <p className="mt-1 text-xs text-gray-600 leading-relaxed">
              {c.siblingFirstName}&apos;s coach will get one email with a link to see how this works.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Default card + (optional) sheet ───────────────────────────────────────
  return (
    <div
      className="mx-4 mt-4 rounded-2xl border border-orange-100 bg-white p-5 shadow-sm"
      data-testid="sibling-invite-card"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100">
          <Sparkles className="h-5 w-5 text-orange-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Bring {c.siblingFirstName}&apos;s coach onto SportsIQ?
          </h3>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            {c.siblingFirstName} is on the <strong>{c.otherTeamName}</strong>. We&apos;ll send {c.otherCoachName} a short email with a link to see how this works.
          </p>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            data-testid="sibling-invite-open"
            data-share-url={referralUrl}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] transition-all"
          >
            Invite {c.otherCoachName || 'Coach'} with one tap
          </button>
        </div>
      </div>

      {sheetOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sibling-invite-sheet-title"
          data-testid="sibling-invite-sheet"
        >
          <form
            onSubmit={handleSend}
            noValidate
            className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2
                  id="sibling-invite-sheet-title"
                  className="text-base font-semibold text-gray-900"
                >
                  Send {c.otherCoachName || 'the coach'} a short email
                </h2>
                <p className="mt-1 text-xs text-gray-500">
                  One email. We never share your details with anyone else.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSheet}
                className="ml-3 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
                data-testid="sibling-invite-close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            {generalError && (
              <p
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                data-testid="sibling-invite-error"
              >
                {generalError}
              </p>
            )}

            <div className="space-y-3">
              <div>
                <label
                  htmlFor="sibling-first-name"
                  className="text-xs font-medium text-gray-700"
                >
                  {c.siblingFirstName ? `${c.siblingFirstName}'s first name` : "Sibling's first name"}
                </label>
                <input
                  id="sibling-first-name"
                  type="text"
                  value={siblingFirstName}
                  onChange={(e) => setSiblingFirstName(e.target.value)}
                  required
                  data-testid="sibling-invite-sibling-first-name"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
              </div>

              <div>
                <label
                  htmlFor="other-coach-email"
                  className="text-xs font-medium text-gray-700"
                >
                  Other coach&apos;s email
                </label>
                <input
                  id="other-coach-email"
                  type="email"
                  value={otherCoachEmail}
                  onChange={(e) => {
                    setOtherCoachEmail(e.target.value);
                    if (emailError) setEmailError('');
                  }}
                  required
                  data-testid="sibling-invite-other-coach-email"
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
                {emailError && (
                  <p
                    className="mt-1 text-xs text-red-600"
                    data-testid="sibling-invite-email-error"
                  >
                    {emailError}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="sibling-invite-note" className="text-xs font-medium text-gray-700">
                  Add a note (optional)
                </label>
                <textarea
                  id="sibling-invite-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  rows={3}
                  data-testid="sibling-invite-note"
                  placeholder={`Optional — anything you want to say to ${c.otherCoachName || 'the coach'}`}
                  className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                />
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeSheet}
                className="rounded-xl px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                data-testid="sibling-invite-send"
                className="rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send invite'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
