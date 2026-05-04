'use client';

import { useState, useEffect, use } from 'react';
import { CheckCircle2, AlertCircle, Loader2, Phone, User, Sparkles } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

interface TeamInfo {
  teamName: string;
  ageGroup: string | null;
  coachFirstName: string | null;
  players: { firstName: string; jerseyNumber: number | null }[];
}

type Step = 'loading' | 'error' | 'form' | 'success';

export default function ParentJoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [step, setStep] = useState<Step>('loading');
  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [loadError, setLoadError] = useState('');

  // Form state
  const [lookupMode, setLookupMode] = useState<'jersey' | 'name'>('jersey');
  const [jerseyNumber, setJerseyNumber] = useState('');
  const [playerFirstName, setPlayerFirstName] = useState('');
  const [parentName, setParentName] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [successName, setSuccessName] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/parents/join?token=${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setLoadError(body.error ?? 'This link is invalid or has expired.');
          setStep('error');
          return;
        }
        const data: TeamInfo = await res.json();
        setTeamInfo(data);
        setStep('form');
      } catch {
        setLoadError('Could not load team info. Check your connection and try again.');
        setStep('error');
      }
    }
    load();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/parents/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          jerseyNumber: lookupMode === 'jersey' ? jerseyNumber.trim() : undefined,
          playerFirstName: lookupMode === 'name' ? playerFirstName.trim() : undefined,
          parentName: parentName.trim(),
          parentPhone: parentPhone.trim(),
          parentEmail: parentEmail.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data.error || 'Something went wrong. Please try again.');
        return;
      }

      setSuccessName(data.playerFirstName || '');
      setStep('success');
    } catch {
      setSubmitError('Connection error. Please check your internet and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-3 py-12">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <p className="text-sm text-gray-500">Loading…</p>
        </div>
      </PageShell>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <PageShell>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Link expired or invalid</h2>
          <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{loadError}</p>
          <p className="text-xs text-gray-400 mt-2">Ask your coach to generate a new link.</p>
        </div>
      </PageShell>
    );
  }

  // ── Success state ─────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <PageShell teamName={teamInfo?.teamName}>
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">You're all set!</h2>
            {successName && (
              <p className="mt-1 text-gray-600">
                Coach {teamInfo?.coachFirstName ?? ''} will now send you updates about{' '}
                <span className="font-semibold text-gray-900">{successName}</span>.
              </p>
            )}
          </div>
          <div className="w-full rounded-xl border border-orange-100 bg-orange-50 p-4 text-left">
            <div className="flex items-start gap-2">
              <Sparkles className="h-4 w-4 shrink-0 mt-0.5 text-orange-500" />
              <p className="text-sm text-gray-700 leading-relaxed">
                You'll receive <strong>personalised progress updates</strong> after each practice
                — straight to your phone, no app needed.
              </p>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  // ── Form state ────────────────────────────────────────────────────────────

  const hasJerseys = teamInfo!.players.some((p) => p.jerseyNumber !== null);

  return (
    <PageShell teamName={teamInfo?.teamName}>
      <p className="text-sm text-gray-500 text-center leading-relaxed">
        {teamInfo?.coachFirstName
          ? `Coach ${teamInfo.coachFirstName} uses SportsIQ to send personalised updates after every practice.`
          : 'Your coach uses SportsIQ to send personalised updates after every practice.'}
        {' '}Add your number to stay in the loop.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">

        {/* ── Player lookup ───────────────────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-800">Your child</legend>

          {/* Toggle */}
          {hasJerseys && (
            <div className="flex rounded-lg border border-gray-200 p-1 bg-gray-50 gap-1">
              {(['jersey', 'name'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLookupMode(mode)}
                  className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                    lookupMode === mode
                      ? 'bg-white text-orange-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {mode === 'jersey' ? 'By jersey #' : 'By first name'}
                </button>
              ))}
            </div>
          )}

          {lookupMode === 'jersey' ? (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Jersey number
              </label>
              <input
                type="number"
                inputMode="numeric"
                placeholder="e.g. 12"
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                required={lookupMode === 'jersey'}
                min={0}
                max={99}
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 text-base placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                Child's first name
              </label>
              <input
                type="text"
                placeholder="e.g. Marcus"
                value={playerFirstName}
                onChange={(e) => setPlayerFirstName(e.target.value)}
                required={lookupMode === 'name'}
                autoCapitalize="words"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 text-base placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          )}
        </fieldset>

        {/* ── Parent info ─────────────────────────────────────────────── */}
        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-gray-800">Your contact info</legend>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Your name
            </label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="e.g. Sarah Johnson"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                required
                autoCapitalize="words"
                autoComplete="name"
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-gray-900 text-base placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              WhatsApp / mobile number
            </label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="tel"
                placeholder="e.g. (555) 123-4567"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                required
                autoComplete="tel"
                className="w-full rounded-xl border border-gray-300 bg-white py-3 pl-10 pr-4 text-gray-900 text-base placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Email <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="email"
              placeholder="you@example.com"
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-gray-900 text-base placeholder-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
          </div>
        </fieldset>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {submitError && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
            <p className="text-sm text-red-600">{submitError}</p>
          </div>
        )}

        {/* ── Submit ──────────────────────────────────────────────────── */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-orange-500 px-4 py-4 text-base font-semibold text-white shadow-sm hover:bg-orange-600 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Saving…
            </span>
          ) : (
            'Add me to the team updates'
          )}
        </button>

        <p className="text-center text-[11px] text-gray-400 leading-relaxed">
          Your contact info is only shared with your child's coach and never sold or shared with
          third parties. Powered by{' '}
          <Link href="/" className="text-orange-500 hover:underline">
            SportsIQ
          </Link>
          .
        </p>
      </form>
    </PageShell>
  );
}

// ── Shared page shell (light mode) ────────────────────────────────────────────

function PageShell({ children, teamName }: { children: React.ReactNode; teamName?: string }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500">
            <Image src="/logo.svg" alt="SportsIQ" width={28} height={28} className="invert" />
          </div>
          {teamName ? (
            <>
              <h1 className="text-xl font-bold text-gray-900">{teamName}</h1>
              <p className="text-[11px] font-medium uppercase tracking-wider text-orange-500">
                Parent Updates
              </p>
            </>
          ) : (
            <h1 className="text-xl font-bold text-gray-900">SportsIQ</h1>
          )}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
