'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent } from '@/components/ui/card';
import {
  User,
  Building2,
  ChevronRight,
  ChevronDown,
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
  ShieldAlert,
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
  highlight?: boolean;
}

interface SettingCategory {
  name: string;
  items: SettingCard[];
}

const CATEGORIES: SettingCategory[] = [
  {
    name: 'Account',
    items: [
      {
        href: '/settings/profile',
        label: 'Profile',
        description: 'Your name, email, and avatar',
        icon: User,
        iconColor: 'text-blue-400 bg-blue-500/20',
      },
      {
        href: '/settings/upgrade',
        label: 'Plans & Pricing',
        description: 'View tier features and upgrade your plan',
        icon: Rocket,
        iconColor: 'text-emerald-400 bg-emerald-500/20',
      },
      {
        href: '/settings/data',
        label: 'Data & Privacy',
        description: 'Export your data or delete your account',
        icon: ShieldAlert,
        iconColor: 'text-rose-400 bg-rose-500/20',
      },
    ],
  },
  {
    name: 'Team',
    items: [
      {
        href: '/settings/sport',
        label: 'Sport Config',
        description: 'Positions, categories, and age groups',
        icon: Dumbbell,
        iconColor: 'text-orange-400 bg-orange-500/20',
      },
      {
        href: '/settings/seasons',
        label: 'Season History',
        description: 'Archive seasons and compare player progress over time',
        icon: History,
        iconColor: 'text-indigo-400 bg-indigo-500/20',
      },
    ],
  },
  {
    name: 'AI & Integrations',
    items: [
      {
        href: '/settings/ai',
        label: 'AI & API Keys',
        description: 'Configure your AI provider and API keys',
        icon: Sparkles,
        iconColor: 'text-orange-400 bg-orange-500/20',
        highlight: true,
      },
      {
        href: '/settings/webhooks',
        label: 'Webhooks',
        description: 'Push events to Slack, Zapier, or your own systems',
        icon: Webhook,
        iconColor: 'text-sky-400 bg-sky-500/20',
        adminOnly: true,
      },
    ],
  },
  {
    name: 'Program',
    items: [
      {
        href: '/settings/organization',
        label: 'Organization',
        description: 'Organization name and billing',
        icon: Building2,
        iconColor: 'text-purple-400 bg-purple-500/20',
        adminOnly: true,
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
    ],
  },
];

function SettingCardItem({ card }: { card: SettingCard }) {
  const Icon = card.icon;
  return (
    <Link href={card.href}>
      <Card className={`h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation ${
        card.highlight ? 'border-orange-500/30 bg-orange-500/5' : ''
      }`}>
        <CardContent className="flex items-center gap-4 p-4">
          <div
            className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${card.iconColor}`}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{card.label}</p>
            <p className="text-xs text-zinc-500 mt-0.5">{card.description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
        </CardContent>
      </Card>
    </Link>
  );
}

export default function SettingsPage() {
  const { theme, toggleTheme } = useTheme();
  const { highContrast, toggleHighContrast } = useHighContrast();
  // On mobile, first category expanded by default
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Account']));

  const toggleCategory = useCallback((name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

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

  return (
    <div className="p-4 lg:p-8 space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-zinc-400 text-sm">Manage your account and preferences</p>
      </div>

      {/* Mobile: collapsible categories */}
      <div className="sm:hidden space-y-3">
        {CATEGORIES.map((category) => {
          const visibleItems = category.items.filter((c) => !c.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          const isExpanded = expandedCategories.has(category.name);
          return (
            <div key={category.name}>
              <button
                onClick={() => toggleCategory(category.name)}
                className="flex items-center gap-2 w-full py-2 text-sm font-semibold text-zinc-300 hover:text-zinc-100"
              >
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                {category.name}
                <span className="text-xs font-normal text-zinc-600 ml-auto">{visibleItems.length}</span>
              </button>
              {isExpanded && (
                <div className="space-y-2 mt-1">
                  {visibleItems.map((card) => (
                    <SettingCardItem key={card.href} card={card} />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Appearance toggles always visible */}
        <div>
          <p className="py-2 text-sm font-semibold text-zinc-300">Appearance</p>
          <div className="space-y-2">
            <Card
              className="h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation"
              onClick={toggleTheme}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0 text-amber-400 bg-amber-500/20">
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Appearance</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  </p>
                </div>
                <div className="flex h-8 items-center rounded-full bg-zinc-800 px-3 text-xs font-medium text-zinc-400">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </div>
              </CardContent>
            </Card>

            <Card
              className="h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation"
              onClick={toggleHighContrast}
              role="switch"
              aria-checked={highContrast}
              aria-label="High contrast mode"
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                  highContrast ? 'text-white bg-zinc-700' : 'text-zinc-400 bg-zinc-800/50'
                }`}>
                  <Contrast className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">High Contrast</p>
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
      </div>

      {/* Desktop: flat grid, all visible */}
      <div className="hidden sm:block space-y-6">
        {CATEGORIES.map((category) => {
          const visibleItems = category.items.filter((c) => !c.adminOnly || isAdmin);
          if (visibleItems.length === 0) return null;
          return (
            <div key={category.name}>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">{category.name}</p>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {visibleItems.map((card) => (
                  <SettingCardItem key={card.href} card={card} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Appearance section */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-2">Appearance</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Card
              className="h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation"
              onClick={toggleTheme}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0 text-amber-400 bg-amber-500/20">
                  {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">Appearance</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                  </p>
                </div>
                <div className="flex h-8 items-center rounded-full bg-zinc-800 px-3 text-xs font-medium text-zinc-400">
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </div>
              </CardContent>
            </Card>

            <Card
              className="h-full cursor-pointer transition-colors hover:border-zinc-700 active:scale-[0.98] touch-manipulation"
              onClick={toggleHighContrast}
              role="switch"
              aria-checked={highContrast}
              aria-label="High contrast mode"
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${
                  highContrast ? 'text-white bg-zinc-700' : 'text-zinc-400 bg-zinc-800/50'
                }`}>
                  <Contrast className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">High Contrast</p>
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
      </div>
    </div>
  );
}
