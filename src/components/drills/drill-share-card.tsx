'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Loader2 } from 'lucide-react';
import { FollowCoachInlineCard } from '@/components/plan/follow-coach-inline-card';

// Ticket 0064 — the public /drill/[token] body, extracted for
// unit-testability per LESSONS#0060.
//
// Renders:
//   - The drill name as the H1
//   - Sport / age-group hint as the small header line
//   - The drill's setup_instructions as the body (3–5 short lines)
//   - The publishing coach's optional caption in a quoted block
//   - A single "Save to my library" button (the only CTA)
//   - On clone-success: the 0063 <FollowCoachInlineCard> below the button
//
// Theme: parent-portal aesthetic (gray-50 + orange accent), NOT the dark
// dashboard. Same posture as /plan/[token] (0049) and /share/[token] (the
// parent portal).
//
// Voice: clipboard, not consumer-SaaS. No AGENTS.md banned words in any
// rendered string (the caption is the only coach-typed surface and is
// voice-scanned at the route layer; LESSONS#0023).
//
// data-testid + data-share-url on the save button per LESSONS#0056 /
// #0082 so vitest + Playwright can scope cleanly.

export interface DrillShareCardProps {
  token: string;
  drill: {
    id: string;
    name: string;
    setup: string | null;
    sportSlug: string | null;
    ageGroupHint: string | null;
  };
  caption: string | null;
  publisher: {
    id: string;
    firstName: string | null;
    handle: string | null;
  };
}

interface MeResponse {
  coach?: { id: string } | null;
}

export function DrillShareCard({
  token,
  drill,
  caption,
  publisher,
}: DrillShareCardProps) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meReady, setMeReady] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/me')
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setMe(null);
        } else {
          const data = (await res.json().catch(() => null)) as MeResponse | null;
          setMe(data);
        }
      })
      .catch(() => {
        if (!cancelled) setMe(null);
      })
      .finally(() => {
        if (!cancelled) setMeReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const coachId = me?.coach?.id ?? null;
  const viewerIsSignedIn = !!coachId;
  const publicUrl = `/drill/${token}`;

  async function save() {
    setPhase('saving');
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/drill-shares/${encodeURIComponent(token)}/clone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || 'Could not save drill');
      }
      setPhase('saved');
    } catch (e: unknown) {
      setErrorMessage(e instanceof Error ? e.message : 'Could not save drill');
      setPhase('error');
    }
  }

  // Header line: "Coach <First Name> — <sport> — <age band>" with sensible
  // fallbacks when any piece is missing.
  const headerParts: string[] = [];
  if (publisher.firstName) headerParts.push(`Coach ${publisher.firstName}`);
  if (drill.sportSlug) headerParts.push(capitalizeSport(drill.sportSlug));
  if (drill.ageGroupHint) headerParts.push(drill.ageGroupHint);
  const header = headerParts.join(' — ');

  // Split setup into short lines for the body. The drill library stores
  // setup_instructions as a free-form text block; we render newlines as
  // paragraph breaks.
  const setupLines = (drill.setup ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return (
    <div
      data-testid="drill-share-card"
      data-share-url={publicUrl}
      className="mx-auto max-w-2xl px-5 pb-12 pt-10"
    >
      {/* Brand */}
      <div className="mb-6 flex items-center justify-center gap-2">
        <span className="text-sm font-bold uppercase tracking-[0.2em] text-gray-500">
          SportsIQ
        </span>
        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-0.5 text-[11px] text-gray-500">
          Drill
        </span>
      </div>

      {/* Header card */}
      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        {header.length > 0 && (
          <p className="text-xs uppercase tracking-widest text-gray-500">{header}</p>
        )}
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-gray-900">
          {drill.name}
        </h1>

        {setupLines.length > 0 && (
          <div className="mt-4 space-y-2 text-sm leading-relaxed text-gray-700">
            {setupLines.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        {caption && (
          <div
            data-testid="drill-share-caption"
            className="mt-4 rounded-xl bg-orange-50 px-4 py-3 text-sm leading-relaxed text-gray-800"
          >
            <p>&ldquo;{caption}&rdquo;</p>
            {publisher.firstName && (
              <p className="mt-1 text-xs uppercase tracking-widest text-orange-600">
                — Coach {publisher.firstName}
              </p>
            )}
          </div>
        )}
      </div>

      {/* CTA — single button, the only thing the page is asking the visitor to do */}
      <div className="mt-5">
        {!meReady ? (
          <button
            disabled
            data-testid="save-drill-cta"
            data-share-url={publicUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500/70 px-5 py-3.5 text-base font-semibold text-white"
            aria-label="Save to my library"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Save to my library
          </button>
        ) : phase === 'saved' ? (
          <div className="space-y-3">
            <div
              data-testid="drill-cloned-success"
              className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800"
            >
              <Check className="h-4 w-4" />
              <span>Saved to your library.</span>
              <Link
                href="/drills"
                className="ml-auto text-xs font-medium text-green-700 underline hover:text-green-900"
              >
                Open in your library
              </Link>
            </div>
            {publisher.firstName && publisher.id && (
              <FollowCoachInlineCard
                publisherCoachId={publisher.id}
                publisherFirstName={publisher.firstName}
                token={token}
                viewerIsSignedIn={viewerIsSignedIn}
              />
            )}
          </div>
        ) : !viewerIsSignedIn ? (
          <a
            href={`/login?next=${encodeURIComponent(publicUrl)}`}
            data-testid="save-drill-cta"
            data-share-url={publicUrl}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-semibold text-white hover:bg-orange-600 active:scale-[0.98] touch-manipulation transition-all"
            aria-label="Save to my library"
          >
            Save to my library
          </a>
        ) : (
          <>
            <button
              type="button"
              onClick={save}
              disabled={phase === 'saving'}
              data-testid="save-drill-cta"
              data-share-url={publicUrl}
              aria-label="Save to my library"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3.5 text-base font-semibold text-white hover:bg-orange-600 active:scale-[0.98] disabled:opacity-60 touch-manipulation transition-all"
            >
              {phase === 'saving' ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Save to my library
                </>
              )}
            </button>
            {phase === 'error' && errorMessage && (
              <p className="mt-2 text-xs text-red-600" role="alert">
                {errorMessage}
              </p>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="mt-10 text-center">
        <p className="text-xs text-gray-500">
          Powered by <span className="font-semibold text-gray-700">SportsIQ</span>
        </p>
        <div className="mt-1 flex justify-center gap-3 text-xs text-gray-500">
          <Link href="/privacy" className="underline hover:text-gray-700">
            Privacy
          </Link>
          <Link href="/terms" className="underline hover:text-gray-700">
            Terms
          </Link>
        </div>
      </div>
    </div>
  );
}

function capitalizeSport(slug: string): string {
  if (!slug) return '';
  return slug.charAt(0).toUpperCase() + slug.slice(1);
}
