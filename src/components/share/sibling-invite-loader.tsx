'use client';

/**
 * Ticket 0060 — client-side loader for the SiblingInviteCard.
 *
 * The parent portal at /share/[token] is a SERVER component. We want the
 * candidate-lookup to live on the public API (so the route is the single
 * place schema reads happen), not in `getShareData()` — keeping the
 * existing /api/share/[token] GET response byte-identical per the AC
 * regression box. This thin wrapper mounts under the existing 0011
 * "Share with your other coach" CTA, fetches the candidate once on mount,
 * and renders the real card with the resolved props.
 *
 * The card itself decides whether to render nothing (null candidate +
 * not-already-on-SportsIQ), the self-signup pivot, or the invite sheet.
 */

import { useEffect, useState } from 'react';
import {
  SiblingInviteCard,
  type SiblingInviteCandidate,
} from './sibling-invite-card';

interface SiblingInviteLoaderProps {
  shareToken: string;
  /** The PROGRAM-scoped referral code (the same value the page already
   *  resolved server-side for the existing 0011 card). */
  referralCode: string | null;
}

interface CandidateResponse {
  candidate: SiblingInviteCandidate | null;
  alreadyOnSportsIQ: boolean;
}

export function SiblingInviteLoader({
  shareToken,
  referralCode,
}: SiblingInviteLoaderProps) {
  const [resolved, setResolved] = useState<CandidateResponse | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/share/${shareToken}/sibling-invite-candidate`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          if (!cancelled) setErrored(true);
          return;
        }
        const json = (await res.json()) as CandidateResponse;
        if (!cancelled) setResolved(json);
      } catch {
        if (!cancelled) setErrored(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shareToken]);

  if (errored || !resolved) {
    // A degraded fetch must NEVER break the rest of the parent portal —
    // render nothing rather than an error state. The 0011 card sitting
    // above still does its job, and a refresh re-tries the lookup.
    return null;
  }

  return (
    <SiblingInviteCard
      shareToken={shareToken}
      candidate={resolved.candidate}
      alreadyOnSportsIQ={resolved.alreadyOnSportsIQ}
      referralCode={referralCode}
    />
  );
}
