import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Public routes — no auth required
  const publicPaths = [
    '/share/',
    '/api/share/',
    // Public coach-to-coach referral card (ticket 0010) — page + its API + OG image.
    '/team-card/',
    '/api/team-card/',
    // Public season-recap card (ticket 0017) — page + its API.
    '/season-recap/',
    '/api/season-recap/',
    // Public coach profile card (ticket 0026) — the page + its public token GET.
    // /api/coach-card/create is NOT a public surface: it self-enforces auth in
    // the handler (auth.getUser() → 401), exactly like the team-card / season-recap
    // create routes do, so a blanket prefix here never bypasses that 401 guard.
    '/coach/',
    '/api/coach-card/',
    // Public game-recap card (ticket 0027) — the page + its public token GET.
    // /api/recap-card/create is NOT a public surface: it self-enforces auth in the
    // handler (auth.getUser() → 401), so the blanket prefix never bypasses that.
    '/recap/',
    '/api/recap-card/',
    // Public practice-plan share (ticket 0049) — page + its public token GET.
    // /api/practice-plan-shares/create, /clone, /clone-count, /clone-count/seen
    // are NOT public surfaces: each self-enforces auth in the handler
    // (auth.getUser() → 401), so the blanket prefix here never bypasses that
    // guard. The /plan/ page is the cold-search-reachable surface.
    '/plan/',
    '/api/practice-plan-shares/',
    // Public weekly-pulse share (ticket 0057) — page + its public token GET.
    // /api/weekly-pulse/create and /api/weekly-pulse/preview are NOT public
    // surfaces: each self-enforces auth in the handler (auth.getUser() → 401),
    // so the blanket prefix here never bypasses that guard. The /week/ page
    // is the cold-search-reachable surface dropped in league group chats.
    '/week/',
    '/api/weekly-pulse/',
    // Public referral lookup (ticket 0021) — names the inviting coach on the
    // warm signup landing. Returns the referrer's first name only, no auth.
    '/api/referrals/lookup',
    '/observe/',
    '/api/observe/',
    '/parents/',
    '/api/parents/join',
    '/org/',
    '/api/org/',
    // Public program directory (ticket 0033) — the page + its public list API.
    // A cold searcher finds their league here and taps through to /org/<slug> to
    // claim the team they coach. Org-level/aggregate data only (opt-in required).
    '/programs',
    '/api/programs',
    '/api/health',
    '/api/debug',
    '/api/auth/',
    '/api/stripe/webhook',
    '/api/parent-reactions',
    '/api/ai/demo-segment',
    '/login',
    '/signup',
    '/onboarding',
    '/demo',
    '/offline',
    '/terms',
    '/privacy',
    // The dynamic sitemap (ticket 0038) and the static robots.txt are public
    // by definition — every search-engine crawler hits them without auth, so
    // they must NOT redirect to /login. The sitemap itself only emits public
    // org slugs + opaque share tokens (no per-coach / per-minor data); the
    // /share/<token> portal is excluded by the sitemap and marked
    // robots:noindex at the page level.
    '/sitemap.xml',
    '/robots.txt',
    // Public pause-confirmation landing (ticket 0042) — the polite "Still
    // coaching this season?" email's "Pause for 30 days" link drops the coach
    // here with a signed `?token=…`. The page itself self-verifies the token
    // (no DB lookup on a bad token) and only writes paused_until on success.
    // `/account` (no `/pause` suffix) is NOT in this list — the unpause
    // surface stays behind auth.
    '/account/pause',
    // Ticket 0058 — the Sunday-evening plan-finish prompt cron self-enforces
    // auth via the CRON_SECRET bearer (mirrors weekly-digest / practice-
    // reminder). Vercel Cron hits this route with the Bearer header; the
    // e2e spec hits it from Playwright with the same header. The supabase
    // proxy must NOT short-circuit either with a 401 — the route's own
    // CRON_SECRET check is the load-bearing gate (LESSONS#0038 family —
    // when a new public route a non-browser caller must reach is added,
    // add it to publicPaths).
    '/api/cron/sunday-plan-prompt',
    // Ticket 0062 — the Thursday-evening silent-player-nudge cron. Same
    // posture as 0058: CRON_SECRET-bearer self-enforced, Vercel Cron + the
    // e2e spec POST it directly, the proxy must not 401 it before the
    // route's own check runs (LESSONS#0104).
    '/api/cron/silent-player-nudge',
    // Ticket 0064 — single-drill publish-and-clone surface. The page at
    // /drill/<token> + the public token GET at /api/drill-shares/<token>
    // are crawler-reachable without auth (cold visitors hit them before
    // sign-in). /api/drill-shares/create, /clone, /unpublish, and /mine
    // are NOT public surfaces: each self-enforces auth in the handler
    // (auth.getUser() → 401), so the blanket /api/drill-shares/ prefix
    // here never bypasses that guard (same posture as
    // /api/practice-plan-shares/ already uses for 0049).
    '/drill/',
    '/api/drill-shares/',
    // Ticket 0067 — substitute-coach Tuesday-night handoff. The page at
    // /sub/<token> + the public token GET at /api/sub-handoff/<token> +
    // the sub-note POST at /api/sub-handoff/<token>/sub-note are visited
    // by a parent volunteer who has no account by design. The /create,
    // /recent-notes, and /recent-notes/seen routes are NOT public
    // surfaces: each self-enforces auth in the handler (auth.getUser()
    // → 401), so the blanket /api/sub-handoff/ prefix here never
    // bypasses that guard (same posture as /api/practice-plan-shares/
    // for 0049 and /api/drill-shares/ for 0064). The sub-handoff is
    // NOT in the sitemap — 24h-scoped, non-crawlable by design.
    '/sub/',
    '/api/sub-handoff/',
  ];
  if (pathname === '/' || publicPaths.some((p) => pathname.startsWith(p))) {
    return supabaseResponse;
  }

  // Protected routes — redirect to login if not authenticated
  if (!user && !pathname.startsWith('/api/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // API routes — return 401
  if (!user && pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return supabaseResponse;
}
