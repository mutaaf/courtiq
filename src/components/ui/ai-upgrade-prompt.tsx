'use client';

import { Sparkles, ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from './button';

interface AIUpgradePromptProps {
  /** Error message returned by the API (includes the monthly limit info) */
  message?: string;
  /** Optional context label shown above the message (e.g. "Observation Segmentation") */
  feature?: string;
}

/**
 * Shown in place of an AI feature card when the server returns status 402
 * with `upgrade: true` — meaning the free-tier monthly AI quota is exhausted.
 */
export function AIUpgradePrompt({ message, feature }: AIUpgradePromptProps) {
  return (
    <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-zinc-900/60 to-zinc-900/80 p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/20">
        <Lock className="h-7 w-7 text-orange-400" />
      </div>

      <h3 className="text-base font-semibold text-zinc-100">
        Monthly AI limit reached
      </h3>

      {feature && (
        <p className="mt-0.5 text-xs text-zinc-500">{feature}</p>
      )}

      <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
        {message ||
          "You've used all AI calls included in your free plan this month. Upgrade to Coach for unlimited AI observations, practice plans, and player reports."}
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href="/settings/upgrade">
          <Button className="gap-2 w-full sm:w-auto shadow-lg shadow-orange-500/20">
            <Sparkles className="h-4 w-4" />
            Upgrade to Coach
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Link href="/settings/upgrade">
          <Button variant="outline" size="sm" className="w-full sm:w-auto border-zinc-700 text-zinc-400 hover:text-zinc-200">
            View all plans
          </Button>
        </Link>
      </div>

      <p className="mt-4 text-[11px] text-zinc-600">
        Resets on the 1st of next month &middot; No credit card required to start
      </p>
    </div>
  );
}
