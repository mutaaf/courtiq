'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Home, Mic, Users, ClipboardList, Settings, Calendar, CalendarDays, Sparkles, Sun, Moon, LineChart, LogOut, Search, X, Square, ChevronLeft, CheckCircle2, AlertCircle, MoreHorizontal, Dumbbell, BookOpen, ShieldCheck, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotificationBell } from '@/components/layout/notification-bell';
import { TeamSwitcher } from '@/components/layout/team-switcher';
import { PageTransition } from '@/components/layout/page-transition';
import { useTheme } from '@/hooks/use-theme';

import { useSyncEngine } from '@/hooks/use-sync-engine';
import { usePrefetchAdjacentPages, usePrefetchOnIntent } from '@/hooks/use-prefetch-navigation';
import { useArrowKeyNav } from '@/hooks/use-arrow-key-nav';
import { PwaInstallPrompt } from '@/components/ui/pwa-install-prompt';
import { useAppStore } from '@/lib/store';
import { useActiveTeam } from '@/hooks/use-active-team';
import { useTier } from '@/hooks/use-tier';
import { useQueryClient } from '@tanstack/react-query';
import { query, mutate } from '@/lib/api';
import { getTemplatesBySentiment } from '@/lib/observation-templates';
import type { ObservationTemplate } from '@/lib/observation-templates';
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

// Bottom nav: Home | Sessions | CAPTURE (center FAB) | Plans | More
const navItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/sessions', label: 'Sessions', icon: Calendar },
  { href: '/capture', label: 'Capture', icon: Mic, primary: true },
  { href: '/plans', label: 'Plans', icon: ClipboardList },
];

const dockItems = [
  { href: '/home', label: 'Home', icon: Home },
  { href: '/assistant', label: 'AI Assistant', icon: Sparkles },
  { href: '/capture', label: 'Capture', icon: Mic },
  { href: '/plans', label: 'Plans', icon: ClipboardList },
  { href: '/roster', label: 'Roster', icon: Users },
  { href: '/sessions', label: 'Sessions', icon: Calendar },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/observations', label: 'Observations', icon: Eye },
  { href: '/analytics', label: 'Analytics', icon: LineChart },
  { href: '/settings', label: 'Settings', icon: Settings },
];

interface Props {
  coach: Coach & { organizations: any };
  children: React.ReactNode;
}

// Pages that manage their own bottom spacing (chat-style input pinned to viewport bottom).
// Skipping the shell's bottom padding lets the input bar sit directly above the mobile nav,
// while the page itself adds enough internal padding to clear the FAB.
const FULL_BLEED_PATHS = ['/assistant'];

