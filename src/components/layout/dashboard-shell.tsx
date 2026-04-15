'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Home, Mic, Users, ClipboardList, Settings, Calendar, CalendarDays, BookOpen, BarChart3, Sparkles, Sun, Moon, LineChart, LogOut, Lock, ShieldCheck, Store, Search, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/layout/notification-bell';
import { TeamSwitcher } from '@/components/layout/team-switcher';
import { SyncIndicator } from '@/components/layout/sync-indicator';
import { PageTransition } from '@/components/layout/page-transition';
import { useTheme } from '@/hooks/use-theme';
import { useTier } from '@/hooks/use-tier';
import { useSwipeNavigation } from '@/hooks/use-swipe-navigation';
import { useSyncEngine } from '@/hooks/use-sync-engine';
import { usePrefetchAdjacentPages, usePrefetchOnIntent } from '@/hooks/use-prefetch-navigation';
import { useArrowKeyNav } from '@/hooks/use-arrow-key-nav';
import { PwaInstallPrompt } from '@/components/ui/pwa-install-prompt';
import type { Coach } from '@/types/database';

// Lazy-loaded — uses Web Speech API + IndexedDB (browser-only) and is only
// needed when the user taps the Zap FAB, so defer it to a separate chunk.
const QuickCaptureWidget = dynamic(
  () => import('@/components/capture/quick-capture-widget').then((m) => ({ default: m.QuickCaptureWidget })),
  { ssr: false }
);

// Lazy-loaded — command palette is only mounted when open (Cmd/Ctrl+K).
const CommandPalette = dynamic(
  () => import('@/components/command-palette').then((m) => ({ default: m.CommandPalette })),
  { ssr: false }
);

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
  { href: '/observations', label: 'Observations', icon: Eye, tourId: undefined, feature: undefined },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays, tourId: undefined, feature: undefined },
  { href: '/curriculum', label: 'Curriculum', icon: BookOpen, tourId: undefined, feature: undefined },
  { href: '/marketplace', label: 'Marketplace', icon: Store, tourId: undefined, feature: undefined },
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
  const { onTouchStart, onTouchEnd } = useSwipeNavigation();
  const isAdmin = coach.role === 'admin' && ((coach as any).organizations?.tier === 'organization');
  const prefetchOnIntent = usePrefetchOnIntent();
  const { navRef: sidebarNavRef, onKeyDown: sidebarKeyDown } = useArrowKeyNav();
  const { navRef: mobileNavRef, onKeyDown: mobileNavKeyDown } = useArrowKeyNav();

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const openCommandPalette = useCallback(() => setCommandPaletteOpen(true), []);
  const closeCommandPalette = useCallback(() => setCommandPaletteOpen(false), []);

  // Global Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Start background sync engine and wire up online/offline monitoring
  useSyncEngine();

  // Proactively prefetch the pages adjacent to the current one so that the
  // most common "next tap" destinations are already in the router cache.
  usePrefetchAdjacentPages();

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Desktop Sidebar */}
      <aside aria-label="Sidebar" className="hidden w-64 flex-col border-r border-zinc-800 bg-zinc-900/50 lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-zinc-800 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 p-1">
            <Image src="/logo.svg" alt="SportsIQ" width={24} height={24} className="invert" />
          </div>
          <span className="font-bold text-lg">SportsIQ</span>
        </div>

        <div className="border-b border-zinc-800 p-4">
          <TeamSwitcher />
        </div>

        {/* Search / Command Palette trigger + notification bell */}
        <div className="border-b border-zinc-800 px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              onClick={openCommandPalette}
              aria-label="Open command palette (⌘K)"
              aria-keyshortcuts="Meta+K Control+K"
              className="flex flex-1 items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-2 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
            >
              <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="flex-1 text-left text-xs">Search…</span>
              <kbd className="hidden text-[10px] text-zinc-600 sm:inline">⌘K</kbd>
            </button>
            <NotificationBell />
          </div>
        </div>

        <nav
          ref={(el) => { sidebarNavRef.current = el; }}
          aria-label="Main"
          className="flex-1 space-y-1 p-4"
          onKeyDown={sidebarKeyDown}
        >
          {sidebarItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const isLocked = item.feature ? !canAccessFeature(item.feature) : false;
            const prefetch = prefetchOnIntent(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                data-tour={item.tourId}
                onMouseEnter={prefetch}
                onFocus={prefetch}
                aria-current={isActive ? 'page' : undefined}
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
              onMouseEnter={prefetchOnIntent('/admin')}
              onFocus={prefetchOnIntent('/admin')}
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
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col overflow-hidden">
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
              onClick={openCommandPalette}
              aria-label="Search (⌘K)"
              aria-keyshortcuts="Meta+K Control+K"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <Search className="h-4 w-4" />
            </button>
            <NotificationBell />
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
              aria-label="Sign out"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <TeamSwitcher compact />
          </div>
        </header>

        {/* Swipe handlers on mobile content area — lg:pb-0 is desktop, touch won't fire there */}
        <div
          className="flex-1 overflow-y-auto pb-24 lg:pb-0"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <PageTransition>
            {children}
          </PageTransition>
        </div>

        {/* Quick Capture floating widget — accessible from any page */}
        <QuickCaptureWidget />

        {/* PWA install prompt — shows on mobile after 2 visits when installable */}
        <PwaInstallPrompt />

        {/* Command Palette — Cmd/Ctrl+K or search button */}
        {commandPaletteOpen && <CommandPalette onClose={closeCommandPalette} />}

        {/* Mobile bottom nav — 5 items, Capture centered as FAB */}
        <nav
          ref={(el) => { mobileNavRef.current = el; }}
          aria-label="Mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] lg:hidden"
          onKeyDown={mobileNavKeyDown}
        >
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onMouseEnter={prefetchOnIntent(item.href)}
                onFocus={prefetchOnIntent(item.href)}
                onTouchStart={prefetchOnIntent(item.href)}
                aria-current={isActive ? 'page' : undefined}
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
