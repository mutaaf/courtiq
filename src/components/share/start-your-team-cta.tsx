import { Rocket, ArrowRight } from 'lucide-react';

interface StartYourTeamCTAProps {
  // Ticket 0019: the creating coach's referral code, resolved server-side by
  // GET /api/share/[token] (ticket 0011) and passed straight down. When present
  // the self-signup link carries /signup?ref=<code> so the originating coach
  // earns the referral credit; null/absent/empty falls back to a bare /signup so
  // a missing code never breaks the CTA (same defensive fallback as the forward
  // button). COPPA: the href carries ONLY the referral code — no player name, no
  // parent contact, no token-derived PII (the component never receives any).
  referralCode?: string | null;
}

/**
 * The portal's SECOND, distinct CTA (ticket 0019): a direct "Start your own team"
 * self-signup path for the parent who is themselves a coach. Deliberately a plain
 * server-rendered <a href> — NOT a JS share handler like ParentViralCTA — so it
 * works even on a flaky connection with nothing else loaded. It sits alongside
 * the forward button; it does not replace it.
 */
export function StartYourTeamCTA({ referralCode }: StartYourTeamCTAProps) {
  const href = referralCode ? `/signup?ref=${referralCode}` : '/signup';

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100">
          <Rocket className="h-4 w-4 text-orange-500" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-snug text-gray-900">
            Coach another team yourself?
          </p>
          <p className="mt-1 text-xs leading-relaxed text-gray-500">
            Set up your own team and start tracking player progress like this. It&apos;s free to
            begin, and you can capture an observation in about 20 seconds.
          </p>
        </div>
      </div>

      <a
        href={href}
        // A plain link, not a JS share handler — the CTA works without client JS
        // and is assertable by href directly (ticket 0019). 44px touch target.
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-medium text-white shadow-sm transition-all hover:bg-orange-600 active:scale-[0.98] touch-manipulation"
      >
        Start your own team — free
        <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-70" />
      </a>
    </div>
  );
}
