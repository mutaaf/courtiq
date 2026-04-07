'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent } from '@/components/ui/card';
import {
  User,
  Building2,
  Palette,
  Shield,
  ChevronRight,
  Dumbbell,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';

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
];

export default function SettingsPage() {
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
        {visibleCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.href} href={card.href}>
              <Card className="h-full cursor-pointer transition-colors hover:border-zinc-700">
                <CardContent className="flex items-center gap-4 p-4">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${card.iconColor}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{card.label}</p>
                    <p className="text-xs text-zinc-500">{card.description}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-zinc-600 shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
