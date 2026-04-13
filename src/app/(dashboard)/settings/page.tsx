'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent } from '@/components/ui/card';
import {
  User,
  Building2,
  ChevronRight,
  Dumbbell,
  Sparkles,
  Sun,
  Moon,
  Rocket,
  Trophy,
  Gift,
  Award,
  Webhook,
  History,
  Contrast,
} from 'lucide-react';
import Link from 'next/link';
import { useTheme } from '@/hooks/use-theme';
import { useHighContrast } from '@/hooks/use-high-contrast';

interface SettingCard {
  href: string;
  label: string;
  description: string;
  icon: typeof User;
  iconColor: string;
  adminOnly?: boolean;
}

const SETTING_CARDS: SettingCard[] = [
  {
    href: '/settings/ai',
    label: 'AI & API Keys',
    description: 'Configure your AI provider and API keys',
    icon: Sparkles,
    iconColor: 'text-orange-400 bg-orange-500/20',
  },
  {
    href: '/settings/profile',
    label: 'Profile',
    description: 'Your name, email, and avatar',
    icon: User,
    iconColor: 'text-blue-400 bg-blue-500/20',
  },
  {
    href: '/settings/organization',
    label: 'Organization',
    description: 'Organization name and billing',
    icon: Building2,
    iconColor: 'text-purple-400 bg-purple-500/20',
    adminOnly: true,
  },
  {
    href: '/settings/sport',
    label: 'Sport Config',
    description: 'Positions, categories, and age groups',
    icon: Dumbbell,
    iconColor: 'text-orange-400 bg-orange-500/20',
  },
  {
    href: '/settings/upgrade',
    label: 'Plans & Pricing',
    description: 'View tier features and upgrade your plan',
    icon: Rocket,
    iconColor: 'text-emerald-400 bg-emerald-500/20',
  },
  {
    href: '/settings/leaderboard',
    label: 'Coach Leaderboard',
    description: 'Opt-in rankings: observations, plans, and shares',
    icon: Trophy,
    iconColor: 'text-amber-400 bg-amber-500/20',
  },
  {
    href: '/settings/referrals',
    label: 'Refer a Coach',
    description: 'Invite a colleague — get 1 month free per referral',
    icon: Gift,
    iconColor: 'text-rose-400 bg-rose-500/20',
  },
  {
    href: '/settings/certification',
    label: 'Certified Coach Badge',
    description: 'Earn your badge by hitting key coaching milestones',
    icon: Award,
    iconColor: 'text-amber-400 bg-amber-500/20',
  },
  {
    href: '/settings/webhooks',
    label: 'Webhooks',
    description: 'Push events to Slack, Zapier, or your own systems',
    icon: Webhook,
    iconColor: 'text-sky-400 bg-sky-500/20',
    adminOnly: true,
  },
  {
    href: '/settings/seasons',
    label: 'Season History',
    description: 'Archive seasons and compare player progress over time',
    icon: History,
    iconColor: 'text-indigo-400 bg-indigo-500/20',
  },
];

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { highContrast, toggleHighContrast } = useHighContrast();

  const { data: coach } = useQuery({
    queryKey: queryKeys.coach.current(),
    queryFn: async () => {
      const res = await fetch('/api/me');
      if (!res.ok) return null;
      const data = await res.json();
      return data.coach;
    },
  });

  const isAdmin = coach?.role === 'admin' || coach?.role === 'head_coach';

  const visibleCards = SETTING_CARDS.filter(
    (card) => !card.adminOnly || isAdmin
  );

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-zinc-400 text-sm">Manage your account and preferences</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {visibleCards.map((card, index) => {
          const Icon = card.icon;
          const isFirst = index === 0;
          return (
            <Link key={card.href} href={card.href} className={isFirst ? 'sm:col-span-2 lg:col-span-1' : ''}>
              <Card className={`h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation ${
                isFirst ? 'border-orange-500/30 bg-orange-500/5' : ''
              }`}>
                <CardContent className="flex items-center gap-4 p-5 sm:p-4">
                  <div
                    className={`flex h-12 w-12 sm:h-10 sm:w-10 items-center justify-center rounded-lg shrink-0 ${card.iconColor}`}
                  >
                    <Icon className="h-6 w-6 sm:h-5 sm:w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-base sm:text-sm">{card.label}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{card.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 sm:h-4 sm:w-4 text-zinc-600 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {/* Theme toggle card */}
        <Card
          className="h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation"
          onClick={toggleTheme}
        >
          <CardContent className="flex items-center gap-4 p-5 sm:p-4">
            <div className="flex h-12 w-12 sm:h-10 sm:w-10 items-center justify-center rounded-lg shrink-0 text-amber-400 bg-amber-500/20">
              {theme === 'dark' ? <Sun className="h-6 w-6 sm:h-5 sm:w-5" /> : <Moon className="h-6 w-6 sm:h-5 sm:w-5" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-base sm:text-sm">Appearance</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              </p>
            </div>
            <div className="flex h-8 items-center rounded-full bg-zinc-800 px-3 text-xs font-medium text-zinc-400">
              {theme === 'dark' ? 'Dark' : 'Light'}
            </div>
          </CardContent>
        </Card>

        {/* High contrast toggle card */}
        <Card
          className="h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation"
          onClick={toggleHighContrast}
          role="switch"
          aria-checked={highContrast}
          aria-label="High contrast mode"
        >
          <CardContent className="flex items-center gap-4 p-5 sm:p-4">
            <div className={`flex h-12 w-12 sm:h-10 sm:w-10 items-center justify-center rounded-lg shrink-0 ${
              highContrast ? 'text-white bg-zinc-700' : 'text-zinc-400 bg-zinc-800/50'
            }`}>
              <Contrast className="h-6 w-6 sm:h-5 sm:w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-base sm:text-sm">High Contrast</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {highContrast ? 'High contrast is on — pure black/white' : 'Increase contrast for better readability'}
              </p>
            </div>
            <div className={`flex h-8 items-center rounded-full px-3 text-xs font-medium transition-colors ${
              highContrast
                ? 'bg-orange-500 text-white'
                : 'bg-zinc-800 text-zinc-400'
            }`}>
              {highContrast ? 'On' : 'Off'}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