export function DashboardShell({ coach, children }: Props) {
  const pathname = usePathname();
  const isFullBleed = FULL_BLEED_PATHS.some((p) => pathname.startsWith(p));
  const { theme, toggleTheme } = useTheme();
  const prefetchOnIntent = usePrefetchOnIntent();
  const { navRef: mobileNavRef, onKeyDown: mobileNavKeyDown } = useArrowKeyNav();

  const { activeTeam } = useActiveTeam();
  const { subscriptionStatus, cancelAtPeriodEnd, currentPeriodEnd } = useTier();
  const queryClient = useQueryClient();

  const isRecording = useAppStore((s) => s.isRecording);
  const practiceActive = useAppStore((s) => s.practiceActive);
  const practiceStartedAt = useAppStore((s) => s.practiceStartedAt);
  const practiceSessionId = useAppStore((s) => s.practiceSessionId);
  const [practiceElapsed, setPracticeElapsed] = useState('');
  const [showPracticeMini, setShowPracticeMini] = useState(false);
  const [showNudge, setShowNudge] = useState(false);

  // Quick-save flow inside the practice mini-dropdown
  type MiniStep = 'template' | 'player' | 'saved';
  const [miniStep, setMiniStep] = useState<MiniStep>('template');
  const [miniSentiment, setMiniSentiment] = useState<'positive' | 'needs-work'>('positive');
  const [selectedTemplate, setSelectedTemplate] = useState<ObservationTemplate | null>(null);
  const [practiceRoster, setPracticeRoster] = useState<{ id: string; name: string }[]>([]);
  const [savingQuick, setSavingQuick] = useState(false);

  // Identify the signed-in coach to PostHog so events tie to a person
  useEffect(() => {
    if (!coach?.id) return;
    let cancelled = false;
    import('@/lib/analytics').then(({ identifyUser }) => {
      if (!cancelled) {
        identifyUser(coach.id, {
          org_id: (coach.organizations as any)?.id ?? null,
          tier: (coach.organizations as any)?.tier ?? null,
        });
      }
    });
    return () => { cancelled = true; };
  }, [coach?.id, coach?.organizations]);

  // Practice timer
  useEffect(() => {
    if (!practiceActive || !practiceStartedAt) return;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - new Date(practiceStartedAt).getTime()) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      setPracticeElapsed(`${m}:${s.toString().padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [practiceActive, practiceStartedAt]);

  // Periodic nudge every 15 minutes during practice
  useEffect(() => {
    if (!practiceActive) {
      setShowNudge(false);
      return;
    }
    const nudgeInterval = setInterval(() => {
      setShowNudge(true);
      setTimeout(() => setShowNudge(false), 10_000);
    }, 900_000);
    return () => clearInterval(nudgeInterval);
  }, [practiceActive]);

  // Load roster when mini-dropdown opens so the player picker is ready
  useEffect(() => {
    if (!showPracticeMini || !activeTeam?.id) return;
    query<{ id: string; name: string }[]>({
      table: 'players',
      select: 'id, name',
      filters: { team_id: activeTeam.id, is_active: true },
    }).then((data) => setPracticeRoster(data || []));
  }, [showPracticeMini, activeTeam?.id]);

  // Reset mini-dropdown state when it closes
  useEffect(() => {
    if (!showPracticeMini) {
      setMiniStep('template');
      setSelectedTemplate(null);
    }
  }, [showPracticeMini]);

  async function saveQuickObservation(playerId: string) {
    if (!selectedTemplate || !activeTeam || !practiceSessionId) return;
    setSavingQuick(true);
    try {
      await mutate({
        table: 'observations',
        operation: 'insert',
        data: {
          team_id: activeTeam.id,
          coach_id: coach.id,
          session_id: practiceSessionId,
          player_id: playerId,
          text: selectedTemplate.text,
          sentiment: selectedTemplate.sentiment,
          category: selectedTemplate.category,
          source: 'template',
        },
      });
      setMiniStep('saved');
      // Auto-reset so coach can log another observation immediately
      setTimeout(() => {
        setMiniStep('template');
        setSelectedTemplate(null);
      }, 1400);
      queryClient.invalidateQueries({ queryKey: ['home-stats', activeTeam.id] });
      queryClient.invalidateQueries({ queryKey: ['home-pulse', activeTeam.id] });
    } catch (err) {
      console.warn('Failed to save quick observation:', err);
    } finally {
      setSavingQuick(false);
    }
  }

  const [moreOpen, setMoreOpen] = useState(false);
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
      {/* Desktop top header */}
      <header className="hidden lg:flex fixed top-0 left-0 right-0 z-50 h-12 items-center justify-between border-b border-zinc-800 bg-zinc-900/90 backdrop-blur-xl px-4">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 p-0.5">
            <Image src="/logo.svg" alt="SportsIQ" width={20} height={20} className="invert" />
          </div>
          <span className="font-bold">SportsIQ</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCommandPalette}
            aria-label="Open command palette (⌘K)"
            aria-keyshortcuts="Meta+K Control+K"
            className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-sm text-zinc-500 hover:border-zinc-600 hover:text-zinc-300 transition-colors"
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="text-xs">Search…</span>
            <kbd className="text-[10px] text-zinc-600">⌘K</kbd>
          </button>
          <NotificationBell />
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <TeamSwitcher compact />
        </div>
      </header>

      {/* Desktop Dock */}
      <div className="hidden lg:flex fixed bottom-4 left-1/2 -translate-x-1/2 z-50 items-center gap-1 rounded-2xl border border-zinc-700/50 bg-zinc-900/90 backdrop-blur-xl px-3 py-2 shadow-2xl">
        {dockItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <div key={item.href} className="group relative">
              <Link
                href={item.href}
                className={cn(
                  'flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-200 hover:scale-110 hover:bg-zinc-800',
                  isActive && 'bg-orange-500/15'
                )}
              >
                <item.icon className={cn('h-5 w-5', isActive ? 'text-orange-500' : 'text-zinc-400 group-hover:text-zinc-100')} />
              </Link>
              {isActive && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-orange-500" />
              )}
              {/* Tooltip */}
              <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-zinc-800 text-zinc-200 text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap shadow-xl border border-zinc-700/50">
                  {item.label}
                </div>
              </div>
            </div>
          );
        })}

        {/* Divider */}
        <div className="h-8 w-px bg-zinc-700/50 mx-1" />

        {/* Profile */}
        <div className="group relative">
          <button className="flex h-12 w-12 items-center justify-center rounded-xl hover:bg-zinc-800 transition-all hover:scale-110">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-700 text-xs font-medium text-zinc-200">
              {coach.full_name.split(' ').map(n => n[0]).join('').slice(0,2)}
            </div>
          </button>
          <div className="absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="bg-zinc-800 text-zinc-200 text-[11px] font-medium px-2.5 py-1 rounded-lg whitespace-nowrap shadow-xl border border-zinc-700/50">
              {coach.full_name}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col min-h-0 min-w-0 lg:pt-12">
        {/* Subscription ended — downgrade notice */}
        {subscriptionStatus === 'canceled' && !cancelAtPeriodEnd && (
          <div className="bg-zinc-800/80 border-b border-zinc-700 px-4 py-2 flex items-center gap-2 text-sm text-zinc-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-zinc-400" />
            <span>
              Your subscription has ended — your data is safe.{' '}
              <Link href="/settings/upgrade" className="underline font-medium text-orange-400">Resubscribe to re-enable features</Link>
            </span>
          </div>
        )}
        {/* Past-due subscription warning */}
        {subscriptionStatus === 'past_due' && (
          <div className="bg-red-500/10 border-b border-red-500/30 px-4 py-2 flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="h-4 w-4" />
            <span>Payment failed — <Link href="/settings/upgrade" className="underline font-medium">update your payment method</Link></span>
          </div>
        )}
        {/* Cancel-at-period-end warning */}
        {cancelAtPeriodEnd && currentPeriodEnd && subscriptionStatus !== 'past_due' && (
          <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 flex items-center gap-2 text-sm text-amber-400">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Your plan expires on {new Date(currentPeriodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} —{' '}
              <Link href="/settings/upgrade" className="underline font-medium">resubscribe to keep access</Link>
            </span>
          </div>
        )}

        {/* Mobile header */}
        <header className="flex items-center justify-between border-b border-zinc-800 px-4 pt-12 min-h-[5rem] lg:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 p-0.5">
              <Image src="/logo.svg" alt="SportsIQ" width={20} height={20} className="invert" />
            </div>
            <span className="font-bold">SportsIQ</span>
          </div>
          <div className="flex items-center gap-2">
            {isRecording && (
              <Link href="/capture" className="flex items-center gap-1.5 rounded-full bg-red-500/20 px-2.5 py-1 text-xs text-red-400 animate-pulse">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                REC
              </Link>
            )}
            {practiceActive && (
              <button
                onClick={() => setShowPracticeMini(!showPracticeMini)}
                className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400"
              >
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                LIVE · {practiceElapsed}
              </button>
            )}
            <button
              onClick={openCommandPalette}
              aria-label="Search (⌘K)"
              aria-keyshortcuts="Meta+K Control+K"
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <Search className="h-4 w-4" />
            </button>
            <NotificationBell />
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={async () => {
                const { createClient } = await import('@/lib/supabase/client');
                const supabase = createClient();
                await supabase.auth.signOut();
                const { resetAnalytics } = await import('@/lib/analytics');
                resetAnalytics();
                window.location.href = '/login';
              }}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:text-red-400 transition-colors"
              aria-label="Sign out"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </button>
            <TeamSwitcher compact />
          </div>
        </header>

        {/* Practice mini dropdown — 3-step quick-save: template → player → saved */}
        {showPracticeMini && practiceActive && (
          <div className="absolute right-4 top-24 z-50 w-72 rounded-xl border border-emerald-500/20 bg-zinc-900 p-3 shadow-xl lg:hidden">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-emerald-400">
                {miniStep === 'player' && selectedTemplate
                  ? `${selectedTemplate.emoji} ${selectedTemplate.text}`
                  : miniStep === 'saved'
                  ? 'Saved!'
                  : 'Quick observation'}
              </span>
              <button
                onClick={() => {
                  if (miniStep === 'player') {
                    setMiniStep('template');
                    setSelectedTemplate(null);
                  } else {
                    setShowPracticeMini(false);
                  }
                }}
                className="text-zinc-500 hover:text-zinc-300"
                aria-label={miniStep === 'player' ? 'Back to templates' : 'Close'}
              >
                {miniStep === 'player' ? <ChevronLeft className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </button>
            </div>

            {/* Step 1: Template picker */}
            {miniStep === 'template' && (
              <>
                <div className="flex rounded-lg bg-zinc-800 p-0.5 mb-3 text-xs">
                  <button
                    onClick={() => setMiniSentiment('positive')}
                    className={cn(
                      'flex-1 rounded-md py-1.5 font-medium transition-colors',
                      miniSentiment === 'positive'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'text-zinc-400 hover:text-zinc-300'
                    )}
                  >
                    ✓ Positive
                  </button>
                  <button
                    onClick={() => setMiniSentiment('needs-work')}
                    className={cn(
                      'flex-1 rounded-md py-1.5 font-medium transition-colors',
                      miniSentiment === 'needs-work'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'text-zinc-400 hover:text-zinc-300'
                    )}
                  >
                    ⚠ Needs Work
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {getTemplatesBySentiment(miniSentiment, activeTeam?.sport_id)
                    .slice(0, 6)
                    .map((template) => (
                      <button
                        key={template.id}
                        onClick={() => {
                          setSelectedTemplate(template);
                          setMiniStep('player');
                        }}
                        className="rounded-full bg-zinc-800 border border-zinc-700 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 active:scale-95 touch-manipulation text-left"
                      >
                        {template.emoji}{' '}
                        {template.text.length > 18 ? template.text.slice(0, 17) + '…' : template.text}
                      </button>
                    ))}
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/capture"
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-orange-500/20 px-3 py-2 text-xs font-medium text-orange-400 hover:bg-orange-500/30 active:scale-95 touch-manipulation"
                  >
                    <Mic className="h-3.5 w-3.5" />
                    Voice
                  </Link>
                  <Link
                    href="/home"
                    onClick={() => setShowPracticeMini(false)}
                    className="flex items-center justify-center gap-1.5 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/30 active:scale-95 touch-manipulation"
                  >
                    <Square className="h-3.5 w-3.5" />
                    End
                  </Link>
                </div>
              </>
            )}

            {/* Step 2: Player picker */}
            {miniStep === 'player' && (
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {practiceRoster.length === 0 ? (
                  <p className="w-full py-3 text-center text-xs text-zinc-500">Loading players…</p>
                ) : (
                  practiceRoster.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => saveQuickObservation(p.id)}
                      disabled={savingQuick}
                      className="rounded-full bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-orange-500/50 hover:text-orange-300 active:scale-95 touch-manipulation disabled:opacity-50"
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  ))
                )}
              </div>
            )}

            {/* Step 3: Saved confirmation */}
            {miniStep === 'saved' && (
              <div className="flex items-center justify-center gap-2 py-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-400">Observation saved!</span>
              </div>
            )}
          </div>
        )}

        <div
          className={cn(
            'flex-1 overflow-y-auto overflow-x-hidden lg:pb-24 lg:scroll-pb-0',
            isFullBleed && 'lg:pb-24'
          )}
        >
          {/* Periodic nudge during practice */}
          {showNudge && practiceActive && (
            <div className="mx-4 mt-2 flex items-center gap-3 rounded-xl bg-orange-500/10 border border-orange-500/20 p-3">
              <Mic className="h-5 w-5 text-orange-400 shrink-0" />
              <p className="text-sm text-orange-300 flex-1">Quick observation? Tap to capture</p>
              <button onClick={() => setShowNudge(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
          <PageTransition>
            {children}
          </PageTransition>
          {/*
            Bottom spacer — using padding-bottom on the scroll container is buggy in
            Chromium/WebKit (padding is not counted in scrollHeight for overflow:auto
            flex items), so a real DOM element guarantees scroll room above the
            mobile tab bar + FAB. Hidden on desktop and on full-bleed routes.
          */}
          {!isFullBleed && (
            <div
              aria-hidden="true"
              className="lg:hidden"
              style={{ height: 'calc(10rem + env(safe-area-inset-bottom))' }}
            />
          )}
        </div>

        {/* Quick Capture floating widget — accessible from any page */}
        <QuickCaptureWidget />

        {/* PWA install prompt — shows on mobile after 2 visits when installable */}
        <PwaInstallPrompt />

        {/* Command Palette — Cmd/Ctrl+K or search button */}
        {commandPaletteOpen && <CommandPalette onClose={closeCommandPalette} />}

        {/* "More" slide-up sheet */}
        {moreOpen && (
          <>
            {/* Backdrop */}
            <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setMoreOpen(false)} />
            {/* Sheet */}
            <div className="fixed bottom-16 left-0 right-0 z-50 rounded-t-2xl border-t border-zinc-800 bg-zinc-900 px-4 pb-4 pt-3 lg:hidden">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-700" />
              <div className="grid grid-cols-4 gap-4">
                {[
                  { href: '/roster', label: 'Roster', icon: Users },
                  { href: '/assistant', label: 'Assistant', icon: Sparkles },
                  { href: '/observations', label: 'Observations', icon: Eye },
                  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
                  { href: '/analytics', label: 'Analytics', icon: LineChart },
                  { href: '/drills', label: 'Drills', icon: Dumbbell },
                  { href: '/curriculum', label: 'Curriculum', icon: BookOpen },
                  { href: '/settings', label: 'Settings', icon: Settings },
                  { href: '/admin', label: 'Admin', icon: ShieldCheck },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 active:scale-95 transition-all"
                  >
                    <item.icon className="h-6 w-6" />
                    <span className="text-[10px]">{item.label}</span>
                  </Link>
                ))}
                {/* Sign Out */}
                <button
                  onClick={async () => {
                    const { createClient } = await import('@/lib/supabase/client');
                    const supabase = createClient();
                    await supabase.auth.signOut();
                const { resetAnalytics } = await import('@/lib/analytics');
                resetAnalytics();
                    window.location.href = '/login';
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-3 text-red-400 hover:bg-zinc-800 active:scale-95 transition-all"
                >
                  <LogOut className="h-6 w-6" />
                  <span className="text-[10px]">Sign Out</span>
                </button>
              </div>
            </div>
          </>
        )}

        {/* Mobile bottom nav — 5 items, Capture centered as FAB */}
        <nav
          ref={(el) => { mobileNavRef.current = el; }}
          aria-label="Mobile navigation"
          className="fixed bottom-0 left-0 right-0 z-50 flex h-16 border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)] lg:hidden"
          onKeyDown={mobileNavKeyDown}
        >
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            // During an active practice, link the Capture FAB to the session so observations are automatically linked
            const itemHref = item.primary && practiceSessionId
              ? `/capture?sessionId=${practiceSessionId}`
              : item.href;
            const tourTag = item.label.toLowerCase();  // 'home' | 'sessions' | 'capture' | 'plans'
            return (
              <Link
                key={item.href}
                href={itemHref}
                onMouseEnter={prefetchOnIntent(item.href)}
                onFocus={prefetchOnIntent(item.href)}
                onTouchStart={prefetchOnIntent(item.href)}
                data-tour={tourTag}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-[11px] font-medium touch-manipulation',
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
          {/* More button */}
          <button
            onClick={() => setMoreOpen(!moreOpen)}
            className="flex flex-1 flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] py-3 text-[11px] font-medium touch-manipulation text-zinc-500"
          >
            <MoreHorizontal className="h-6 w-6" />
            <span>More</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
