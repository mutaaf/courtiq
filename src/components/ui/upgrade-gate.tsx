'use client';
import { useTier } from '@/hooks/use-tier';
import { Button } from './button';
import { Lock, BarChart3, Sparkles, ArrowRight, Check, TrendingUp, Brain, Users, Target, Activity, Lightbulb, Eye } from 'lucide-react';
import Link from 'next/link';
import type { Tier } from '@/lib/tier';

interface FeatureConfig {
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  tagline: string;
  benefits: string[];
  requiredTier: Exclude<Tier, 'free'>;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
}

const MONTHLY_PRICES: Record<Exclude<Tier, 'free'>, number> = {
  coach: 9.99,
  pro_coach: 24.99,
  organization: 49.99,
};

const TIER_LABEL: Record<Exclude<Tier, 'free'>, string> = {
  coach: 'Coach',
  pro_coach: 'Pro Coach',
  organization: 'Organization',
};

const FEATURE_CONFIG: Record<string, FeatureConfig> = {
  analytics: {
    icon: BarChart3,
    headline: 'Unlock Team Analytics',
    tagline: 'See exactly where your team is improving — and where they need help.',
    benefits: [
      'Team health score tracked week by week',
      'Observation heatmap: who gets the most coaching attention',
      'Session quality trends over your entire season',
      'Practice-to-game skill transfer score per player',
      'Coaching pattern insights so you never miss a player',
    ],
    requiredTier: 'pro_coach',
    accentColor: 'text-blue-400',
    accentBg: 'bg-blue-500/15',
    accentBorder: 'border-blue-500/30',
  },
  assistant: {
    icon: Brain,
    headline: 'Unlock AI Coach Assistant',
    tagline: 'Your AI coaching partner — ask anything, get actionable answers instantly.',
    benefits: [
      'Ask anything about your players or team strategy',
      'Get tailored practice recommendations from your own data',
      'Analyse player development trends with natural language',
      'Game prep insights based on your scouting notes',
      'Drill ideas matched to your team\'s specific skill gaps',
    ],
    requiredTier: 'pro_coach',
    accentColor: 'text-purple-400',
    accentBg: 'bg-purple-500/15',
    accentBorder: 'border-purple-500/30',
  },
  report_cards: {
    icon: Target,
    headline: 'Unlock Player Report Cards',
    tagline: 'Beautiful, shareable reports parents actually love reading.',
    benefits: [
      'AI-generated progress reports per player',
      'Skill proficiency levels with clear visual indicators',
      'Strengths & growth areas highlighted for parents',
      'Shareable link with a single tap',
      'Coach\'s personalised message included',
    ],
    requiredTier: 'coach',
    accentColor: 'text-amber-400',
    accentBg: 'bg-amber-500/15',
    accentBorder: 'border-amber-500/30',
  },
  parent_sharing: {
    icon: Eye,
    headline: 'Unlock Parent Sharing',
    tagline: 'Keep families in the loop with one-tap progress reports.',
    benefits: [
      'Secure share link for each player',
      'Beautiful mobile-friendly parent portal',
      'Real-time skill progress and highlights',
      'Parents can send reactions back to you',
      'Team announcements displayed automatically',
    ],
    requiredTier: 'coach',
    accentColor: 'text-emerald-400',
    accentBg: 'bg-emerald-500/15',
    accentBorder: 'border-emerald-500/30',
  },
  multi_coach: {
    icon: Users,
    headline: 'Unlock Multi-Coach Collaboration',
    tagline: 'Bring your whole coaching staff onto one platform.',
    benefits: [
      'Invite assistant coaches and volunteers',
      'Shared observation feed across your program',
      'Role-based permissions for each coach',
      'Program-wide analytics and reporting',
      'Branded experience for your organisation',
    ],
    requiredTier: 'organization',
    accentColor: 'text-violet-400',
    accentBg: 'bg-violet-500/15',
    accentBorder: 'border-violet-500/30',
  },
  org_analytics: {
    icon: Activity,
    headline: 'Unlock Program Analytics',
    tagline: 'See the big picture across every team in your programme.',
    benefits: [
      'Cross-team skill breakdown at a glance',
      'Coach engagement leaderboard',
      'Programme-wide health score trends',
      'Identify which teams need support',
      'Export reports for directors and administrators',
    ],
    requiredTier: 'organization',
    accentColor: 'text-cyan-400',
    accentBg: 'bg-cyan-500/15',
    accentBorder: 'border-cyan-500/30',
  },
  custom_branding: {
    icon: Sparkles,
    headline: 'Unlock Custom Branding',
    tagline: 'Make the app look and feel like your organisation.',
    benefits: [
      'Upload your organisation\'s logo',
      'Set your accent colour across the whole platform',
      'Custom parent portal header text',
      'Branded share links for players and families',
      'White-label programme landing pages',
    ],
    requiredTier: 'organization',
    accentColor: 'text-pink-400',
    accentBg: 'bg-pink-500/15',
    accentBorder: 'border-pink-500/30',
  },
  tendencies: {
    icon: TrendingUp,
    headline: 'Unlock Opponent Tendencies',
    tagline: 'Walk into every game with a data-driven game plan.',
    benefits: [
      'Save and load opponent scouting profiles',
      'AI-generated game day prep sheets',
      'Tactical adjustments based on your observations',
      'Half-time insight cards',
      'Player match-up recommendations',
    ],
    requiredTier: 'pro_coach',
    accentColor: 'text-orange-400',
    accentBg: 'bg-orange-500/15',
    accentBorder: 'border-orange-500/30',
  },
  media_upload: {
    icon: Lightbulb,
    headline: 'Unlock Media Upload',
    tagline: 'Capture and analyse game footage and practice photos.',
    benefits: [
      'Upload game video or practice clips',
      'AI analyses player positioning and technique',
      'Photo-based observation capture',
      'Attach media to session notes',
      'Build a visual player development library',
    ],
    requiredTier: 'pro_coach',
    accentColor: 'text-teal-400',
    accentBg: 'bg-teal-500/15',
    accentBorder: 'border-teal-500/30',
  },
};

