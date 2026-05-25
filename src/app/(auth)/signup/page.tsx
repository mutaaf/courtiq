'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Loader2, CheckCircle2, CreditCard, Sparkles } from 'lucide-react';

const PLAN_CONFIG: Record<string, { label: string; price: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  coach: { label: 'Coach Plan', price: '$9.99/mo', icon: CreditCard, color: 'text-orange-400' },
  pro_coach: { label: 'Pro Coach Plan', price: '$24.99/mo', icon: Sparkles, color: 'text-purple-400' },
};

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-950">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get('ref') ?? '';
  // Program staff-invite path (ticket 0024): /org/<slug> CTA deep-links here as
  // /signup?org=<slug>. Forwarded to /api/auth/setup so the new coach attaches
  // to that existing program. Independent of the `ref` referral path — both may
  // be present at once.
  const orgSlug = searchParams.get('org') ?? '';
  // Per-team claim path (ticket 0033): the /org/<slug> per-team CTA deep-links
  // here as /signup?org=<slug>&team=<teamId>. Forwarded to /api/auth/setup so the
  // new coach lands associated with the exact team they coach (the route only
  // honors a team that belongs to the resolved org). Independent of `ref`/`org`.
  const teamId = searchParams.get('team') ?? '';
  const planParam = searchParams.get('plan') ?? '';
  const planConfig = PLAN_CONFIG[planParam] ?? null;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Warm-landing: resolve the inviting coach's first name from the referral code
  // so the banner can name them ("Coach Sarah invited you") instead of the
  // generic "a fellow coach" copy (ticket 0021). Best-effort only — if it
  // doesn't resolve or the fetch fails, we keep today's generic copy byte-for-
  // byte. Attribution (referredByCode → /api/auth/setup) is untouched.
  const [inviterFirstName, setInviterFirstName] = useState<string | null>(null);

  useEffect(() => {
    if (!refCode) return;
    let cancelled = false;
    fetch(`/api/referrals/lookup?code=${encodeURIComponent(refCode)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.coachFirstName === 'string') {
          setInviterFirstName(data.coachFirstName);
        }
      })
      .catch(() => {
        // Stay on the generic banner — a bad lookup never blocks signup.
      });
    return () => {
      cancelled = true;
    };
  }, [refCode]);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!ageConfirmed) {
      setError('You must confirm you are 13 years or older to create an account.');
      return;
    }
    setError('');
    setLoading(true);

    // Persist plan intent so the tutorial page can redirect to upgrade after onboarding
    if (planParam && PLAN_CONFIG[planParam]) {
      try { sessionStorage.setItem('sportsiq_plan_intent', planParam); } catch {}
    }

    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (data.user && !data.session) {
      setSuccess(true);
      setLoading(false);
      return;
    }

    // Auto-confirmed — create coach record via API (bypasses RLS)
    if (data.user && data.session) {
      await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName,
          referredByCode: refCode || undefined,
          org: orgSlug || undefined,
          team: teamId || undefined,
        }),
      });
      router.push('/onboarding/setup');
      router.refresh();
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" />
            <h2 className="mt-4 text-xl font-semibold text-zinc-100">Check your email</h2>
            <p className="mt-2 text-sm text-zinc-400">
              We sent a confirmation link to <strong>{email}</strong>
            </p>
            {planConfig && (
              <p className="mt-3 text-xs text-zinc-500">
                Your <span className={planConfig.color}>{planConfig.label}</span> will be ready to activate after you confirm your email.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-orange-500 p-2">
            <img src="/logo.svg" alt="SportsIQ" width={32} height={32} className="invert" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            {refCode
              ? inviterFirstName
                ? `Coach ${inviterFirstName} invited you to SportsIQ`
                : 'You were invited by a fellow coach!'
              : planConfig
                ? `You're one step away from your ${planConfig.label}`
                : 'Start coaching smarter with SportsIQ'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Plan intent banner */}
          {planConfig && (() => {
            const Icon = planConfig.icon;
            return (
              <div className="mb-4 flex items-center gap-3 rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/20">
                  <Icon className="h-4 w-4 text-orange-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-orange-300">{planConfig.label}</p>
                  <p className="text-xs text-zinc-400">
                    {planConfig.price} · unlocks after account setup
                  </p>
                </div>
              </div>
            );
          })()}

          {/* Referral banner — names the inviting coach when the code resolves
              (ticket 0021), else falls back to the generic copy. */}
          {refCode && (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-sm text-emerald-400">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              {inviterFirstName
                ? `Coach ${inviterFirstName} invited you — start free`
                : 'Referral applied — your coach connection will be tracked'}
            </div>
          )}

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-500/10 p-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
            <div className="space-y-2">
              {/* htmlFor/id wiring so the label is an accessible name for the
                  input (getByLabel + screen readers). See ticket 0006. */}
              <label htmlFor="full-name" className="text-sm text-zinc-400">Full Name</label>
              <Input
                id="full-name"
                type="text"
                placeholder="Coach Mike"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm text-zinc-400">Email</label>
              <Input
                id="email"
                type="email"
                placeholder="coach@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm text-zinc-400">Password</label>
              <Input
                id="password"
                type="password"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-orange-500 focus:ring-orange-500"
              />
              <span className="text-xs text-zinc-400">
                I confirm I am 13 years or older
              </span>
            </label>
            <Button type="submit" className="w-full" disabled={loading || !ageConfirmed}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {planConfig ? `Create Account & Continue to ${planConfig.label}` : 'Create Account'}
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-zinc-400">
            Already have an account?{' '}
            <Link href="/login" className="text-orange-500 hover:underline">
              Sign in
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-zinc-500">
            Just exploring?{' '}
            <Link href="/onboarding/demo" className="text-orange-500 hover:underline">
              Try a demo team
            </Link>{' '}
            (no sign-up required to look around once you have an account).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
