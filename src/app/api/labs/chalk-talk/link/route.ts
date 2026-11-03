import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createLinkToken, safeReturn } from '@/lib/chalk-talk-link';

// POST { return } → { url }: the standalone board's address with a link token in the fragment (a fragment is
// never sent to any server). Called by /labs/chalk-talk/connect for a signed-in coach.
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in.' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  try {
    return NextResponse.json({ url: safeReturn(body?.return || null) + '#ct-link=' + createLinkToken(user.id) });
  } catch {
    return NextResponse.json({ error: 'Linking isn’t configured.' }, { status: 503 });
  }
}
