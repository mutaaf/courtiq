'use client';

import { useState } from 'react';
import { CheckCircle2, Circle, Users, Mic, ClipboardList, X, ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';

interface Step {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  done: boolean;
}

interface GettingStartedCardProps {
  players: number;
  sessions: number;
  observations: number;
  teamId: string;
}

export function GettingStartedCard({ players, sessions, observations, teamId }: GettingStartedCardProps) {
  const dismissKey = `getting-started-dismissed-${teamId}`;

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const val = localStorage.getItem(dismissKey);
    if (!val) return false;
    const ts = parseInt(val, 10);
    return Date.now() - ts < 30 * 24 * 60 * 60 * 1000; // 30 days
  });

  const steps: Step[] = [
    {
      id: 'players',
      label: 'Add your players',
      description: 'Build your roster so AI can track each player',
      href: '/roster/add',
      icon: Users,
      iconBg: 'bg-blue-500/20',
      iconColor: 'text-blue-400',
      done: players > 0,
    },
    {
      id: 'session',
      label: 'Start a practice',
      description: 'Tap "Start Practice" above — it takes 2 seconds',
      href: '/sessions/new',
      icon: ClipboardList,
      iconBg: 'bg-emerald-500/20',
      iconColor: 'text-emerald-400',
      done: sessions > 0,
    },
    {
      id: 'observation',
      label: 'Capture an observation',
      description: 'Voice, type, or one-tap template — under 10 seconds',
      href: '/capture',
      icon: Mic,
      iconBg: 'bg-orange-500/20',
      iconColor: 'text-orange-400',
      done: observations > 0,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;

  if (dismissed || allDone) return null;

  function dismiss() {
    localStorage.setItem(dismissKey, String(Date.now()));
    setDismissed(true);
  }

  const nextStep = steps.find((s) => !s.done);
  const pct = Math.round((doneCount / steps.length) * 100);

  return (
    <Card className="overflow-hidden border-orange-500/20">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-zinc-200">
              Getting Started
            </p>
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-400">
              {doneCount}/{steps.length} done
            </span>
          </div>
          <button
            onClick={dismiss}
            aria-label="Dismiss getting started"
            className="rounded p-1 text-zinc-600 hover:text-zinc-400 transition-colors touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mx-4 mb-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full bg-orange-500 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Steps */}
        <div className="px-3 pb-3 space-y-1">
          {steps.map((step) => {
            const Icon = step.icon;
            const isNext = step === nextStep;
            return (
              <div key={step.id}>
                {step.done ? (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 opacity-50">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                    <span className="text-sm line-through text-zinc-400">{step.label}</span>
                  </div>
                ) : isNext ? (
                  <Link href={step.href}>
                    <div className="group flex items-center gap-3 rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-3 transition-all hover:border-orange-500/40 hover:bg-orange-500/10 active:scale-[0.98] touch-manipulation">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${step.iconBg}`}>
                        <Icon className={`h-5 w-5 ${step.iconColor}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-100">{step.label}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">{step.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-orange-400 transition-transform group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                ) : (
                  <div className="flex items-center gap-3 rounded-xl px-3 py-2.5 opacity-40">
                    <Circle className="h-5 w-5 shrink-0 text-zinc-500" />
                    <span className="text-sm text-zinc-400">{step.label}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
