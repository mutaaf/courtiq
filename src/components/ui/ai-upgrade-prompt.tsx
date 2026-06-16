'use client';

import { Sparkles, ArrowRight, Lock } from 'lucide-react';
import Link from 'next/link';
import { Button } from './button';

interface AIUpgradePromptProps {
  /** Error message returned by the API (includes the monthly limit info) */
  message?: string;
  /** Optional context label shown above the message (e.g. "Observation Segmentation") */
  feature?: string;
  /**
   * Optional opaque resume token describing the in-flight blocked action
   * (`{action}:{teamId}[:{playerId}]`, ticket 0035). When supplied, it is appended
   * to the upgrade links so it survives the Stripe round-trip and the post-checkout
   * landing drops the coach back on the exact artifact. Built CLIENT-side by the
   * surface that knows the blocked action (e.g. the parent report knows the
   * playerId); surfaces that can't form a clean target simply omit it.
   */
  resume?: string;
  /**
   * Short, human-readable name of the blocked artifact (e.g. "Maya's report").
   * When provided alongside `resume`, the headline names it so the coach sees the
   * upgrade finish the exact thing they were making; otherwise the generic copy
   * is used. Speak like a clipboard, never a marketing page (AGENTS.md banned words).
   */
  resumeLabel?: string;
  /**
   * Optional ticket-0084 social-proof block — a short factual line describing
   * a recent viral event attributable to the calling coach (a parent forward,
   * a drill clone, a stick signal, or a reputation milestone). When supplied,
   * the line renders inside a stable `data-testid="upgrade-prompt-social-proof"`
   * container under the headline; when absent, the component DOM is byte-
   * identical to the 0035 baseline (LESSONS#0103 — optional widening). The
   * line is built server-side from durable persisted rows (never an LLM
   * hallucination) and is expected to be a clipboard-tone statement.
   */
  socialProof?: { line: string; eventKind: string };
}

/**
 * Shown in place of an AI feature card when the server returns status 402
 * with `upgrade: true` — meaning the free-tier monthly AI quota is exhausted.
 */
export function AIUpgradePrompt({ message, feature, resume, resumeLabel, socialProof }: AIUpgradePromptProps) {
  // Carry the validated-at-checkout resume token through the upgrade round-trip.
  const upgradeHref = resume
    ? `/settings/upgrade?resume=${encodeURIComponent(resume)}`
    : '/settings/upgrade';

  // When the surface named the blocked artifact, the headline + primary CTA finish
  // that exact thing; otherwise fall back to today's generic copy.
  const namesArtifact = Boolean(resume && resumeLabel);
  const headline = namesArtifact ? `Out of free AI this month` : 'Monthly AI limit reached';
  const ctaLabel = namesArtifact ? `Upgrade and finish ${resumeLabel}` : 'Upgrade to Coach';

  return (
    <div className="rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-zinc-900/60 to-zinc-900/80 p-6 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-500/20">
        <Lock className="h-7 w-7 text-orange-400" />
      </div>

      <h3 className="text-base font-semibold text-zinc-100">{headline}</h3>

      {feature && (
        <p className="mt-0.5 text-xs text-zinc-500">{feature}</p>
      )}

      {socialProof && (
        // Ticket 0084 — one short factual line under the headline. The
        // data-testid lets e2e specs scope a strict assertion to this
        // surface (LESSONS#0029 / #0082). No icon, no button — pure
        // factual statement. The line is built server-side from
        // durable persisted rows; never a generated string.
        <p
          data-testid="upgrade-prompt-social-proof"
          data-event-kind={socialProof.eventKind}
          className="mt-2 text-[13px] text-zinc-400 leading-snug max-w-xs mx-auto"
        >
          {socialProof.line}
        </p>
      )}

      <p className="mt-2 text-sm text-zinc-400 leading-relaxed max-w-xs mx-auto">
        {message ||
          (namesArtifact
            ? `Upgrade to Coach and I'll finish ${resumeLabel} right now — you'll land back on it the moment your plan is active.`
            : "You've used all AI calls included in your free plan this month. Upgrade to Coach for unlimited AI observations, practice plans, and player reports.")}
      </p>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <Link href={upgradeHref}>
          <Button className="gap-2 w-full sm:w-auto shadow-lg shadow-orange-500/20">
            <Sparkles className="h-4 w-4" />
            {ctaLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
        <Link href={upgradeHref}>
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
