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
    // Public referral lookup (ticket 0021) — names the inviting coach on the
    // warm signup landing. Returns the referrer's first name only, no auth.
    '/api/referrals/lookup',
    '/observe/',
    '/api/observe/',
    '/parents/',
    '/api/parents/join',
    '/org/',
    '/api/org/',
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
