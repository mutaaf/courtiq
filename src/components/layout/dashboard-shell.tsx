'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Mic, Users, ClipboardList, Settings, Calendar, BookOpen, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TeamSwitcher } from '@/components/layout/team-switcher';
import { SyncIndicator } from '@/components/layout/sync-indicator';
import type { Coach } from '@/types/database';

const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/capture', label: 'Capture', icon: Mic, primary: true },
  { href: '/roster', label: 'Roster', icon: Users },
  { href: '/plans', label: 'Plans', icon: ClipboardList },
  { href: '/settings', label: 'Settings', icon: Settings },
];

const sidebarItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/roster', label: 'Roster', icon: Users },
  { href: '/sessions', label: 'Sessions', icon: Calendar },
  { href: '/curriculum', label: 'Curriculum', icon: BookOpen },
  { href: '/plans', label: 'Plans', icon: ClipboardList },
  { href: '/drills', label: 'Drills', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface Props {
  coach: Coach & { organizations: any };
  children: React.ReactNode;
}

export function DashboardShell({ coach, children }: Props) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Desktop Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-zinc-800 bg-zinc-900/50 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-lg">
            🏀
          </div>
          <span className="font-bold text-lg">CourtIQ</span>
        </div>

        <div className="border-b border-zinc-800 p-4">
          <TeamSwitcher />
        </div>

        <nav className="flex-1 space-y-1 p-4">
          {sidebarItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-orange-500/10 text-orange-500'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>

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
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="flex h-14 items-center justify-between border-b border-zinc-800 px-4 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 text-sm">
              🏀
            </div>
            <span className="font-bold">CourtIQ</span>
          </div>
          <TeamSwitcher compact />
        </header>

        <div className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm lg:hidden">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-1 flex-col items-center gap-1 py-2 text-[10px]',
                  item.primary && !isActive && 'text-orange-500',
                  isActive ? 'text-orange-500' : 'text-zinc-500'
                )}
              >
                {item.primary ? (
                  <div className={cn(
                    'flex h-12 w-12 -mt-6 items-center justify-center rounded-full shadow-lg',
                    isActive ? 'bg-orange-500 text-white' : 'bg-orange-500 text-white'
                  )}>
                    <item.icon className="h-6 w-6" />
                  </div>
                ) : (
                  <item.icon className="h-5 w-5" />
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
