'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';

const STORAGE_KEY = 'siq_pwa_prompt_dismissed';
const DISMISS_DAYS = 14;
const MIN_VISITS_BEFORE_SHOW = 2;
const VISIT_KEY = 'siq_pwa_visit_count';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    // Don't show if dismissed recently
    const dismissed = localStorage.getItem(STORAGE_KEY);
    if (dismissed && Date.now() < parseInt(dismissed, 10)) return;

    // Track visit count — only show after the user has visited a couple of times
    const visitCount = parseInt(localStorage.getItem(VISIT_KEY) || '0', 10) + 1;
    localStorage.setItem(VISIT_KEY, String(visitCount));
    if (visitCount < MIN_VISITS_BEFORE_SHOW) return;

    function handleBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
      localStorage.removeItem(STORAGE_KEY);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(
      STORAGE_KEY,
      String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000)
    );
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Install SportsIQ app"
      className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 lg:hidden animate-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-center gap-3 rounded-xl border border-orange-500/30 bg-zinc-900/95 px-4 py-3 shadow-xl shadow-black/40 backdrop-blur-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500">
          <Download className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-zinc-100 leading-tight">Add to Home Screen</p>
          <p className="text-xs text-zinc-400 leading-tight mt-0.5">Get the full app experience</p>
        </div>
        <button
          onClick={handleInstall}
          className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white active:scale-95 transition-transform touch-manipulation"
          aria-label="Install app"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 flex h-7 w-7 items-center justify-center rounded-lg text-zinc-500 hover:text-zinc-300 active:scale-95 transition-transform touch-manipulation"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
