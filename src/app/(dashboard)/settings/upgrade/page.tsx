'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useQuery } from '@tanstack/react-query';
import { query } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Loader2, CreditCard, ExternalLink, AlertCircle, Crown, Sparkles, Users, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Tier } from '@/lib/tier';
import { TIER_LIMITS } from '@/lib/tier';
import { trackEvent } from '@/lib/analytics';

const INTENT_CONFIG: Record<string, { label: string; tagline: string }> = {
  coach: { label: 'Coach Plan', tagline: 'Unlock unlimited players, AI observations, report cards, and parent sharing.' },
  pro_coach: { label: 'Pro Coach Plan', tagline: 'Add advanced analytics, the AI assistant, media uploads, and custom prompts.' },
  organization: { label: 'Organization Plan', tagline: 'Multi-coach collaboration, program-wide analytics, and custom branding.' },
};

export default function UpgradePage() {
  const { coach } = useActiveTeam();
  const searchParams = useSearchParams();
  const [annual, setAnnual] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'canceled'; message: string } | null>(null);
  const [intentDismissed, setIntentDismissed] = useState(false);

  const orgId = (coach as any)?.organizations?.id;
  const currentTier = ((coach as any)?.organizations?.tier || 'free') as Tier;

  const intentParam = searchParams.get('intent') ?? '';
  const intentConfig = !intentDismissed && INTENT_CONFIG[intentParam] ? INTENT_CONFIG[intentParam] : null;

  // Handle Stripe redirect query params
  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'success') {
      setToast({ type: 'success', message: 'Subscription activated! Welcome to your new plan.' });
    } else if (status === 'canceled') {
      setToast({ type: 'canceled', message: 'Checkout canceled. No charges were made.' });
    }
    if (status) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  // Fetch subscription status
  const { data: billing } = useQuery({
    queryKey: ['billing', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const org = await query<any>({
        table: 'organizations',
        select: 'tier, subscription_status, current_period_end, cancel_at_period_end, stripe_customer_id',
        filters: { id: orgId },
        single: true,
      });
      return org;
    },
    enabled: !!orgId,
  });

  const handleUpgrade = async (tier: string) => {
    setLoading(tier);
    trackEvent('upgrade_checkout_started', {
      target_tier: tier,
      interval: annual ? 'annual' : 'monthly',
    });
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, interval: annual ? 'annual' : 'monthly' }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      } else {
        trackEvent('upgrade_checkout_failed', { target_tier: tier, reason: data.error || 'unknown' });
        alert(data.error || 'Failed to create checkout');
      }
    } catch {
      trackEvent('upgrade_checkout_failed', { target_tier: tier, reason: 'network' });
      alert('Failed to start checkout');
    } finally {
      setLoading(null);
    }
  };

  const handlePortal = async () => {
    setLoading('portal');
    try {
      const res = await fetch('/api/stripe/portal', { method: 'POST' });
      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      }
    } catch {
      alert('Failed to open billing portal');
    } finally {
      setLoading(null);
    }
  };

  const plans = [
    {
      tier: 'coach' as const,
      name: 'Coach',
      icon: CreditCard,
      color: 'orange',
      monthlyPrice: 9.99,
      annualPrice: 7.99,
      features: ['3 teams, 1 sport', 'Unlimited players', 'Unlimited AI observations', 'Practice plans & game sheets', 'Player report cards', 'Parent sharing portal'],
    },
    {
      tier: 'pro_coach' as const,
      name: 'Pro Coach',
      icon: Sparkles,
      color: 'blue',
      popular: true,
      monthlyPrice: 24.99,
      annualPrice: 19.99,
      features: ['Unlimited teams & sports', 'Everything in Coach', 'AI Coach Assistant', 'Player analytics & trends', 'Session media upload', 'Custom AI prompts'],
    },
    {
      tier: 'organization' as const,
      name: 'Organization',
      icon: Users,
      color: 'purple',
      monthlyPrice: 49.99,
      annualPrice: 39.99,
      features: ['Everything in Pro Coach', 'Multi-coach collaboration', 'Program-wide analytics', 'Custom branding', 'Priority support'],
    },
  ];

  const tierOrder: Tier[] = ['free', 'coach', 'pro_coach', 'organization'];
  const currentTierIndex = tierOrder.indexOf(currentTier);

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-6 pb-16">
      {/* Toast */}
      {toast && (
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 text-sm animate-in fade-in slide-in-from-top-2 ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            : 'bg-zinc-800 border-zinc-700 text-zinc-300'
        }`}>
          {toast.type === 'success' ? (
            <Check className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          <span>{toast.message}</span>
          <button onClick={() => setToast(null)} className="ml-auto text-zinc-500 hover:text-zinc-300">
            &times;
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Plans & Billing</h1>
          <p className="text-zinc-400 text-sm">
            Manage your subscription and billing details.
          </p>
        </div>
      </div>

      {/* Post-onboarding intent welcome banner */}
      {intentConfig && (
        <div className="relative flex items-start gap-4 rounded-2xl border border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-orange-500/5 p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/20">
            <Sparkles className="h-5 w-5 text-orange-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-orange-300">Welcome! You&apos;re almost set up.</p>
            <p className="mt-0.5 text-sm text-zinc-400">
              You chose the <span className="font-medium text-orange-300">{intentConfig.label}</span>.{' '}
              {intentConfig.tagline}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Your account is ready — tap the plan card below to complete your upgrade.
            </p>
          </div>
          <button
            onClick={() => setIntentDismissed(true)}
            className="shrink-0 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Dismiss"
          >
            &times;
          </button>
        </div>
      )}

      {/* Current Plan Banner */}
      <Card className="border-zinc-800 bg-zinc-900/60">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/20">
                <Crown className="h-5 w-5 text-orange-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-zinc-100 capitalize">{currentTier.replace('_', ' ')} Plan</p>
                  <Badge variant="outline" className="border-orange-500/30 text-orange-400 text-xs">
                    Current
                  </Badge>
                </div>
                {billing?.subscription_status === 'active' && billing?.current_period_end && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {billing.cancel_at_period_end
                      ? `Expires on ${formatDate(billing.current_period_end)}`
                      : `Renews on ${formatDate(billing.current_period_end)}`
                    }
                  </p>
                )}
                {currentTier === 'free' && (
                  <p className="text-xs text-zinc-500 mt-0.5">Free forever</p>
                )}
              </div>
            </div>
            {billing?.stripe_customer_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePortal}
                disabled={loading === 'portal'}
                className="shrink-0"
              >
                {loading === 'portal' ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                )}
                Manage Subscription
              </Button>
            )}
          </div>

          {/* Past due warning */}
          {billing?.subscription_status === 'past_due' && (
            <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 flex items-center gap-3 text-sm text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Your payment method failed. Please update it to keep your subscription active.</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePortal}
                disabled={loading === 'portal'}
                className="ml-auto shrink-0 border-red-500/30 text-red-400 hover:bg-red-500/10"
              >
                Update Payment
              </Button>
            </div>
          )}

          {/* Cancel at period end warning */}
          {billing?.cancel_at_period_end && billing?.current_period_end && billing?.subscription_status !== 'past_due' && (
            <div className="mt-4 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-3 flex items-center gap-3 text-sm text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>Your plan will expire on {formatDate(billing.current_period_end)}. You can resubscribe anytime.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly/Annual Toggle */}
      <div className="flex items-center justify-center gap-3 py-2">
        <span className={`text-sm font-medium transition-colors ${!annual ? 'text-zinc-100' : 'text-zinc-500'}`}>Monthly</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${annual ? 'bg-orange-500' : 'bg-zinc-700'}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${annual ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        <span className={`text-sm font-medium transition-colors ${annual ? 'text-zinc-100' : 'text-zinc-500'}`}>Annual</span>
        {annual && (
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
            Save 20%
          </Badge>
        )}
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {plans.map((plan) => {
          const Icon = plan.icon;
          const isCurrent = plan.tier === currentTier;
          const planIndex = tierOrder.indexOf(plan.tier);
          const isDowngrade = planIndex < currentTierIndex;
          const price = annual ? plan.annualPrice : plan.monthlyPrice;
          const period = annual ? '/mo (billed yearly)' : '/month';

          const isIntended = intentParam === plan.tier && !isCurrent;
          const borderColor = isCurrent
            ? 'border-orange-500/50 bg-orange-500/5 shadow-lg shadow-orange-500/10'
            : isIntended
            ? 'border-orange-500 bg-orange-500/5 shadow-xl shadow-orange-500/20 ring-1 ring-orange-500/30'
            : plan.popular
            ? 'border-blue-500/30 bg-blue-500/5'
            : 'border-zinc-800 bg-zinc-900/40';

          return (
            <div
              key={plan.tier}
              className={`relative flex flex-col rounded-2xl border p-6 transition-all ${borderColor}`}
            >
              {/* Badges */}
              {isIntended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-orange-500 text-white text-xs px-3 py-0.5 shadow-sm animate-in fade-in">
                    Your Choice ✓
                  </Badge>
                </div>
              )}
              {plan.popular && !isCurrent && !isIntended && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-blue-500 text-white text-xs px-3 py-0.5 shadow-sm">
                    Most Popular
                  </Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-orange-500 text-white text-xs px-3 py-0.5 shadow-sm">
                    Current Plan
                  </Badge>
                </div>
              )}

              {/* Icon + Name */}
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${
                plan.color === 'orange' ? 'bg-orange-500/20' :
                plan.color === 'blue' ? 'bg-blue-500/20' :
                'bg-purple-500/20'
              }`}>
                <Icon className={`h-5 w-5 ${
                  plan.color === 'orange' ? 'text-orange-400' :
                  plan.color === 'blue' ? 'text-blue-400' :
                  'text-purple-400'
                }`} />
              </div>
              <p className="font-bold text-lg text-zinc-100">{plan.name}</p>

              {/* Price */}
              <div className="mt-2 mb-5">
                <span className="text-3xl font-extrabold text-zinc-100">${price}</span>
                <span className="text-sm text-zinc-500 ml-1">{period}</span>
                {annual && (
                  <p className="text-xs text-zinc-600 mt-0.5 line-through">${plan.monthlyPrice}/month</p>
                )}
              </div>

              {/* Features */}
              <ul className="flex-1 space-y-2.5 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-zinc-300">
                    <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>

              {/* CTA */}
              {isCurrent ? (
                <Button
                  disabled
                  variant="outline"
                  className="w-full border-zinc-700 text-zinc-500"
                >
                  Current Plan
                </Button>
              ) : isDowngrade ? (
                <Button
                  variant="outline"
                  className="w-full border-zinc-700 text-zinc-400 hover:text-zinc-200"
                  onClick={handlePortal}
                  disabled={loading === 'portal'}
                >
                  {loading === 'portal' ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : null}
                  Manage Plan
                </Button>
              ) : plan.tier === 'organization' && currentTier !== 'organization' ? (
                <Link href="mailto:sales@youthsportsiq.com" className="block">
                  <Button variant="outline" className="w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                    Contact Sales
                  </Button>
                </Link>
              ) : (
                <Button
                  className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/25 active:scale-[0.98] transition-all"
                  onClick={() => handleUpgrade(plan.tier)}
                  disabled={loading === plan.tier}
                >
                  {loading === plan.tier ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  ) : null}
                  {isIntended ? `Activate ${plan.name}` : `Upgrade to ${plan.name}`}
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Free tier note */}
      {currentTier === 'free' && (
        <Card className="border-zinc-800">
          <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-medium text-zinc-200">Currently on the Free plan</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                1 team, 10 players, 5 AI features/month. Upgrade to unlock unlimited potential.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* FAQ / contact note */}
      <Card className="border-zinc-800">
        <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-medium text-zinc-200">Questions about pricing?</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              We offer discounts for youth leagues, nonprofits, and first-year coaches.
            </p>
          </div>
          <Link href="mailto:support@youthsportsiq.com">
            <Button variant="outline" className="shrink-0 touch-manipulation active:scale-[0.98]">
              Contact Us
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
