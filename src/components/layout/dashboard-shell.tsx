'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Home, Mic, Users, ClipboardList, Settings, Calendar, BookOpen, BarChart3, Sparkles, Sun, Moon, LineChart, LogOut, Lock, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamSwitcher } from '@/components/layout/team-switcher';
import { SyncIndicator } from '@/components/layout/sync-indicator';
import { PageTransition } from '@/components/layout/page-transition';
import { useTheme } from '@/hooks/use-theme';
import { useTier } from '@/hooks/use-tier';
import type { Coach } from '@/types/database';

// Bottom nav: Home | Roster | CAPTURE (center FAB) | Plans | Settings
const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/assistant', label: 'Assistant', icon: Sparkles },
  { href: '/capture', label: 'Capture', icon: Mic, primary: true },
  { href: '/plans', label: 'Plans', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const sidebarItems = [
  { href: '/home', label: 'Home', icon: Home, tourId: undefined, feature: undefined },
  { href: '/assistant', label: 'Assistant', icon: Sparkles, tourId: 'assistant', feature: 'assistant' },
  { href: '/capture', label: 'Capture', icon: Mic, tourId: 'capture', feature: undefined },
  { href: '/analytics', label: 'Analytics', icon: LineChart, tourId: undefined, feature: 'analytics' },
  { href: '/roster', label: 'Roster', icon: Users, tourId: 'roster', feature: undefined },
  { href: '/sessions', label: 'Sessions', icon: Calendar, tourId: undefined, feature: undefined },
  { href: '/curriculum', label: 'Curriculum', icon: BookOpen, tourId: undefined, feature: undefined },
  { href: '/plans', label: 'Plans', icon: ClipboardList, tourId: undefined, feature: undefined },
  { href: '/drills', label: 'Drills', icon: BarChart3, tourId: undefined, feature: undefined },
  { href: '/settings', label: 'Settings', icon: Settings, tourId: 'settings', feature: undefined },
];

interface Props {
  coach: Coach & { organizations: any };
  children: React.ReactNode;
}

export function DashboardShell({ coach, children }: Props) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { canAccess: canAccessFeature } = useTier();
  const isAdmin = coach.role === 'admin' && ((coach as any).organizations?.tier === 'organization');

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-zinc-800 bg-zinc-900/50 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 p-1">
            <Image src="/logo.svg" alt="SportsIQ" width={24} height={24} className="invert" />
          </div>
          <span className="font-bold text-lg">SportsIQ</span>
        </div>

        <div className="border-b border-zinc-800 p-4">
          <TeamSwitcher />
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {sidebarItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const isLocked = item.feature ? !canAccessFeature(item.feature) : false;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.tourId}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-orange-500/10 text-orange-500'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {isLocked && <Lock className="ml-auto h-3.5 w-3.5 text-zinc-600" />}
              </Link>
            );
          })}
          {isAdmin && (
            <Link
              href="/admin"
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                pathname.startsWith('/admin')
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
              )}
            >
              <ShieldCheck className="h-5 w-5" />
              Admin
            </Link>
          )}
        </nav>

        {/* Theme toggle */}
        <div className="border-t border-zinc-800 px-4 pt-3">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </button>
        </div>

        <div className="border-t border-zinc-800 p-4">
          <SyncIndicator />
          <div className="mt-3 flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium">
              {coach.full_name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="flex-1 truncate">
              <p className="truncate text-sm font-medium">{coach.full_name}</p>
              <p className="truncate text-xs text-zinc-400">{coach.organizations?.name}</p>
            </div>
          </div>
          <button
            onClick={async () => {
              const { createClient } = await import('@/lib/supabase/client');
              const supabase = createClient();
              await supabase.auth.signOut();
              window.location.href = '/login';
            }}
            className="mt-2 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-zinc-500 hover:bg-zinc-800 hover:text-red-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 p-0.5">
              <Image src="/logo.svg" alt="SportsIQ" width={20} height={20} className="invert" />
            </div>
            <span className="font-bold">SportsIQ</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={async () => {
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                await supabase.auth.signOut();
                window.location.href = '/login';
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <TeamSwitcher compact />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          <PageTransition>
            {children}
          </PageTransition>
        </div>

        {/* Mobile bottom nav — 5 items, Capture centered as FAB */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm lg:hidden safe-area-bottom">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] font-medium touch-manipulation',
                  item.primary && !isActive && 'text-orange-500',
                  isActive ? 'text-orange-500' : 'text-zinc-500'
                )}
              >
                {item.primary ? (
                  <div className={cn(
                    'flex h-14 w-14 -mt-8 items-center justify-center rounded-full shadow-lg shadow-orange-500/30 active:scale-95 transition-transform',
                    isActive ? 'bg-orange-500 text-white ring-4 ring-orange-500/20' : 'bg-orange-500 text-white'
                  )}>
                    <item.icon className="h-7 w-7" />
                  </div>
                ) : (
                  <item.icon className="h-6 w-6" />
                )}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
