'use client';

import { useTier } from '@/hooks/use-tier';
import { type Tier } from '@/lib/tier';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, Zap, Star, Building2, Lock } from 'lucide-react';
import Link from 'next/link';

// ─── Tier definitions ─────────────────────────────────────────────────────────

interface TierDef {
  id: Tier;
  name: string;
  price: string;
  period: string;
  tagline: string;
  cta: string;
  ctaHref: string;
  highlighted: boolean;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  badgeLabel?: string;
  features: string[];
}

const TIER_DEFS: TierDef[] = [
  {
    id: 'free',
    name: 'Free',
    price: '$0',
    period: 'forever',
    tagline: 'Perfect for trying it out',
    cta: 'Current plan',
    ctaHref: '/home',
    highlighted: false,
    icon: Zap,
    iconBg: 'bg-zinc-700',
    iconColor: 'text-zinc-300',
    features: [
      '1 team',
      'Up to 10 players',
      '5 AI features per month',
      'Voice & typed observations',
      'Basic practice plans',
      'Player roster',
    ],
  },
  {
    id: 'coach',
    name: 'Coach',
    price: '$9',
    period: 'per month',
    tagline: 'For dedicated coaches',
    cta: 'Upgrade to Coach',
    ctaHref: 'mailto:upgrade@sportsiq.app?subject=Upgrade%20to%20Coach',
    highlighted: true,
    badgeLabel: 'Most popular',
    icon: Star,
    iconBg: 'bg-orange-500/20',
    iconColor: 'text-orange-400',
    features: [
      '3 teams',
      'Unlimited players',
      'Unlimited AI features',
      'Parent sharing & reports',
      'Session management',
      'All plan types (newsletter, game prep…)',
      'Coach Replay timeline',
      'Skill Challenge Cards',
    ],
  },
  {
    id: 'pro_coach',
    name: 'Pro Coach',
    price: '$19',
    period: 'per month',
    tagline: 'For high-performance programs',
    cta: 'Upgrade to Pro',
    ctaHref: 'mailto:upgrade@sportsiq.app?subject=Upgrade%20to%20Pro%20Coach',
    highlighted: false,
    icon: Star,
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-400',
    features: [
      'Unlimited teams & sports',
      'All Coach features',
      'Analytics dashboard',
      'AI Assistant chat',
      'Photo & video analysis',
      'Custom AI prompts',
      'Opponent tendency analysis',
      'Season Storyline narrative',
    ],
  },
  {
    id: 'organization',
    name: 'Organization',
    price: 'Custom',
    period: 'contact us',
    tagline: 'For programs with multiple coaches',
    cta: 'Contact sales',
    ctaHref: 'mailto:sales@sportsiq.app?subject=Organization%20Plan',
    highlighted: false,
    icon: Building2,
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-400',
    features: [
      'Everything in Pro Coach',
      'Multi-coach management',
      'Organization-wide analytics',
      'Custom branding & white-label',
      'Priority support',
      'Onboarding & training',
    ],
  },
];

// ─── Shared feature rows for comparison table ─────────────────────────────────

interface FeatureRow {
  label: string;
  free: string | boolean;
  coach: string | boolean;
  pro: string | boolean;
  org: string | boolean;
}

const FEATURE_ROWS: FeatureRow[] = [
  { label: 'Teams',           free: '1',         coach: '3',         pro: 'Unlimited', org: 'Unlimited' },
  { label: 'Players / team',  free: '10',        coach: 'Unlimited', pro: 'Unlimited', org: 'Unlimited' },
  { label: 'AI features / mo',free: '5',         coach: 'Unlimited', pro: 'Unlimited', org: 'Unlimited' },
  { label: 'Observations',    free: true,        coach: true,        pro: true,        org: true },
  { label: 'Practice plans',  free: 'Basic',     coach: true,        pro: true,        org: true },
  { label: 'Parent sharing',  free: false,       coach: true,        pro: true,        org: true },
  { label: 'Session tracking',free: false,       coach: true,        pro: true,        org: true },
  { label: 'Analytics',       free: false,       coach: false,       pro: true,        org: true },
  { label: 'AI Assistant',    free: false,       coach: false,       pro: true,        org: true },
  { label: 'Media upload',    free: false,       coach: false,       pro: true,        org: true },
  { label: 'Multi-coach',     free: false,       coach: false,       pro: false,       org: true },
  { label: 'Custom branding', free: false,       coach: false,       pro: false,       org: true },
];