const TIER_ORDER: Tier[] = ['free', 'coach', 'pro_coach', 'organization'];

function getDefaultConfig(featureLabel?: string): FeatureConfig {
  return {
    icon: Lock,
    headline: `Unlock ${featureLabel || 'This Feature'}`,
    tagline: 'Upgrade your plan to access this premium feature.',
    benefits: [
      'Unlimited AI-powered coaching tools',
      'Player progress tracking and report cards',
      'Practice planning and game day prep',
      'Parent sharing and communication',
    ],
    requiredTier: 'coach',
    accentColor: 'text-orange-400',
    accentBg: 'bg-orange-500/15',
    accentBorder: 'border-orange-500/30',
  };
}

export function UpgradeGate({ feature, children, featureLabel }: {
  feature: string;
  children: React.ReactNode;
  featureLabel?: string;
}) {
  const { canAccess, tier } = useTier();

  if (canAccess(feature)) return <>{children}</>;

  const cfg = FEATURE_CONFIG[feature] ?? getDefaultConfig(featureLabel);
  const Icon = cfg.icon;
  const currentTierIndex = TIER_ORDER.indexOf(tier);
  const requiredTierIndex = TIER_ORDER.indexOf(cfg.requiredTier);

  // If the user is already at or above the required tier but still can't access,
  // they need to upgrade to org.
  const upgradeTarget = currentTierIndex >= requiredTierIndex ? 'organization' : cfg.requiredTier;
  const upgradeLabel = TIER_LABEL[upgradeTarget];
  const upgradePrice = MONTHLY_PRICES[upgradeTarget];

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className={`w-full max-w-md rounded-2xl border ${cfg.accentBorder} bg-zinc-900/80 overflow-hidden shadow-xl`}>
        {/* Accent header strip */}
        <div className={`${cfg.accentBg} px-6 pt-7 pb-5 text-center`}>
          <div className={`mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl ${cfg.accentBg} border ${cfg.accentBorder}`}>
            <Icon className={`h-7 w-7 ${cfg.accentColor}`} />
          </div>
          <h2 className="text-xl font-bold text-zinc-100">{cfg.headline}</h2>
          <p className="mt-1.5 text-sm text-zinc-400 leading-relaxed">{cfg.tagline}</p>
        </div>

        {/* Benefits list */}
        <div className="px-6 py-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            What you&apos;ll unlock
          </p>
          <ul className="space-y-2.5">
            {cfg.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <Check className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.accentColor}`} />
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        {/* CTA */}
        <div className="border-t border-zinc-800 px-6 py-5 space-y-3">
          <Link href={`/settings/upgrade`} className="block">
            <Button
              className="w-full bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20 active:scale-[0.98] transition-all h-12"
            >
              Upgrade to {upgradeLabel}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </Link>
          <p className="text-center text-xs text-zinc-500">
            {upgradeLabel} from ${upgradePrice}/month · Cancel anytime
          </p>
          <p className="text-center text-xs text-zinc-600">
            Currently on{' '}
            <span className="capitalize text-orange-400">{tier === 'free' ? 'Free' : tier.replace('_', ' ')}</span>{' '}
            plan
          </p>
        </div>
      </div>
    </div>
  );
}