function FeatureCell({ value }: { value: string | boolean }) {
  if (value === false) return <span className="text-zinc-700 text-lg">—</span>;
  if (value === true) return <Check className="h-4 w-4 text-emerald-400 mx-auto" />;
  return <span className="text-xs text-zinc-300 text-center">{value}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UpgradePage() {
  const { tier } = useTier();

  return (
    <div className="p-4 lg:p-8 max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/settings">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Plans &amp; Pricing</h1>
          <p className="text-zinc-400 text-sm">
            Current plan:{' '}
            <span className="capitalize text-orange-400 font-medium">
              {tier.replace('_', ' ')}
            </span>
          </p>
        </div>
      </div>

      {/* Plan cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {TIER_DEFS.map((t) => {
          const Icon = t.icon;
          const isCurrent = t.id === tier;
          return (
            <div
              key={t.id}
              className={`relative flex flex-col rounded-2xl border p-5 transition-all ${
                t.highlighted
                  ? 'border-orange-500/50 bg-orange-500/5 shadow-lg shadow-orange-500/10'
                  : 'border-zinc-800 bg-zinc-900/40'
              }`}
            >
              {t.badgeLabel && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-orange-500 text-white text-xs px-3 py-0.5 shadow-sm">
                    {t.badgeLabel}
                  </Badge>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-3 right-4">
                  <Badge variant="outline" className="border-zinc-600 text-zinc-400 text-xs">
                    Current
                  </Badge>
                </div>
              )}

              {/* Icon + name */}
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl mb-3 ${t.iconBg}`}>
                <Icon className={`h-5 w-5 ${t.iconColor}`} />
              </div>
              <p className="font-bold text-base text-zinc-100">{t.name}</p>
              <p className="text-xs text-zinc-500 mt-0.5 mb-4">{t.tagline}</p>

              {/* Price */}
              <div className="mb-5">
                <span className="text-3xl font-extrabold text-zinc-100">{t.price}</span>
                {t.price !== 'Custom' && (
                  <span className="text-xs text-zinc-500 ml-1">/ {t.period}</span>
                )}
                {t.price === 'Custom' && (
                  <p className="text-xs text-zinc-500 mt-0.5">{t.period}</p>
                )}
              </div>

              {/* Features list */}
              <ul className="flex-1 space-y-2 mb-6">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-zinc-300">
                    <Check className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
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
                  Current plan
                </Button>
              ) : (
                <Link href={t.ctaHref} className="block">
                  <Button
                    className={`w-full touch-manipulation active:scale-[0.98] ${
                      t.highlighted ? 'bg-orange-500 hover:bg-orange-600' : ''
                    }`}
                    variant={t.highlighted ? 'default' : 'outline'}
                  >
                    {t.id === 'free' ? (
                      <>
                        <Lock className="h-4 w-4" />
                        {t.cta}
                      </>
                    ) : (
                      t.cta
                    )}
                  </Button>
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Comparison table — desktop only */}
      <div className="hidden lg:block">
        <h2 className="text-lg font-semibold mb-4 text-zinc-200">Feature comparison</h2>
        <div className="rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/60">
                <th className="text-left px-5 py-3 text-zinc-400 font-medium w-48">Feature</th>
                {TIER_DEFS.map((t) => (
                  <th key={t.id} className="text-center px-4 py-3 font-medium">
                    <span className={t.id === tier ? 'text-orange-400' : 'text-zinc-300'}>
                      {t.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {FEATURE_ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={`border-b border-zinc-800/60 ${
                    i % 2 === 0 ? 'bg-transparent' : 'bg-zinc-900/20'
                  }`}
                >
                  <td className="px-5 py-3 text-zinc-400 text-xs">{row.label}</td>
                  <td className="px-4 py-3 text-center"><FeatureCell value={row.free} /></td>
                  <td className="px-4 py-3 text-center bg-orange-500/5"><FeatureCell value={row.coach} /></td>
                  <td className="px-4 py-3 text-center"><FeatureCell value={row.pro} /></td>
                  <td className="px-4 py-3 text-center"><FeatureCell value={row.org} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAQ / contact note */}
      <Card className="border-zinc-800">
        <CardContent className="p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <p className="font-medium text-zinc-200">Questions about pricing?</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              We offer discounts for youth leagues, nonprofits, and first-year coaches.
            </p>
          </div>
          <Link href="mailto:support@sportsiq.app">
            <Button variant="outline" className="shrink-0 touch-manipulation active:scale-[0.98]">
              Contact us
            </Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
